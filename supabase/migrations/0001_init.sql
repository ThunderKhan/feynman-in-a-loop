-- 0001_init.sql — Feynman-in-a-Loop, slice 1
--
-- Creates learning_sessions with Row Level Security.
-- session_turns, immutability triggers, and the atomic turn RPCs land in
-- slice 2 (devpost/checklist.md). See devpost/spec.md > Data Model.

-- ---------------------------------------------------------------------------
-- learning_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.learning_sessions (
  id                uuid primary key default gen_random_uuid(),
  -- Identity is derived from the auth session, never from client input.
  user_id           uuid not null default auth.uid(),
  topic             text not null,
  status            text not null default 'in_progress',
  stage             text not null default 'orient',
  student_state     text,
  model_calls_used  integer not null default 0,
  mastery           jsonb not null default '{}'::jsonb,
  evidence_ledger   jsonb not null default '{}'::jsonb,
  mastery_result    jsonb,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Bounds enforced by the database, not only by the application.
  constraint topic_length      check (char_length(topic) between 1 and 120),
  constraint topic_not_blank   check (char_length(btrim(topic)) > 0),
  constraint status_valid      check (status in ('in_progress', 'completed')),
  constraint calls_nonnegative check (model_calls_used >= 0),
  -- A completed session must have a result and a completion time.
  constraint completed_is_final check (
    status = 'in_progress'
    or (mastery_result is not null and completed_at is not null)
  )
);

comment on table public.learning_sessions is
  'One row per teaching attempt. Mutable while in_progress; frozen once completed.';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- RLS is the authorization boundary. The application holds no service-role
-- key, so every read and write here is scoped to the authenticated user.
-- ---------------------------------------------------------------------------
alter table public.learning_sessions enable row level security;

-- Own rows only.
create policy "sessions_select_own"
  on public.learning_sessions for select
  using (auth.uid() = user_id);

-- A user may create a row for themselves. auth.uid() is authoritative, so a
-- caller cannot insert a row owned by someone else even by supplying a
-- different user_id.
create policy "sessions_insert_own"
  on public.learning_sessions for insert
  with check (auth.uid() = user_id);

-- A completed attempt is immutable: the policy refuses any update to a
-- frozen session. The database trigger added in slice 2 is the second layer;
-- both must agree before a completed session can never change.
create policy "sessions_update_own_not_completed"
  on public.learning_sessions for update
  using (auth.uid() = user_id and status = 'in_progress')
  with check (auth.uid() = user_id);

create policy "sessions_delete_own"
  on public.learning_sessions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at
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

-- ---------------------------------------------------------------------------
-- Session listing index
-- ---------------------------------------------------------------------------
create index if not exists learning_sessions_user_created_idx
  on public.learning_sessions (user_id, created_at desc);