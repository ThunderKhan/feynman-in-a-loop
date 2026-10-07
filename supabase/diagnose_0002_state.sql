-- diagnose_0002_state.sql — READ ONLY. Safe to run any number of times.
-- Compatible with the Supabase SQL Editor (no psql meta-commands).
--
-- Answers: after the failed 0002 run, what actually landed in the database?
-- Nothing here writes, drops, or alters anything.

-- --- 1. tables ---
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('learning_sessions', 'session_turns')
order by table_name;

-- --- 2. learning_sessions columns (expect claim_stale_after_seconds if 0002 partially ran) ---
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'learning_sessions'
order by ordinal_position;

-- --- 3. RLS enabled? ---
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('learning_sessions', 'session_turns')
order by relname;

-- --- 4. policies (0001 leaves 4 on learning_sessions; a complete 0002 leaves 1 SELECT each) ---
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('learning_sessions', 'session_turns')
order by tablename, policyname;

-- --- 5. TABLE PRIVILEGES (the security-critical read) ---
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('learning_sessions', 'session_turns')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- --- 6. triggers ---
select event_object_table as table_name, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('learning_sessions', 'session_turns')
order by event_object_table, trigger_name;

-- --- 7. indexes on session_turns ---
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'session_turns'
order by indexname;

-- --- 8. functions (inspect names/security mode after a complete 0002) ---
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(default)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- --- 9. function EXECUTE grants ---
select routine_name, grantee
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC', 'service_role')
order by routine_name, grantee;