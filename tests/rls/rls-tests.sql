-- TaskOrbit — Part 1 RLS / trigger tests (spec section 8).
--
-- WHAT THIS IS: a test script, not a claim of passing. It has NOT been run
-- as part of Part 1 delivery. Run it yourself against a DISPOSABLE LOCAL
-- Supabase (never production) and record the result in docs/BUILD_LOG.md.
--
-- RUN IT (from the repo root, with a local Supabase running):
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f tests/rls/rls-tests.sql
-- (Use the connection string `supabase status` prints for your machine;
-- the one above is the default local Supabase postgres URL.)
--
-- HOW IT WORKS:
--   * The script connects as the postgres superuser, creates six throwaway
--     users in auth.users (addresses @testorbit.local, dummy password hash —
--     nobody logs in with these), two workspaces, projects, tasks, subtasks,
--     comments and invitation rows, then switches to the `authenticated`
--     role and impersonates each user by setting the request.jwt.claims GUC
--     (the same mechanism Supabase uses: auth.uid() reads the `sub` claim),
--     so every statement below is really evaluated under RLS.
--   * Each test is a DO block. `test_assert` raises on failure (and with
--     ON_ERROR_STOP the script stops at the first failed test). Expected
--     denials are caught by their SQLSTATE (42501 = RLS denial,
--     P0001/raise_exception = a trigger or function raising) and the row is
--     then checked to be unchanged.
--   * The script is re-runnable: setup deletes any previous @testorbit.local
--     test data first, and cleanup at the end removes it all again.
--
-- PREREQUISITES: migrations 0001_init.sql and 0002_rpc.sql applied to the
-- target database. Do NOT run against a database that holds real data.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Preflight: must run as a superuser, with the Part 1 migrations applied.
-- ---------------------------------------------------------------------------
do $pre$
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    raise exception 'Run this script as the postgres superuser, e.g. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f tests/rls/rls-tests.sql';
  end if;
  if to_regproc('public.accept_invitation(text)') is null
     or to_regproc('public.create_workspace(text)') is null then
    raise exception 'Migrations 0001/0002 do not look applied (accept_invitation / create_workspace missing). Apply supabase/migrations first.';
  end if;
  raise notice 'Preflight OK: running as %, RPCs present.', current_user;
end
$pre$;

-- ---------------------------------------------------------------------------
-- Test helpers (created in public; dropped again in cleanup).
-- ---------------------------------------------------------------------------
create or replace function public.test_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'TEST FAILED: %', p_message;
  end if;
  raise notice 'PASS: %', p_message;
end;
$$;

-- Impersonate a user for RLS: sets the JWT claims auth.uid() reads.
create or replace function public.test_set_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_id::text,
      'email', p_email,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixed fixture UUIDs (kept readable; every test below refers to these).
-- ---------------------------------------------------------------------------
-- Users:   ALICE = manager of workspace A
--          BOB, CAROL = developers in workspace A
--          DAVE = manager of workspace B (outsider to A)
--          ERIN = no workspace yet (invited in T16); FRANK = invite edge cases
-- Workspaces: WS_A, WS_B.  Projects: P_A (in A), P_B (in B).
-- Tasks:   T1 = P_A, assigned BOB;  T2 = P_A, assigned CAROL;
--          T3 = P_A, unassigned;    T4 = P_B, assigned DAVE.
-- Subtasks:S1 = under T1, completed; S2 = under T1, open; S3 = under T2, open.
-- Comments:CM1 = BOB on T1; CM2 = DAVE on T4; CM3 = CAROL on T1.

-- ---------------------------------------------------------------------------
-- Fixture setup (as postgres: RLS is bypassed, triggers still fire).
-- ---------------------------------------------------------------------------
reset role;

-- Re-runnable: wipe any previous run's test data (cascades to everything).
delete from auth.users where email like '%@testorbit.local';

