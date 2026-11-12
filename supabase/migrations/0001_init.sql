-- TaskOrbit — Part 1, migration 0001: core schema, triggers, RLS.
-- Supabase (Postgres). Apply with `supabase db push` or `psql $DATABASE_URL -f`.
-- RLS is enabled on every table; every policy restricts by workspace
-- membership, role, or ownership — there are no unconditional policies.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pgcrypto provides digest() for invitation-token hashing. Supabase installs
-- extensions into the `extensions` schema; a fresh local Postgres puts them in
-- `public`. The wrapper below is built against whichever schema actually
-- holds pgcrypto, so SECURITY DEFINER functions (which run with an empty
-- search_path) can hash tokens without depending on session search_path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $do$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is null then
    create extension if not exists pgcrypto with schema extensions;
    v_schema := 'extensions';
  end if;

  execute format(
    'create or replace function public.sha256_hex(p_input text) '
    'returns text language sql immutable security definer set search_path = %L '
    'as $fn$ select encode(%I.digest(p_input, %L), %L) $fn$',
    '', v_schema, 'sha256', 'hex'
  );
end
$do$;

revoke execute on function public.sha256_hex(text) from public;
grant execute on function public.sha256_hex(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.workspace_role as enum ('manager', 'developer');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'archived');
create type public.priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'completed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  preferred_locale text not null default 'en',
  theme_preference text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 100),
  slug text not null unique,
  timezone text not null default 'Asia/Dhaka',
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.workspace_role not null default 'developer',
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  invited_email text not null,
  intended_role public.workspace_role not null default 'developer'
    check (intended_role = 'developer'),
  token_hash text not null,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users on delete cascade,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 200),
  description text,
  status public.project_status not null default 'planning',
  priority public.priority not null default 'medium',
  start_date date,
  due_date date,
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  parent_task_id uuid references public.tasks on delete cascade,
  title text not null check (char_length(btrim(title)) > 0 and char_length(title) <= 300),
  description text,
  assigned_to uuid references auth.users on delete set null,
  created_by uuid not null references auth.users on delete cascade,
  status public.task_status not null default 'todo',
  priority public.priority not null default 'medium',
  start_date date,
  due_date date,
  completed_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date),
  check (parent_task_id is null or parent_task_id <> id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  project_id uuid references public.projects on delete cascade,
  task_id uuid references public.tasks on delete cascade,
  actor_id uuid not null references auth.users on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  recipient_id uuid not null references auth.users on delete cascade,
  actor_id uuid references auth.users on delete set null,
  type text not null,
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (spec section 3, plus lookup indexes for invites/notifications)
-- ---------------------------------------------------------------------------
create index idx_workspace_members_user_id on public.workspace_members (user_id);
create index idx_workspace_members_workspace_id on public.workspace_members (workspace_id);
create index idx_projects_workspace_id on public.projects (workspace_id);
create index idx_tasks_project_id on public.tasks (project_id);
create index idx_tasks_parent_task_id on public.tasks (parent_task_id);
create index idx_tasks_assigned_to on public.tasks (assigned_to);
create index idx_tasks_due_date on public.tasks (due_date);
create index idx_comments_task_id on public.comments (task_id);
create index idx_activity_logs_workspace_created on public.activity_logs (workspace_id, created_at desc);
create index idx_activity_logs_task_id on public.activity_logs (task_id);
create unique index idx_invitations_token_hash on public.workspace_invitations (token_hash);
create index idx_invitations_workspace_id on public.workspace_invitations (workspace_id);
create index idx_notifications_recipient_id on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers (used inside RLS policies to avoid recursion:
-- they read workspace_members directly, bypassing RLS).
-- Every helper sets search_path = '' and schema-qualifies all references.
-- EXECUTE is revoked from public and granted only to authenticated/service_role.
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.member_role(p_workspace_id uuid)
returns public.workspace_role
language sql stable security definer
set search_path = ''
as $$
  select wm.role from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.project_workspace_id(p_project_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.workspace_id from public.projects p where p.id = p_project_id;
$$;

create or replace function public.task_workspace_id(p_task_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.workspace_id
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where t.id = p_task_id;
$$;

-- True when the task itself, or its parent task, is assigned to the user.
create or replace function public.is_task_assignee(p_task_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (
        t.assigned_to = p_user_id
        or exists (
          select 1 from public.tasks parent
          where parent.id = t.parent_task_id
            and parent.assigned_to = p_user_id
        )
      )
  );
$$;

-- True when the user shares at least one workspace with the given user.
create or replace function public.shares_workspace_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = auth.uid()
      and b.user_id = p_user_id
  );
$$;

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.member_role(uuid) from public;
revoke execute on function public.project_workspace_id(uuid) from public;
revoke execute on function public.task_workspace_id(uuid) from public;
revoke execute on function public.is_task_assignee(uuid, uuid) from public;
revoke execute on function public.shares_workspace_with(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.member_role(uuid) to authenticated, service_role;
grant execute on function public.project_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.task_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.is_task_assignee(uuid, uuid) to authenticated, service_role;
grant execute on function public.shares_workspace_with(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic audit triggers: clients cannot set created_* / completed_at.
-- created_at / created_by are always overwritten with server values on insert
-- (auth.uid(), falling back to the supplied value only when there is no
-- logged-in user, e.g. a service-role seed) and frozen on update.
-- ---------------------------------------------------------------------------
create or replace function public.set_insert_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end;
$$;

create or replace function public.set_comment_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.author_id := coalesce(auth.uid(), new.author_id);
  return new;
end;
$$;

create or replace function public.set_invitation_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  new.created_by := coalesce(auth.uid(), new.created_by);
  new.invited_email := lower(btrim(new.invited_email));
  if new.expires_at is null then
    new.expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

create or replace function public.set_member_audit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.joined_at := now();
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;

create or replace function public.protect_created_by()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: auto-create on signup (trigger on auth.users).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tasks: validation, assignee rules, completed_at, parent-completion block,
-- developer edit restriction.
-- ---------------------------------------------------------------------------
-- Subtask rules (same project as parent, parent must be top-level, no
-- self-reference), assignee must be a workspace member, subtask assignee is
-- copied from the parent on insert.
create or replace function public.validate_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_parent public.tasks%rowtype;
  v_workspace_id uuid;
begin
  select p.workspace_id into v_workspace_id
  from public.projects p where p.id = new.project_id;

  if v_workspace_id is null then
    raise exception 'Project not found.';
  end if;

  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'A task cannot be its own parent.';
    end if;

    select * into v_parent from public.tasks where id = new.parent_task_id;
    if not found then
      raise exception 'Parent task not found.';
    end if;
    if v_parent.parent_task_id is not null then
      raise exception 'A subtask cannot have subtasks.';
    end if;
    if v_parent.project_id <> new.project_id then
      raise exception 'Subtask must belong to the same project as its parent.';
    end if;
    if tg_op = 'INSERT' then
      new.assigned_to := v_parent.assigned_to;
    end if;
  end if;

  if new.assigned_to is not null
    and not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_workspace_id
        and wm.user_id = new.assigned_to
    ) then
    raise exception 'Assignee must be a member of the project''s workspace.';
  end if;

  return new;
end;
$$;

-- completed_at is server-managed: now() when status becomes completed,
-- null otherwise.
create or replace function public.maintain_completed_at()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'UPDATE' and old.status = 'completed' then
      new.completed_at := old.completed_at;
    else
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- A parent cannot be completed while any subtask is still open.
create or replace function public.block_parent_completion()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_total int;
  v_done int;
begin
  if tg_op = 'UPDATE'
    and new.status = 'completed'
    and old.status <> 'completed'
    and new.parent_task_id is null then
    select count(*), count(*) filter (where status = 'completed')
      into v_total, v_done
    from public.tasks
    where parent_task_id = new.id;

    if v_total > 0 and v_done < v_total then
      raise exception 'Complete all subtasks first (% of % done).', v_done, v_total;
    end if;
  end if;
  return new;
end;
$$;

-- Developers may only change the status of a top-level task assigned to them.
-- On subtasks of their assigned tasks they may also edit title, description,
-- due date and priority. Anything else is rejected here (the RLS policy lets
-- the update attempt through so this trigger can enforce the field rules).
create or replace function public.enforce_developer_task_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  select p.workspace_id into v_workspace_id
  from public.projects p where p.id = old.project_id;

  if public.member_role(v_workspace_id) = 'manager' then
    return new;
  end if;

  if not public.is_task_assignee(old.id, auth.uid()) then
    raise exception 'You do not have permission to edit this task.';
  end if;

  if old.parent_task_id is not null then
    -- Subtask of an assigned task: title, description, due date, priority
    -- and status may change; nothing else.
    if new.assigned_to is distinct from old.assigned_to
      or new.project_id is distinct from old.project_id
      or new.parent_task_id is distinct from old.parent_task_id
      or new.position is distinct from old.position
      or new.start_date is distinct from old.start_date then
      raise exception 'Developers can only edit title, description, due date, priority and status of their subtasks.';
    end if;
  else
    -- Top-level assigned task: status only.
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.priority is distinct from old.priority
      or new.start_date is distinct from old.start_date
      or new.due_date is distinct from old.due_date
      or new.assigned_to is distinct from old.assigned_to
      or new.project_id is distinct from old.project_id
      or new.parent_task_id is distinct from old.parent_task_id
      or new.position is distinct from old.position then
      raise exception 'Developers can only change the status of their assigned tasks.';
    end if;
  end if;

  return new;
end;
$$;

-- Reassigning a parent reassigns its subtasks too.
create or replace function public.cascade_task_reassign()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.tasks
  set assigned_to = new.assigned_to
  where parent_task_id = new.id;
  return new;
end;
$$;

-- Adding a subtask, or reopening one, under a completed parent reopens it.
create or replace function public.reopen_parent_on_subtask_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.parent_task_id is not null then
    if tg_op = 'INSERT'
      or (tg_op = 'UPDATE' and old.status = 'completed' and new.status <> 'completed') then
      update public.tasks
      set status = 'in_progress'
      where id = new.parent_task_id
        and status = 'completed';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity logs (written by triggers; skipped when there is no logged-in
-- user so service-role writes never fail on a null actor).
-- ---------------------------------------------------------------------------
create or replace function public.log_project_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (new.workspace_id, new.id, null, v_actor_id, 'project.created',
            jsonb_build_object('name', new.name));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (old.workspace_id, old.id, null, v_actor_id, 'project.deleted',
            jsonb_build_object('name', old.name));
    return old;
  end if;

  if old.name is distinct from new.name
    or old.status is distinct from new.status
    or old.description is distinct from new.description
    or old.priority is distinct from new.priority
    or old.start_date is distinct from new.start_date
    or old.due_date is distinct from new.due_date then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (new.workspace_id, new.id, null, v_actor_id, 'project.updated',
            jsonb_build_object('name', new.name, 'status', new.status));
  end if;
  return new;
end;
$$;

create or replace function public.log_task_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'INSERT' then
    select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (v_workspace_id, new.project_id, new.id, v_actor_id, 'task.created',
            jsonb_build_object('title', new.title));
    return new;
  end if;

  if tg_op = 'DELETE' then
    select p.workspace_id into v_workspace_id from public.projects p where p.id = old.project_id;
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (v_workspace_id, old.project_id, old.id, v_actor_id, 'task.deleted',
            jsonb_build_object('title', old.title));
    return old;
  end if;

  select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;

  if old.status is distinct from new.status then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (v_workspace_id, new.project_id, new.id, v_actor_id, 'task.status_changed',
            jsonb_build_object('title', new.title, 'from_status', old.status, 'to_status', new.status));
    if new.status = 'completed' then
      insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
      values (v_workspace_id, new.project_id, new.id, v_actor_id, 'task.completed',
              jsonb_build_object('title', new.title));
    end if;
    if old.status = 'completed' and new.status <> 'completed' then
      insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
      values (v_workspace_id, new.project_id, new.id, v_actor_id, 'task.reopened',
              jsonb_build_object('title', new.title));
    end if;
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (v_workspace_id, new.project_id, new.id, v_actor_id,
            case when old.assigned_to is null then 'task.assigned' else 'task.reassigned' end,
            jsonb_build_object('title', new.title, 'assignee', new.assigned_to));
  end if;

  return new;
end;
$$;

create or replace function public.log_comment_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    return new;
  end if;
  v_workspace_id := public.task_workspace_id(new.task_id);
  insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
  values (v_workspace_id, (select project_id from public.tasks where id = new.task_id),
          new.task_id, v_actor_id, 'comment.added',
          jsonb_build_object('comment_id', new.id));
  return new;
end;
$$;

create or replace function public.log_member_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    return new;
  end if;
  insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
  values (new.workspace_id, null, null, v_actor_id, 'member.joined',
          jsonb_build_object('user_id', new.user_id, 'role', new.role));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications: one row when a task is assigned (insert, or assignee change).
-- The notifications UI comes in Part 2; rows are only written and read now.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if new.assigned_to is not null
    and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
    insert into public.notifications (workspace_id, recipient_id, actor_id, type, title, body, entity_type, entity_id)
    values (v_workspace_id, new.assigned_to, coalesce(auth.uid(), new.created_by),
            'task_assigned', 'Task assigned to you',
            'You were assigned to "' || left(new.title, 120) || '".',
            'task', new.id);
  end if;
  return new;
end;
$$;

-- The last manager of a workspace cannot be removed.
create or replace function public.prevent_last_manager_removal()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.role = 'manager'
    and not exists (
      select 1 from public.workspace_members
      where workspace_id = old.workspace_id
        and role = 'manager'
        and user_id <> old.user_id
    ) then
    raise exception 'Cannot remove the last manager of a workspace.';
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- Profiles: auto-create on signup; maintain updated_at.
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Workspaces
create trigger trg_workspaces_audit_insert
  before insert on public.workspaces
  for each row execute function public.set_insert_audit();
create trigger trg_workspaces_protect_created
  before update on public.workspaces
  for each row execute function public.protect_created_by();
create trigger trg_workspaces_touch
  before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- Workspace members
create trigger trg_members_audit_insert
  before insert on public.workspace_members
  for each row execute function public.set_member_audit();
create trigger trg_members_activity
  after insert on public.workspace_members
  for each row execute function public.log_member_activity();
create trigger trg_members_prevent_last_manager
  before delete on public.workspace_members
  for each row execute function public.prevent_last_manager_removal();

-- Invitations
create trigger trg_invitations_audit_insert
  before insert on public.workspace_invitations
  for each row execute function public.set_invitation_audit();

-- Projects
create trigger trg_projects_audit_insert
  before insert on public.projects
  for each row execute function public.set_insert_audit();
create trigger trg_projects_protect_created
  before update on public.projects
  for each row execute function public.protect_created_by();
create trigger trg_projects_touch
  before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger trg_projects_activity
  after insert or update or delete on public.projects
  for each row execute function public.log_project_activity();

-- Tasks (BEFORE triggers fire in alphabetical order by name)
create trigger trg_tasks_audit_insert
  before insert on public.tasks
  for each row execute function public.set_insert_audit();
create trigger trg_tasks_block_completion
  before update of status on public.tasks
  for each row execute function public.block_parent_completion();
create trigger trg_tasks_completed_at
  before insert or update on public.tasks
  for each row execute function public.maintain_completed_at();
create trigger trg_tasks_enforce_developer
  before update on public.tasks
  for each row execute function public.enforce_developer_task_update();
create trigger trg_tasks_protect_created
  before update on public.tasks
  for each row execute function public.protect_created_by();
create trigger trg_tasks_touch
  before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger trg_tasks_validate
  before insert or update on public.tasks
  for each row execute function public.validate_task();
create trigger trg_tasks_activity
  after insert or update or delete on public.tasks
  for each row execute function public.log_task_activity();
create trigger trg_tasks_cascade_reassign
  after update of assigned_to on public.tasks
  for each row
  when (new.parent_task_id is null)
  execute function public.cascade_task_reassign();
create trigger trg_tasks_notify_assigned
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_on_task_assigned();
create trigger trg_tasks_reopen_parent
  after insert or update of status on public.tasks
  for each row
  when (new.parent_task_id is not null)
  execute function public.reopen_parent_on_subtask_change();

-- Comments
create trigger trg_comments_audit_insert
  before insert on public.comments
  for each row execute function public.set_comment_audit();
create trigger trg_comments_touch
  before update on public.comments
  for each row execute function public.touch_updated_at();
create trigger trg_comments_activity
  after insert on public.comments
  for each row execute function public.log_comment_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security — explicit policies for every operation on every table.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;

-- profiles: anyone can read a co-member's profile; a user updates only their own.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_workspace_with(id));
create policy profiles_insert_none on public.profiles for insert to authenticated
  with check (false);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_none on public.profiles for delete to authenticated
  using (false);

-- workspaces: members read; only the manager renames/deletes.
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (created_by = auth.uid());
create policy workspaces_update_manager on public.workspaces for update to authenticated
  using (public.member_role(id) = 'manager')
  with check (public.member_role(id) = 'manager');
create policy workspaces_delete_manager on public.workspaces for delete to authenticated
  using (public.member_role(id) = 'manager');

-- workspace_members: members read the roster; only the manager adds/removes.
create policy members_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy members_insert_manager on public.workspace_members for insert to authenticated
  with check (public.member_role(workspace_id) = 'manager');
create policy members_update_none on public.workspace_members for update to authenticated
  using (false) with check (false);
create policy members_delete_manager on public.workspace_members for delete to authenticated
  using (public.member_role(workspace_id) = 'manager');

-- workspace_invitations: managers only.
create policy invitations_select_manager on public.workspace_invitations for select to authenticated
  using (public.member_role(workspace_id) = 'manager');
create policy invitations_insert_manager on public.workspace_invitations for insert to authenticated
  with check (public.member_role(workspace_id) = 'manager');
create policy invitations_update_manager on public.workspace_invitations for update to authenticated
  using (public.member_role(workspace_id) = 'manager')
  with check (public.member_role(workspace_id) = 'manager');
create policy invitations_delete_manager on public.workspace_invitations for delete to authenticated
  using (public.member_role(workspace_id) = 'manager');

-- projects: members read; only the manager creates/edits/deletes.
create policy projects_select on public.projects for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy projects_insert_manager on public.projects for insert to authenticated
  with check (public.member_role(workspace_id) = 'manager');
create policy projects_update_manager on public.projects for update to authenticated
  using (public.member_role(workspace_id) = 'manager')
  with check (public.member_role(workspace_id) = 'manager');
create policy projects_delete_manager on public.projects for delete to authenticated
  using (public.member_role(workspace_id) = 'manager');

-- tasks: members read. Managers write anything. Developers may insert a
-- subtask only under a task assigned to them, update only tasks/subtasks
-- assigned to them (the trigger enforces which fields), and delete only
-- subtasks of their assigned tasks.
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_workspace_member(public.project_workspace_id(project_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.member_role(public.project_workspace_id(project_id)) = 'manager'
    or (parent_task_id is not null
        and public.is_task_assignee(parent_task_id, auth.uid()))
  );
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.member_role(public.project_workspace_id(project_id)) = 'manager'
    or public.is_task_assignee(id, auth.uid())
  )
  with check (
    public.member_role(public.project_workspace_id(project_id)) = 'manager'
    or public.is_task_assignee(id, auth.uid())
  );
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    public.member_role(public.project_workspace_id(project_id)) = 'manager'
    or (parent_task_id is not null
        and public.is_task_assignee(parent_task_id, auth.uid()))
  );

-- comments: members read and post; authors edit/delete their own, and the
-- manager may delete any comment in the workspace.
create policy comments_select on public.comments for select to authenticated
  using (public.is_workspace_member(public.task_workspace_id(task_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_workspace_member(public.task_workspace_id(task_id)));
create policy comments_update_author on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on public.comments for delete to authenticated
  using (
    author_id = auth.uid()
    or public.member_role(public.task_workspace_id(task_id)) = 'manager'
  );

-- activity_logs: members read their workspace's log; rows are written by
-- triggers / server code acting as the logged-in user, never edited.
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy activity_insert on public.activity_logs for insert to authenticated
  with check (actor_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy activity_update_none on public.activity_logs for update to authenticated
  using (false) with check (false);
create policy activity_delete_none on public.activity_logs for delete to authenticated
  using (false);

-- notifications: recipients only read/update their own rows; rows are
-- written by triggers / server code. No deletes in Part 1.
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (actor_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_none on public.notifications for delete to authenticated
  using (false);
