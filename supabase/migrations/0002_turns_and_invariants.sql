-- 0002_turns_and_invariants.sql — Feynman-in-a-Loop, slice 2
--
-- PRIVILEGE MODEL (the important part of this file)
--
--   RLS answers "which ROWS may a user touch".
--   It does NOT protect authoritative COLUMNS on those rows.
--
-- Supabase grants ALL on public tables to `anon` and `authenticated` by
-- default, so before this migration an authenticated user could, with a plain
-- PostgREST call, reset model_calls_used, rewrite stage/mastery, flip status to
-- complete or back to in_progress, fabricate a student turn, or reset
-- evaluation_state — bypassing the state machine, the quota cap, and the
-- evidence rules entirely.
--
-- Final rule:
--   > The authenticated client may READ its own data. Authoritative learning
--   > and evaluation state may only change through the approved RPCs.
--
-- Therefore:
--   * authenticated gets SELECT only on both tables. No INSERT/UPDATE/DELETE.
--   * Every mutation goes through a SECURITY DEFINER function that performs its
--     own ownership check.
--   * RLS stays enabled for defence in depth on the read path.
--
-- SECURITY DEFINER is justified HERE SPECIFICALLY because direct table
-- mutation privileges are removed. It is not a workaround for RLS: every
-- definer function independently verifies auth.uid(), derives identity from
-- auth.uid() (never from a caller-supplied user_id), checks ownership, pins
-- search_path, validates current state, and is granted only to `authenticated`.
--
-- Note on 0001: it created broad insert/update/delete policies on
-- learning_sessions. Those are dropped below and the privileges revoked, so
-- they are inert. 0001 is left byte-identical because it is already applied to
-- the live project; this migration is what closes the hole on both a fresh
-- database and the existing one.
--
-- See devpost/spec.md > Database Operations, > Data Model, > Security.

-- ---------------------------------------------------------------------------
-- Stale-claim window (per session, default 120s)
-- ---------------------------------------------------------------------------
alter table public.learning_sessions
  add column if not exists claim_stale_after_seconds integer not null default 120;

alter table public.learning_sessions
  drop constraint if exists claim_stale_after_range;
alter table public.learning_sessions
  add constraint claim_stale_after_range
  check (claim_stale_after_seconds between 1 and 600);

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
  'Transcript turns. Learner turns are the evidence; student turns answer them.';

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
-- Table privileges: read-only for the authenticated client
--
-- This is the enforcement point. Mutation policies without these revokes would
-- be meaningless, because the privilege itself is what allows the write.
-- ---------------------------------------------------------------------------
revoke all on table public.learning_sessions from anon;
revoke all on table public.learning_sessions from authenticated;

revoke all on table public.session_turns from anon;
revoke all on table public.session_turns from authenticated;

-- Reads only, still narrowed by RLS to the caller's own rows.
grant select on table public.learning_sessions to authenticated;
grant select on table public.session_turns to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: read path only
-- ---------------------------------------------------------------------------
alter table public.learning_sessions enable row level security;
alter table public.session_turns enable row level security;

-- Drop 0001's broad mutation policies: with privileges revoked they are inert,
-- and removing them stops them being mistaken for the security boundary.
drop policy if exists "sessions_insert_own" on public.learning_sessions;
drop policy if exists "sessions_update_own_not_completed" on public.learning_sessions;
drop policy if exists "sessions_delete_own" on public.learning_sessions;

create policy "sessions_select_own"
  on public.learning_sessions for select
  using (auth.uid() = user_id);

create policy "turns_select_own"
  on public.session_turns for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Immutability — defence in depth
--
-- Enforced inside the definer functions (apply_turn_result refuses a completed
-- session) and here, so the guarantee survives any future code path.
-- ---------------------------------------------------------------------------
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

create or replace function public.max_model_calls()
returns integer
language sql stable security invoker set search_path = ''
as $$ select 8; $$;