insert into auth.users
  (id, instance_id, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'alice@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Alice Manager"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'bob@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Bob Developer"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'carol@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Carol Developer"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'dave@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Dave Outsider"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
   'erin@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Erin Invited"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
   'frank@testorbit.local', 'dummy-not-a-real-password-hash', now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Frank Invited"}'::jsonb, 'authenticated', 'authenticated', now(), now())
on conflict (id) do nothing;

insert into public.workspaces (id, name, slug, timezone, created_by) values
  ('a0000000-0000-4000-8000-000000000001', 'Workspace A', 'workspace-a-aaaaaa', 'Asia/Dhaka',
   '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000002', 'Workspace B', 'workspace-b-bbbbbb', 'Asia/Dhaka',
   '44444444-4444-4444-8444-444444444444')
on conflict (id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'manager'),
  ('a0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'developer'),
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'developer'),
  ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'manager')
on conflict (workspace_id, user_id) do nothing;

insert into public.projects (id, workspace_id, name, description, status, priority, start_date, due_date, created_by) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Website Redesign', 'Project in workspace A.', 'active', 'high',
   current_date, current_date + interval '14 days',
   '11111111-1111-4111-8111-111111111111'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'Other Workspace Project', 'Project in workspace B.', 'active', 'medium',
   current_date, current_date + interval '14 days',
   '44444444-4444-4444-8444-444444444444')
on conflict (id) do nothing;

-- Top-level tasks first (subtasks reference them).
insert into public.tasks (id, project_id, parent_task_id, title, assigned_to, created_by, status, priority, due_date) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null,
   'Build homepage', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'todo', 'high', current_date + interval '7 days'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', null,
   'Write copy', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'todo', 'medium', current_date + interval '5 days'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', null,
   'Unassigned task', null,
   '11111111-1111-4111-8111-111111111111', 'todo', 'low', current_date + interval '9 days'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', null,
   'Workspace B task', '44444444-4444-4444-8444-444444444444',
   '44444444-4444-4444-8444-444444444444', 'todo', 'medium', current_date + interval '7 days')
on conflict (id) do nothing;

insert into public.tasks (id, project_id, parent_task_id, title, assigned_to, created_by, status, priority, due_date) values
  ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001',
   'Design hero section', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'completed', 'medium', current_date + interval '3 days'),
  ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001',
   'Implement hero section', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'todo', 'medium', current_date + interval '5 days'),
  ('c0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002',
   'Draft about page', '33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111', 'todo', 'low', current_date + interval '4 days')
on conflict (id) do nothing;

insert into public.comments (id, task_id, author_id, content) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'Started on the homepage.'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004',
   '44444444-4444-4444-8444-444444444444', 'Workspace B comment.'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'Carol commenting on Bob''s task.')
on conflict (id) do nothing;

-- Invitations: INV1 valid for Erin; INV2 expired; INV3 revoked; INV4 for Grace.
insert into public.workspace_invitations
  (id, workspace_id, invited_email, intended_role, token_hash, expires_at, created_by, revoked_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'erin@testorbit.local', 'developer', public.sha256_hex('test-token-accept-001'),
   now() + interval '7 days', '11111111-1111-4111-8111-111111111111', null),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'frank@testorbit.local', 'developer', public.sha256_hex('test-token-expired-001'),
   now() - interval '1 day', '11111111-1111-4111-8111-111111111111', null),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001',
   'frank@testorbit.local', 'developer', public.sha256_hex('test-token-revoked-001'),
   now() + interval '7 days', '11111111-1111-4111-8111-111111111111', now()),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001',
   'grace@testorbit.local', 'developer', public.sha256_hex('test-token-grace-001'),
   now() + interval '7 days', '11111111-1111-4111-8111-111111111111', null)
on conflict (id) do nothing;

do $done$
begin
  raise notice 'Fixtures ready: 6 users, 2 workspaces, 2 projects, 4 tasks, 3 subtasks, 3 comments, 4 invitations.';
