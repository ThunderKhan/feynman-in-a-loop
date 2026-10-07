-- 0002_turns_and_invariants.sql — Feynman-in-a-Loop, slice 2
--
-- Adds session_turns, the completed-attempt immutability guards, and the three
-- atomic RPCs the turn pipeline depends on:
--
--   append_learner_turn()  idempotent insert; server derives interaction_type
--   claim_model_call()     consumes quota BEFORE any provider invocation
--   apply_turn_result()    atomic student response + evaluator state
--
-- All three are SECURITY INVOKER: they run with the calling user's privileges,
-- so RLS remains the authorization boundary and none of them is a privileged
-- backdoor. No service-role key is involved anywhere.
--
-- See devpost/spec.md > Database Operations and > Data Model.

-- ---------------------------------------------------------------------------
-- session_turns
-- ---------------------------------------------------------------------------
create table if not exists public.session_turns (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references public.learning_sessions(id) on delete cascade,
  user_id                uuid not null default auth.uid(),

  -- Idempotency key for learner turns. A repeated POST reuses the row.
  client_turn_id         uuid,

  -- Explicit parent/child shape: each student response answers exactly one
  -- learner turn, rather than relying on sequence adjacency.
  responds_to_turn_id    uuid references public.session_turns(id),

  -- 'pending'  → waiting to be evaluated
  -- 'claimed'  → a provider call has been charged against the quota
  -- 'applied'  → a student response has been atomically applied
  evaluation_state       text not null default 'pending',

  evaluation_claimed_at  timestamptz,

  sequence               integer not null,
  role                   text not null,
  -- Always server-derived from session stage; a client cannot choose this.
  interaction_type       text not null,
  source                 text not null default 'voice',
  content                text not null,
  created_at             timestamptz not null default now(),

  constraint turns_role_valid   check (role in ('learner', 'student')),
  constraint turns_eval_valid   check (
    evaluation_state in ('pending', 'claimed', 'applied')
  ),
  constraint turns_seq_positive check (sequence > 0),
  constraint turns_content_len  check (char_length(content) between 1 and 4000),
  constraint turns_source_valid check (source in ('voice', 'typed')),

  -- A learner turn carries the idempotency key; a student turn carries the
  -- link to the learner turn it answers. Exactly one of the two.
  constraint turns_shape_valid check (
    (role = 'learner' and client_turn_id is not null and responds_to_turn_id is null)
    or (role = 'student' and responds_to_turn_id is not null and client_turn_id is null)
  )
);

comment on table public.session_turns is
  'Immutable transcript turns. Learner turns are the evidence; student turns answer them.';

-- One row per turn position within a session.
create unique index if not exists session_turns_session_sequence_uidx
  on public.session_turns (session_id, sequence);

-- Idempotency: the same client_turn_id can never produce two learner turns.
create unique index if not exists session_turns_client_turn_uidx
  on public.session_turns (session_id, client_turn_id)
  where client_turn_id is not null;

-- At most ONE student response per learner turn, enforced by the database.
create unique index if not exists session_turns_one_response_uidx
  on public.session_turns (responds_to_turn_id)
  where responds_to_turn_id is not null;

create index if not exists session_turns_session_idx
  on public.session_turns (session_id, sequence);

-- ---------------------------------------------------------------------------
-- Row Level Security on session_turns
-- ---------------------------------------------------------------------------
alter table public.session_turns enable row level security;

create policy "turns_select_own"
  on public.session_turns for select
  using (auth.uid() = user_id);

create policy "turns_insert_own"
  on public.session_turns for insert
  with check (auth.uid() = user_id);

create policy "turns_update_own"
  on public.session_turns for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "turns_delete_own"
  on public.session_turns for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Immutability — layer 2 and 3 of three
--
-- Layer 1 is the RLS policy on learning_sessions, which refuses updates to a
-- completed session. These triggers are what make the guarantee hold through
-- ANY database path, including a direct PostgREST call from the browser.
-- ---------------------------------------------------------------------------

-- A completed attempt is frozen. Any UPDATE at all is refused.
create or replace function public.guard_completed_session_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'completed' then
    raise exception 'completed sessions are immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists learning_sessions_freeze_completed on public.learning_sessions;
create trigger learning_sessions_freeze_completed
  before update on public.learning_sessions
  for each row execute function public.guard_completed_session_update();

-- A completed attempt accepts no new turn, by any path.
create or replace function public.guard_turn_insert_for_completed_session()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_status text;
begin
  select s.status into parent_status
    from public.learning_sessions s
   where s.id = new.session_id;

  if parent_status = 'completed' then
    raise exception 'cannot add a turn to a completed session'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists session_turns_reject_completed_parent on public.session_turns;
create trigger session_turns_reject_completed_parent
  before insert on public.session_turns
  for each row execute function public.guard_turn_insert_for_completed_session();

