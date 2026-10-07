-- 0003_ai_kernel_state.sql
-- Slice 3: persist the active private diagnostic target between bounded model
-- contexts. The browser can read its own session row through RLS, but the
-- application never exposes this column in the turn endpoint response.
--
-- Rerun-safe for development: column/constraint/function replacement is
-- explicit and the old apply_turn_result signature is removed first.

alter table public.learning_sessions
  add column if not exists active_target_gap text;

alter table public.learning_sessions
  drop constraint if exists learning_sessions_active_target_gap_length;

alter table public.learning_sessions
  add constraint learning_sessions_active_target_gap_length
  check (
    active_target_gap is null
    or (
      char_length(btrim(active_target_gap)) between 1 and 160
      and active_target_gap = btrim(active_target_gap)
    )
  );

-- Remove the Slice 2 signature so PostgREST cannot retain an old overload.
drop function if exists public.apply_turn_result(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, boolean, jsonb
);

create or replace function public.apply_turn_result(
  p_user_id           uuid,
  p_session_id        uuid,
  p_learner_turn_id   uuid,
  p_student_state     text,
  p_message           text,
  p_interaction_type  text,
  p_stage             text,
  p_mastery           jsonb,
  p_evidence_ledger   jsonb,
  p_target_gap        text default null,
  p_complete          boolean default false,
  p_mastery_result    jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_sequence integer;
  v_state text;
begin
  if p_user_id is null then
    raise exception 'verified user id is required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_target_gap is not null
     and (char_length(btrim(p_target_gap)) < 1
          or char_length(btrim(p_target_gap)) > 160) then
    raise exception 'target gap must be null or 1-160 characters'
      using errcode = 'check_violation';
  end if;

  select * into v_session
    from public.learning_sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'session not found' using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> p_user_id then
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
     and t.user_id = p_user_id
     and t.role = 'learner';

  if v_state is null then
    raise exception 'learner turn not found in session'
      using errcode = 'no_data_found';
  end if;

  if v_state = 'applied' then
    raise exception 'learner turn already has an applied response'
      using errcode = 'unique_violation';
  end if;

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
    p_session_id, p_user_id, p_learner_turn_id, v_sequence, 'student',
    p_interaction_type, 'typed', p_message
  );

  update public.session_turns t
     set evaluation_state = 'applied'
   where t.id = p_learner_turn_id
     and t.user_id = p_user_id;

  update public.learning_sessions s
     set stage             = p_stage,
         student_state     = p_student_state,
         mastery           = coalesce(p_mastery, s.mastery),
         evidence_ledger   = coalesce(p_evidence_ledger, s.evidence_ledger),
         active_target_gap = case
           when p_complete then null
           else nullif(btrim(p_target_gap), '')
         end,
         status            = case when p_complete then 'completed' else s.status end,
         mastery_result    = case
           when p_complete then p_mastery_result
           else s.mastery_result
         end,
         completed_at      = case
           when p_complete then now()
           else s.completed_at
         end
   where s.id = p_session_id
     and s.user_id = p_user_id;

  return jsonb_build_object(
    'publicStage', p_stage,
    'student', jsonb_build_object(
      'state', p_student_state,
      'message', p_message
    )
  );
end;
$$;

revoke execute on function public.apply_turn_result(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.apply_turn_result(
  uuid, uuid, uuid, text, text, text, text, jsonb, jsonb, text, boolean, jsonb
) to service_role;