end
$done$;

-- From here on, everything runs as `authenticated` under RLS.
set role authenticated;

-- ---------------------------------------------------------------------------
-- T01–T03: a developer cannot create, edit or delete a project.
-- (UPDATE/DELETE under RLS fail silently with 0 rows, so the row is checked.)
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    insert into public.projects (workspace_id, name, created_by)
    values ('a0000000-0000-4000-8000-000000000001', 'Hacker project',
            '22222222-2222-4222-8222-222222222222');
    raise exception 'TEST FAILED: developer was able to create a project';
  exception when insufficient_privilege then
    raise notice 'PASS: T01 developer cannot create a project (RLS denied)';
  end;
end
$t$;

do $t$
declare
  v_name text;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.projects set name = 'Hacked project'
  where id = 'b0000000-0000-4000-8000-000000000001';
  select name into v_name from public.projects
  where id = 'b0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_name = 'Website Redesign',
    'T02 developer cannot edit a project (name unchanged)');
end
$t$;

do $t$
declare
  v_count int;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  delete from public.projects where id = 'b0000000-0000-4000-8000-000000000001';
  select count(*) into v_count from public.projects
  where id = 'b0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_count = 1,
    'T03 developer cannot delete a project (still exists)');
end
$t$;

-- ---------------------------------------------------------------------------
-- T04–T06: a developer cannot change title / assignee / due date of their
-- own assigned task (RLS lets the attempt through; the trigger rejects it).
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    update public.tasks set title = 'Hacked title'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: developer changed the title of their assigned task';
  exception when raise_exception then
    if position('only change the status' in sqlerrm) = 0 then
      raise exception 'T04 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T04 developer cannot change the title of their assigned task';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    update public.tasks set assigned_to = '33333333-3333-4333-8333-333333333333'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: developer reassigned their assigned task';
  exception when raise_exception then
    if position('only change the status' in sqlerrm) = 0 then
      raise exception 'T05 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T05 developer cannot change the assignee of their assigned task';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    update public.tasks set due_date = current_date + interval '99 days'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: developer changed the deadline of their assigned task';
  exception when raise_exception then
    if position('only change the status' in sqlerrm) = 0 then
      raise exception 'T06 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T06 developer cannot change the deadline of their assigned task';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T07: a developer CAN change the status of their assigned task.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_status public.task_status;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.tasks set status = 'in_progress'
  where id = 'c0000000-0000-4000-8000-000000000001';
  select status into v_status from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_status = 'in_progress',
    'T07 developer can change the status of their assigned task');
end
$t$;

-- ---------------------------------------------------------------------------
-- T08–T09: a developer cannot create a subtask under another developer's
-- task, or under an unassigned task.
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    insert into public.tasks (project_id, parent_task_id, title, created_by)
    values ('b0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000002',
            'Sneaky subtask', '22222222-2222-4222-8222-222222222222');
    raise exception 'TEST FAILED: developer created a subtask under another developer''s task';
  exception when insufficient_privilege then
    raise notice 'PASS: T08 developer cannot create a subtask under another developer''s task (RLS denied)';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    insert into public.tasks (project_id, parent_task_id, title, created_by)
    values ('b0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000003',
            'Subtask under unassigned task', '22222222-2222-4222-8222-222222222222');
    raise exception 'TEST FAILED: developer created a subtask under an unassigned task';
  exception when insufficient_privilege then
    raise notice 'PASS: T09 developer cannot create a subtask under an unassigned task (RLS denied)';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T10: a developer CAN create a subtask under their own assigned task, and