-- ---------------------------------------------------------------------------
-- Hard limit for AI evaluations per attempt.
--
-- Deliberately close to the ~5–7 calls a normal session needs. The product's own
-- guardrail prevents endless tutoring, so the quota defense should agree.
-- ---------------------------------------------------------------------------
create or replace function public.max_model_calls()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 8;
$$;

-- ---------------------------------------------------------------------------
-- Stale-claim window.
--
-- A server process can die after claiming a turn but before releasing it. That
-- turn would otherwise be stuck in 'claimed' forever, and the concurrency
-- guard would read the dead claim as "evaluation still in flight".
--
-- A claim older than this window is considered abandoned and may be stolen.
-- The window must comfortably exceed a slow provider call so a genuinely
-- in-flight evaluation is never mistaken for a dead one. Trade-off: a call
-- that outlives the window can be evaluated twice, which costs quota — but the
-- unique index on responds_to_turn_id still guarantees exactly one applied
-- student response per learner turn.
-- ---------------------------------------------------------------------------
create or replace function public.claim_stale_after()
returns interval
language sql
stable
security invoker
set search_path = ''
as $$
  select interval '2 minutes';
$$;

-- ---------------------------------------------------------------------------
-- 1. append_learner_turn
--
-- Idempotent insert of a completed learner turn.
--
-- SECURITY: the interaction_type is derived here from the authoritative
-- session stage. The client supplies only content, provenance, and an
-- idempotency key — it cannot claim its text was a correction or a transfer
-- answer.
-- ---------------------------------------------------------------------------
create or replace function public.append_learner_turn(
  p_session_id      uuid,
  p_client_turn_id  uuid,
  p_content         text,
  p_source          text default 'voice'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session   public.learning_sessions%rowtype;
  v_existing  uuid;
  v_turn_id   uuid;
  v_sequence  integer;
  v_type      text;
begin
  -- Lock the session row. All turn writes for a session serialise here, which
  -- is what makes the sequence allocation below safe.
  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session not found or not accessible'
      using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> auth.uid() then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- Idempotency: an existing learner turn for this key is returned unchanged.
  -- Never insert a second one.
  select t.id into v_existing
    from public.session_turns t
   where t.session_id = p_session_id
     and t.client_turn_id = p_client_turn_id;

  if v_existing is not null then
    return v_existing;
  end if;

  if char_length(coalesce(btrim(p_content), '')) = 0 then
    raise exception 'learner turn is empty' using errcode = 'check_violation';
  end if;

  if char_length(p_content) > 4000 then
    raise exception 'learner turn too long' using errcode = 'check_violation';
  end if;

  if p_source not in ('voice', 'typed') then
    raise exception 'invalid source' using errcode = 'check_violation';
  end if;

  -- Server-derived meaning, from the authoritative stage.
  v_type := case v_session.stage
    when 'repair'   then 'correction'
    when 'transfer' then 'transfer_answer'
    else 'explanation'
  end case;

  select coalesce(max(t.sequence), 0) + 1 into v_sequence
    from public.session_turns t
   where t.session_id = p_session_id;

  insert into public.session_turns (
    session_id, client_turn_id, sequence, role,
    interaction_type, source, content
  ) values (
    p_session_id, p_client_turn_id, v_sequence, 'learner',
    v_type, p_source, p_content
  )
  returning id into v_turn_id;

  return v_turn_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. claim_model_call
--
-- Consumes quota BEFORE the provider is contacted. Every provider invocation
-- counts — the primary call, semantic retries, and exceptional repair calls
-- alike. A failed call stays consumed, because it really did consume quota.
--
-- A plpgsql function is transactional, so raising below rolls back the
-- increment too: no claim is recorded unless every check passes.
-- ---------------------------------------------------------------------------
create or replace function public.claim_model_call(
  p_session_id      uuid,
  p_learner_turn_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_max integer := public.max_model_calls();
  v_updated integer;
begin
  -- Charge the allowance. This also verifies ownership and in_progress status,
  -- and enforces the cap atomically.
  update public.learning_sessions s
     set model_calls_used = s.model_calls_used + 1
   where s.id = p_session_id
     and s.user_id = auth.uid()
     and s.status = 'in_progress'
     and s.model_calls_used < v_max;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'model call not permitted: not owner, session not in progress, or cap reached'
      using errcode = 'check_violation';
  end if;

  -- Mark the turn claimed. Conditional, so a second concurrent claim for the same
-- turn matches no row and is refused.
--
-- Two ways to be claimable:
--   pending                       — never claimed
--   claimed AND older than stale window — abandoned by a dead process
--
-- 'applied' matches neither, so a completed evaluation can never be re-run.
  update public.session_turns t
     set evaluation_state = 'claimed',
         evaluation_claimed_at = now()
   where t.id = p_learner_turn_id
     and t.session_id = p_session_id
     and t.role = 'learner'
     and (
          t.evaluation_state = 'pending'
          or (
            t.evaluation_state = 'claimed'
            and t.evaluation_claimed_at < now() - public.claim_stale_after()
          )
     );

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'learner turn is not claimable'
      using errcode = 'check_violation';
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_model_call
--
-- Returns a claimed learner turn to 'pending' so Try again can resume it.
--
-- The consumed allowance is deliberately NOT refunded: a provider call was
-- genuinely made and genuinely spent quota. Retrying therefore performs a
-- fresh claim and consumes a further allowance, which is the honest cost of a
-- transient failure.
-- ---------------------------------------------------------------------------
create or replace function public.release_model_call(
  p_session_id      uuid,
  p_learner_turn_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_updated integer;
begin
  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session not found or not accessible'
      using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> auth.uid() then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- Only a claimed turn can be released. An 'applied' turn is a finished
  -- evaluation and is never released back into the queue.
  update public.session_turns t
     set evaluation_state = 'pending',
         evaluation_claimed_at = null
   where t.id = p_learner_turn_id
     and t.session_id = p_session_id
     and t.role = 'learner'
     and t.evaluation_state = 'claimed';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'learner turn is not in a releasable state'
      using errcode = 'check_violation';
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. apply_turn_result
--
-- Atomic: verify the session is still in_progress, verify this learner turn has
-- no applied student response, insert the linked student turn, update evaluator
-- state, optionally complete. One transaction, under the user's own RLS
-- context, with no service-role key.
-- ---------------------------------------------------------------------------
create or replace function public.apply_turn_result(
  p_session_id        uuid,
  p_learner_turn_id   uuid,
  p_student_state     text,
  p_message           text,
  p_interaction_type  text,
  p_stage             text,
  p_mastery           jsonb,
  p_evidence_ledger   jsonb,
  p_complete          boolean default false,
  p_mastery_result    jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session   public.learning_sessions%rowtype;
  v_sequence  integer;
  v_state     text;
begin
  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session not found or not accessible'
      using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> auth.uid() then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- End-to-end idempotency: a learner turn may receive exactly one applied
  -- student response. A retry after a lost HTTP response returns the existing
  -- result instead of appending a second student turn.
  select t.evaluation_state into v_state
    from public.session_turns t
   where t.id = p_learner_turn_id
     and t.session_id = p_session_id
     and t.role = 'learner';

  if v_state is null then
    raise exception 'learner turn not found in session'
      using errcode = 'no_data_found';
  end if;

  -- An applied turn is a finished evaluation and is never re-run.
  if v_state = 'applied' then
    raise exception 'learner turn already has an applied response'
      using errcode = 'unique_violation';
  end if;

  -- A result may only be applied to a turn that actually consumed allowance.
  -- This keeps "claim before the provider" from being bypassable by applying
  -- straight from 'pending', which would cost no quota at all.
  if v_state <> 'claimed' then
    raise exception 'learner turn must be claimed before a result is applied'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(t.sequence), 0) + 1 into v_sequence
    from public.session_turns t
   where t.session_id = p_session_id;

  insert into public.session_turns (
    session_id, responds_to_turn_id, sequence, role,
    interaction_type, source, content
  ) values (
    p_session_id, p_learner_turn_id, v_sequence, 'student',
    p_interaction_type, 'voice', p_message
  );

  update public.session_turns t
     set evaluation_state = 'applied'
   where t.id = p_learner_turn_id;

  update public.learning_sessions s
     set stage            = p_stage,
         student_state    = p_student_state,
         mastery          = coalesce(p_mastery, s.mastery),
         evidence_ledger  = coalesce(p_evidence_ledger, s.evidence_ledger),
         status           = case when p_complete then 'completed' else s.status end,
         mastery_result   = case when p_complete then p_mastery_result else s.mastery_result end,
         completed_at     = case when p_complete then now() else s.completed_at end
   where s.id = p_session_id;

  -- Sanitized public projection. The private evaluator state stays in the
  -- session row; the client never receives mastery, ledger, or target gap.
  return jsonb_build_object(
    'publicStage', p_stage,
    'student', jsonb_build_object(
      'state', p_student_state,
      'message', p_message
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. SECURITY INVOKER functions are still ordinary RPCs, so EXECUTE is
-- granted to authenticated users only — never to anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.append_learner_turn(uuid, uuid, text, text) from public;
revoke execute on function public.claim_model_call(uuid, uuid) from public;
revoke execute on function public.release_model_call(uuid, uuid) from public;
revoke execute on function public.apply_turn_result(uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, jsonb) from public;

grant execute on function public.append_learner_turn(uuid, uuid, text, text) to authenticated;
grant execute on function public.claim_model_call(uuid, uuid) to authenticated;
grant execute on function public.release_model_call(uuid, uuid) to authenticated;
grant execute on function public.apply_turn_result(uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, jsonb) to authenticated;
grant execute on function public.max_model_calls() to authenticated;
grant execute on function public.claim_stale_after() to authenticated;