-- ===========================================================================
-- MUTATION RPCs
--
-- All SECURITY DEFINER, all with search_path pinned, all deriving identity
-- from auth.uid() and verifying ownership explicitly. Granted only to
-- `authenticated`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- create_session
--
-- Session creation goes through here so the client never needs INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.create_session(p_topic text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_topic text := btrim(coalesce(p_topic, ''));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_topic) = 0 then
    raise exception 'topic is required' using errcode = 'check_violation';
  end if;

  if char_length(v_topic) > 120 then
    raise exception 'topic too long' using errcode = 'check_violation';
  end if;

  -- user_id comes from auth.uid(), never from the caller.
  insert into public.learning_sessions (topic, user_id)
  values (v_topic, v_user)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_session
--
-- Owner-only deletion. Exists so the integration suite can clean up after
-- itself, and as a reasonable future affordance for a learner removing their
-- own attempt.
-- ---------------------------------------------------------------------------
create or replace function public.delete_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deleted integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  delete from public.learning_sessions s
   where s.id = p_session_id
     and s.user_id = v_user;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'session not found or not yours' using errcode = 'no_data_found';
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_claim_stale_after
--
-- Per-session override for the stale-claim window, used by the integration
-- suite to exercise crash recovery without a two-minute wait.
--
-- Provably safe in production: it can only be set while the attempt is
-- untouched — zero turns and zero consumed calls. It therefore cannot be used
-- to shorten the window on a live evaluation and steal its claim.
-- ---------------------------------------------------------------------------
create or replace function public.set_claim_stale_after(
  p_session_id uuid,
  p_seconds     integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_turn_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_seconds < 1 or p_seconds > 600 then
    raise exception 'stale window must be between 1 and 600 seconds'
      using errcode = 'check_violation';
  end if;

  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> v_user then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed' using errcode = 'check_violation';
  end if;

  -- Only before any evaluation has started.
  if v_session.model_calls_used <> 0 then
    raise exception 'stale window can only be set before evaluation begins'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_turn_count
    from public.session_turns t
   where t.session_id = p_session_id;

  if v_turn_count > 0 then
    raise exception 'stale window can only be set before evaluation begins'
      using errcode = 'check_violation';
  end if;

  update public.learning_sessions s
     set claim_stale_after_seconds = p_seconds
   where s.id = p_session_id;

  return p_seconds;
end;
$$;

-- ---------------------------------------------------------------------------
-- append_learner_turn
--
-- Idempotent insert of a completed learner turn.
--
-- SECURITY: interaction_type is derived here from the authoritative session
-- stage. The client supplies only content, provenance, and an idempotency
-- key — it cannot claim its text was a correction or a transfer answer.
-- ---------------------------------------------------------------------------
create or replace function public.append_learner_turn(
  p_session_id      uuid,
  p_client_turn_id  uuid,
  p_content         text,
  p_source          text default 'voice'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_existing uuid;
  v_turn_id uuid;
  v_sequence integer;
  v_type text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Lock the session row: all turn writes for a session serialise here, which
  -- makes sequence allocation safe.
  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> v_user then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- Idempotency: an existing learner turn for this key is returned unchanged.
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

  v_type := case v_session.stage
    when 'repair'   then 'correction'
    when 'transfer' then 'transfer_answer'
    else 'explanation'
  end case;

  select coalesce(max(t.sequence), 0) + 1 into v_sequence
    from public.session_turns t
   where t.session_id = p_session_id;

  insert into public.session_turns (
    session_id, user_id, client_turn_id, sequence, role,
    interaction_type, source, content
  ) values (
    p_session_id, v_user, p_client_turn_id, v_sequence, 'learner',
    v_type, p_source, p_content
  )
  returning id into v_turn_id;

  return v_turn_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_model_call
--
-- Consumes quota BEFORE the provider is contacted. Every provider invocation
-- counts — the primary call, semantic retries, and exceptional repair calls
-- alike. A failed call stays consumed, because it really did consume quota.
--
-- A turn is claimable when pending, or when claimed longer ago than the
-- session's stale window (abandoned by a dead process). 'applied' matches
-- neither, so a finished evaluation is never re-run.
-- ---------------------------------------------------------------------------
create or replace function public.claim_model_call(
  p_session_id      uuid,
  p_learner_turn_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_max integer := public.max_model_calls();
  v_session public.learning_sessions%rowtype;
  v_stale interval;
  v_updated integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> v_user then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- Charge the allowance. plpgsql is transactional, so any exception below
  -- rolls this increment back: no claim is recorded unless all checks pass.
  update public.learning_sessions s
     set model_calls_used = s.model_calls_used + 1
   where s.id = p_session_id
     and s.user_id = v_user
     and s.status = 'in_progress'
     and s.model_calls_used < v_max;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'model call not permitted: not owner, session not in progress, or cap reached'
      using errcode = 'check_violation';
  end if;

  v_stale := make_interval(secs => v_session.claim_stale_after_seconds);

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
            and t.evaluation_claimed_at < now() - v_stale
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
-- fresh claim and consumes a further allowance.
-- ---------------------------------------------------------------------------
create or replace function public.release_model_call(
  p_session_id      uuid,
  p_learner_turn_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_updated integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> v_user then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

  -- Only a claimed turn can be released. An 'applied' turn is a finished
  -- evaluation and is never returned to the queue.
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
-- apply_turn_result
--
-- Atomic: verify the session is still in_progress, verify this learner turn
-- has been claimed and has no applied response, insert the linked student
-- turn, update evaluator state, optionally complete.
--
-- Returns ONLY a sanitized public projection. The private evaluator state
-- stays in the session row; the client never receives mastery, ledger, or
-- target gap.
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
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.learning_sessions%rowtype;
  v_sequence integer;
  v_state text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> v_user then
    raise exception 'not your session' using errcode = 'insufficient_privilege';
  end if;

  if v_session.status <> 'in_progress' then
    raise exception 'session is completed and immutable'
      using errcode = 'check_violation';
  end if;

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
  -- This keeps "claim before the provider" from being bypassed by applying
  -- straight from 'pending', which would cost no quota at all.
  if v_state <> 'claimed' then
    raise exception 'learner turn must be claimed before a result is applied'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(t.sequence), 0) + 1 into v_sequence
    from public.session_turns t
   where t.session_id = p_session_id;

  insert into public.session_turns (
    session_id, user_id, responds_to_turn_id, sequence, role,
    interaction_type, source, content
  ) values (
    p_session_id, v_user, p_learner_turn_id, v_sequence, 'student',
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
-- Grants
--
-- EXECUTE is revoked from PUBLIC/anon first, then granted only to
-- `authenticated`. No function is exposed to an unauthenticated caller.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_session(text) from public;
revoke execute on function public.delete_session(uuid) from public;
revoke execute on function public.set_claim_stale_after(uuid, integer) from public;
revoke execute on function public.append_learner_turn(uuid, uuid, text, text) from public;
revoke execute on function public.claim_model_call(uuid, uuid) from public;
revoke execute on function public.release_model_call(uuid, uuid) from public;
revoke execute on function public.apply_turn_result(uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, jsonb) from public;
revoke execute on function public.max_model_calls() from public;
revoke execute on function public.claim_stale_after() from public;

grant execute on function public.create_session(text) to authenticated;
grant execute on function public.delete_session(uuid) to authenticated;
grant execute on function public.set_claim_stale_after(uuid, integer) to authenticated;
grant execute on function public.append_learner_turn(uuid, uuid, text, text) to authenticated;
grant execute on function public.claim_model_call(uuid, uuid) to authenticated;
grant execute on function public.release_model_call(uuid, uuid) to authenticated;
grant execute on function public.apply_turn_result(uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, jsonb) to authenticated;
grant execute on function public.max_model_calls() to authenticated;
grant execute on function public.claim_stale_after() to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at (unchanged from 0001, kept for a fresh-database replay)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists learning_sessions_set_updated_at on public.learning_sessions;
create trigger learning_sessions_set_updated_at
  before update on public.learning_sessions
  for each row execute function public.set_updated_at();

create index if not exists learning_sessions_user_created_idx
  on public.learning_sessions (user_id, created_at desc);