-- the subtask's assignee is copied from the parent.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_assignee uuid;
  v_project uuid;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  insert into public.tasks (id, project_id, parent_task_id, title, created_by)
  values ('c0000000-0000-4000-8000-000000000014',
          'b0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000001',
          'Review hero on mobile', '22222222-2222-4222-8222-222222222222');
  select assigned_to, project_id into v_assignee, v_project from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000014';
  perform public.test_assert(
    v_assignee = '22222222-2222-4222-8222-222222222222'
    and v_project = 'b0000000-0000-4000-8000-000000000001',
    'T10 developer can create a subtask under their own task; assignee copied from parent');
end
$t$;

-- ---------------------------------------------------------------------------
-- T11–T12: a developer cannot edit or delete another developer's task or
-- subtask (RLS silently leaves the row untouched — asserted by re-reading).
-- ---------------------------------------------------------------------------
do $t$
declare
  v_title text;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.tasks set title = 'Hacked subtask'
  where id = 'c0000000-0000-4000-8000-000000000013';
  select title into v_title from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000013';
  perform public.test_assert(v_title = 'Draft about page',
    'T11a developer cannot edit another developer''s subtask (title unchanged)');

  update public.tasks set title = 'Hacked task'
  where id = 'c0000000-0000-4000-8000-000000000002';
  select title into v_title from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000002';
  perform public.test_assert(v_title = 'Write copy',
    'T11b developer cannot edit another developer''s task (title unchanged)');
end
$t$;

do $t$
declare
  v_count int;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  delete from public.tasks where id = 'c0000000-0000-4000-8000-000000000013';
  select count(*) into v_count from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000013';
  perform public.test_assert(v_count = 1,
    'T12 developer cannot delete another developer''s subtask (still exists)');
end
$t$;

-- ---------------------------------------------------------------------------
-- T13: a user from workspace B cannot read workspace A's project, task,
-- comment or workspace row, even with the exact UUID.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_projects int;
  v_tasks int;
  v_comments int;
  v_workspaces int;
begin
  perform public.test_set_user('44444444-4444-4444-8444-444444444444', 'dave@testorbit.local');
  select count(*) into v_projects from public.projects
  where id = 'b0000000-0000-4000-8000-000000000001';
  select count(*) into v_tasks from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  select count(*) into v_comments from public.comments
  where id = 'd0000000-0000-4000-8000-000000000001';
  select count(*) into v_workspaces from public.workspaces
  where id = 'a0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_projects = 0 and v_tasks = 0 and v_comments = 0 and v_workspaces = 0,
    'T13 workspace B user cannot read workspace A project/task/comment/workspace (all 0 rows)');
end
$t$;

-- ---------------------------------------------------------------------------
-- T14–T15: a manager cannot assign a task to a non-member (update or insert).
-- Must run BEFORE T16, which makes Erin a member.
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  begin
    update public.tasks set assigned_to = '55555555-5555-4555-8555-555555555555'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: manager assigned a task to a non-member';
  exception when raise_exception then
    if position('must be a member' in sqlerrm) = 0 then
      raise exception 'T14 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T14 manager cannot assign a task to a non-member';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  begin
    insert into public.tasks (project_id, title, assigned_to, created_by)
    values ('b0000000-0000-4000-8000-000000000001', 'Task for outsider',
            '55555555-5555-4555-8555-555555555555',
            '11111111-1111-4111-8111-111111111111');
    raise exception 'TEST FAILED: manager created a task assigned to a non-member';
  exception when raise_exception then
    if position('must be a member' in sqlerrm) = 0 then
      raise exception 'T15 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T15 manager cannot create a task assigned to a non-member';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T16–T20: invitation acceptance — happy path, reuse, expiry, revoke,
-- wrong email.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_ws uuid;
  v_is_member int;
  v_can_read int;
begin
  perform public.test_set_user('55555555-5555-4555-8555-555555555555', 'erin@testorbit.local');
  select public.accept_invitation('test-token-accept-001') into v_ws;
  select count(*) into v_is_member from public.workspace_members
  where workspace_id = 'a0000000-0000-4000-8000-000000000001'
    and user_id = '55555555-5555-4555-8555-555555555555'
    and role = 'developer';
  select count(*) into v_can_read from public.projects
  where id = 'b0000000-0000-4000-8000-000000000001';
  perform public.test_assert(
    v_ws = 'a0000000-0000-4000-8000-000000000001'
    and v_is_member = 1 and v_can_read = 1,
    'T16 invited developer accepts, becomes a member, can read the workspace');
end
$t$;

do $t$
begin
  perform public.test_set_user('55555555-5555-4555-8555-555555555555', 'erin@testorbit.local');
  begin
    perform public.accept_invitation('test-token-accept-001');
    raise exception 'TEST FAILED: invitation token was reused';
  exception when raise_exception then
    if position('already used' in sqlerrm) = 0 then
      raise exception 'T17 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T17 invitation token cannot be reused';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('66666666-6666-4666-8666-666666666666', 'frank@testorbit.local');
  begin
    perform public.accept_invitation('test-token-expired-001');
    raise exception 'TEST FAILED: expired invitation was accepted';
  exception when raise_exception then
    if position('expired' in sqlerrm) = 0 then
      raise exception 'T18 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T18 expired invitation cannot be accepted';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('66666666-6666-4666-8666-666666666666', 'frank@testorbit.local');
  begin
    perform public.accept_invitation('test-token-revoked-001');
    raise exception 'TEST FAILED: revoked invitation was accepted';
  exception when raise_exception then
    if position('revoked' in sqlerrm) = 0 then
      raise exception 'T19 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T19 revoked invitation cannot be accepted';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('55555555-5555-4555-8555-555555555555', 'erin@testorbit.local');
  begin
    perform public.accept_invitation('test-token-grace-001');
    raise exception 'TEST FAILED: invitation was accepted by a different email';
  exception when raise_exception then
    if position('different email' in sqlerrm) = 0 then
      raise exception 'T20 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T20 invitation cannot be accepted by a different email';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T21: parent cannot be completed while a subtask is open.
-- T1 has 3 subtasks at this point (S1 done, S2 + S4 open) -> "1 of 3 done".
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  begin
    update public.tasks set status = 'completed'
    where id = 'c0000000-0000-4000-8000-000000000001';
    raise exception 'TEST FAILED: parent was completed with open subtasks';
  exception when raise_exception then
    if position('Complete all subtasks first (1 of 3 done)' in sqlerrm) = 0 then
      raise exception 'T21 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T21 parent cannot be completed with open subtasks';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T22: completing all subtasks lets the parent complete (completed_at set).
-- T23: reopening a subtask reopens the completed parent (completed_at cleared).
-- T24: adding a subtask under a completed parent reopens it too.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_status public.task_status;
  v_completed_at timestamptz;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.tasks set status = 'completed'
  where id in ('c0000000-0000-4000-8000-000000000012',
               'c0000000-0000-4000-8000-000000000014');

  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  update public.tasks set status = 'completed'
  where id = 'c0000000-0000-4000-8000-000000000001';
  select status, completed_at into v_status, v_completed_at from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_status = 'completed' and v_completed_at is not null,
    'T22 parent completes once all subtasks are done (completed_at set)');
end
$t$;

do $t$
declare
  v_status public.task_status;
  v_completed_at timestamptz;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.tasks set status = 'todo'
  where id = 'c0000000-0000-4000-8000-000000000011';
  select status, completed_at into v_status, v_completed_at from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_status = 'in_progress' and v_completed_at is null,
    'T23 reopening a subtask reopens the completed parent (in_progress, completed_at cleared)');
end
$t$;

do $t$
declare
  v_status public.task_status;
  v_completed_at timestamptz;
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  update public.tasks set status = 'completed'
  where id = 'c0000000-0000-4000-8000-000000000011';

  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  update public.tasks set status = 'completed'
  where id = 'c0000000-0000-4000-8000-000000000001';
  select status into v_status from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_status = 'completed',
    'T24a parent completes again after its subtasks are all done');

  -- Adding a new subtask under the completed parent reopens it.
  insert into public.tasks (id, project_id, parent_task_id, title, created_by)
  values ('c0000000-0000-4000-8000-000000000015',
          'b0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000001',
          'Extra check after completion',
          '11111111-1111-4111-8111-111111111111');
  select status, completed_at into v_status, v_completed_at from public.tasks
  where id = 'c0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_status = 'in_progress' and v_completed_at is null,
    'T24b adding a subtask under a completed parent reopens it');
end
$t$;

-- ---------------------------------------------------------------------------
-- T25–T26: a subtask cannot be created under a subtask, or under a task of
-- another project.
-- ---------------------------------------------------------------------------
do $t$
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  begin
    insert into public.tasks (project_id, parent_task_id, title, created_by)
    values ('b0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000011',
            'Second-level subtask', '11111111-1111-4111-8111-111111111111');
    raise exception 'TEST FAILED: subtask was created under a subtask';
  exception when raise_exception then
    if position('cannot have subtasks' in sqlerrm) = 0 then
      raise exception 'T25 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T25 a subtask cannot be created under a subtask';
  end;
end
$t$;

do $t$
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  begin
    insert into public.tasks (project_id, parent_task_id, title, created_by)
    values ('b0000000-0000-4000-8000-000000000002',
            'c0000000-0000-4000-8000-000000000001',
            'Subtask in another project', '11111111-1111-4111-8111-111111111111');
    raise exception 'TEST FAILED: subtask was created under a task of another project';
  exception when raise_exception then
    if position('same project' in sqlerrm) = 0 then
      raise exception 'T26 wrong error message: %', sqlerrm;
    end if;
    raise notice 'PASS: T26 a subtask cannot be created under a task of another project';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T27: reassigning a parent reassigns its subtasks too.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_mismatched int;
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  update public.tasks set assigned_to = '33333333-3333-4333-8333-333333333333'
  where id = 'c0000000-0000-4000-8000-000000000001';
  select count(*) into v_mismatched from public.tasks
  where parent_task_id = 'c0000000-0000-4000-8000-000000000001'
    and assigned_to is distinct from '33333333-3333-4333-8333-333333333333';
  perform public.test_assert(v_mismatched = 0,
    'T27 reassigning a parent reassigns all of its subtasks');
end
$t$;

-- ---------------------------------------------------------------------------
-- T28: comments — members can post, authors delete their own, the manager
-- can delete any, a non-member cannot post, a developer cannot delete
-- another developer's comment.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_count int;
begin
  -- Member can post.
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  insert into public.comments (id, task_id, author_id, content)
  values ('d0000000-0000-4000-8000-000000000011',
          'c0000000-0000-4000-8000-000000000001',
          '22222222-2222-4222-8222-222222222222', 'Another update from Bob.');
  select count(*) into v_count from public.comments
  where id = 'd0000000-0000-4000-8000-000000000011';
  perform public.test_assert(v_count = 1, 'T28a workspace member can comment');

  -- Author can delete their own comment.
  delete from public.comments where id = 'd0000000-0000-4000-8000-000000000011';
  select count(*) into v_count from public.comments
  where id = 'd0000000-0000-4000-8000-000000000011';
  perform public.test_assert(v_count = 0, 'T28b author can delete their own comment');

  -- Developer cannot delete another developer's comment (silent 0 rows).
  delete from public.comments where id = 'd0000000-0000-4000-8000-000000000003';
  select count(*) into v_count from public.comments
  where id = 'd0000000-0000-4000-8000-000000000003';
  perform public.test_assert(v_count = 1,
    'T28c developer cannot delete another developer''s comment (still exists)');

  -- Manager can delete any comment in the workspace.
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  delete from public.comments where id = 'd0000000-0000-4000-8000-000000000001';
  select count(*) into v_count from public.comments
  where id = 'd0000000-0000-4000-8000-000000000001';
  perform public.test_assert(v_count = 0, 'T28d manager can delete any comment');

  -- Non-member cannot comment in the workspace.
  perform public.test_set_user('44444444-4444-4444-8444-444444444444', 'dave@testorbit.local');
  begin
    insert into public.comments (task_id, author_id, content)
    values ('c0000000-0000-4000-8000-000000000001',
            '44444444-4444-4444-8444-444444444444', 'Outsider comment.');
    raise exception 'TEST FAILED: non-member commented in another workspace';
  exception when insufficient_privilege then
    raise notice 'PASS: T28e non-member cannot comment in another workspace (RLS denied)';
  end;
end
$t$;

-- ---------------------------------------------------------------------------
-- T29: manager can revoke an invitation. T30: developer cannot invite.
-- T31: activity rows are written for task events. T32: a notification row
-- is written when a task is assigned.
-- ---------------------------------------------------------------------------
do $t$
declare
  v_revoked timestamptz;
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  update public.workspace_invitations set revoked_at = now()
  where id = 'e0000000-0000-4000-8000-000000000004';
  select revoked_at into v_revoked from public.workspace_invitations
  where id = 'e0000000-0000-4000-8000-000000000004';
  perform public.test_assert(v_revoked is not null,
    'T29 manager can revoke a pending invitation');
end
$t$;

do $t$
begin
  perform public.test_set_user('22222222-2222-4222-8222-222222222222', 'bob@testorbit.local');
  begin
    insert into public.workspace_invitations
      (workspace_id, invited_email, token_hash, expires_at, created_by)
    values ('a0000000-0000-4000-8000-000000000001', 'someone@example.com',
            public.sha256_hex('test-token-developer-invite'),
            now() + interval '7 days',
            '22222222-2222-4222-8222-222222222222');
    raise exception 'TEST FAILED: developer created an invitation';
  exception when insufficient_privilege then
    raise notice 'PASS: T30 developer cannot invite (RLS denied)';
  end;
end
$t$;

do $t$
declare
  v_completed int;
  v_reopened int;
begin
  perform public.test_set_user('11111111-1111-4111-8111-111111111111', 'alice@testorbit.local');
  select count(*) into v_completed from public.activity_logs
  where task_id = 'c0000000-0000-4000-8000-000000000001' and action = 'task.completed';
  select count(*) into v_reopened from public.activity_logs
  where task_id = 'c0000000-0000-4000-8000-000000000001' and action = 'task.reopened';
  perform public.test_assert(v_completed >= 1 and v_reopened >= 1,
    'T31 activity rows recorded task completed and reopened events');
end
$t$;

do $t$
declare
  v_notifications int;
begin
  perform public.test_set_user('33333333-3333-4333-8333-333333333333', 'carol@testorbit.local');
  select count(*) into v_notifications from public.notifications
  where recipient_id = '33333333-3333-4333-8333-333333333333'
    and entity_id = 'c0000000-0000-4000-8000-000000000002'
    and type = 'task_assigned';
  perform public.test_assert(v_notifications >= 1,
    'T32 a notification row was written when a task was assigned');
end
$t$;

do $done$
begin
  raise notice 'ALL RLS TESTS PASSED';
end
$done$;

-- ---------------------------------------------------------------------------
-- Cleanup: remove all test data and the test helper functions.
-- (Deleting the users cascades to profiles, memberships, workspaces,
-- projects, tasks, comments, invitations, activity and notifications.)
-- ---------------------------------------------------------------------------
reset role;

delete from auth.users where email like '%@testorbit.local';
drop function if exists public.test_assert(boolean, text);
drop function if exists public.test_set_user(uuid, text);

do $done$
begin
  raise notice 'Cleanup done: test users and helpers removed.';
end
$done$;
