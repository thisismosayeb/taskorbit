-- TaskOrbit — Part 2, migration 0004: notifications.
-- All notification generation lives in DATABASE TRIGGERS (one place only).
-- Rules enforced here:
--   * Never notify the person who did the action (recipient = auth.uid()
--     is always skipped; the actor is auth.uid() inside the trigger).
--   * Task assigned / reassigned -> new assignee (top-level tasks only;
--     subtasks follow their parent, so a parent reassignment does not spam
--     one notification per subtask).
--   * Comment on a task/subtask -> task assignee + task creator.
--   * Task or subtask completed -> workspace manager(s).
--   * Task reopened -> assignee.
--   * Invitation accepted -> workspace manager(s).
--   * Project status changed -> members who have tasks in that project.
--   * No due-soon / overdue reminders (Part 3).
-- The task-assigned function from 0001 is REPLACED here (same name, so the
-- existing trigger keeps working): the 0001 version notified even when the
-- actor assigned a task to themselves and fired once per subtask on a
-- cascade reassign. Both are fixed below.
-- Depends on 0001 (notifications table, triggers, policies).

-- ---------------------------------------------------------------------------
-- Shared insert helper: validates the type, skips self-notifications and
-- no-ops, and de-dupes identical unread rows created within 10 seconds
-- (several triggers can fire for one user action).
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(
  p_workspace_id uuid,
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_recipient_id is null then
    return;
  end if;
  if p_actor_id is not null and p_recipient_id = p_actor_id then
    return;
  end if;
  if p_type not in (
    'task_assigned', 'task_reassigned', 'task_completed', 'task_reopened',
    'comment_added', 'invite_accepted', 'project_status_changed'
  ) then
    raise exception 'Unknown notification type: %', p_type;
  end if;
  if char_length(btrim(p_title)) = 0 or char_length(p_title) > 200 then
    raise exception 'Notification title must be 1-200 characters.';
  end if;

  if exists (
    select 1 from public.notifications n
    where n.recipient_id = p_recipient_id
      and n.type = p_type
      and n.entity_id is not distinct from p_entity_id
      and n.read_at is null
      and n.created_at > now() - interval '10 seconds'
  ) then
    return;
  end if;

  insert into public.notifications
    (workspace_id, recipient_id, actor_id, type, title, body, entity_type, entity_id)
  values
    (p_workspace_id, p_recipient_id, p_actor_id, p_type,
     btrim(p_title), coalesce(p_body, ''), p_entity_type, p_entity_id);
end;
$$;

revoke execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, uuid) from public;
-- NOTE (verified 2026-11-12 on taskorbit-test): revoke from public alone
-- does NOT remove anon's EXECUTE here — anon holds an explicit grant, so
-- revoke from anon explicitly as well (same as 0003).
revoke execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, uuid) from anon;
grant execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, uuid) to authenticated, service_role;

-- Actor display name, for notification bodies ("Rahim completed ...").
create or replace function public.actor_display_name(p_user_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(full_name), ''), 'Someone')
  from public.profiles
  where id = p_user_id;
$$;

revoke execute on function public.actor_display_name(uuid) from public;
revoke execute on function public.actor_display_name(uuid) from anon;
grant execute on function public.actor_display_name(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Task assigned / reassigned (replaces the 0001 version).
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_task_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_actor_id uuid := auth.uid();
begin
  -- Subtasks inherit their parent's assignee; the parent's own
  -- notification covers them.
  if new.parent_task_id is not null then
    return new;
  end if;

  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_to is not distinct from new.assigned_to then
    return new;
  end if;

  select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
  if v_workspace_id is null then
    return new;
  end if;

  perform public.notify_user(
    v_workspace_id,
    new.assigned_to,
    coalesce(v_actor_id, new.created_by),
    case when tg_op = 'INSERT' or old.assigned_to is null then 'task_assigned' else 'task_reassigned' end,
    case when tg_op = 'INSERT' or old.assigned_to is null then 'Task assigned to you' else 'Task reassigned to you' end,
    'You were assigned to "' || left(new.title, 120) || '".',
    'task',
    new.id
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comment added -> task assignee + task creator (whoever they are, minus actor).
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_comment_added()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_workspace_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_recipient uuid;
begin
  select * into v_task from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;
  v_workspace_id := public.task_workspace_id(new.task_id);
  if v_workspace_id is null then
    return new;
  end if;

  v_actor_name := public.actor_display_name(v_actor_id);

  -- Distinct recipients: assignee and creator, never the actor.
  for v_recipient in
    select distinct r from unnest(array[v_task.assigned_to, v_task.created_by]) as r
    where r is not null and r is distinct from v_actor_id
  loop
    perform public.notify_user(
      v_workspace_id,
      v_recipient,
      v_actor_id,
      'comment_added',
      'New comment on "' || left(v_task.title, 100) || '"',
      v_actor_name || ': ' || left(new.content, 120),
      'task',
      new.task_id
    );
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Task / subtask status: completed -> workspace manager(s);
-- reopened (completed -> anything else) -> assignee.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_task_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_manager uuid;
  v_is_subtask boolean := new.parent_task_id is not null;
begin
  select p.workspace_id into v_workspace_id from public.projects p where p.id = new.project_id;
  if v_workspace_id is null then
    return new;
  end if;
  v_actor_name := public.actor_display_name(v_actor_id);

  if new.status = 'completed' and old.status <> 'completed' then
    for v_manager in
      select user_id from public.workspace_members
      where workspace_id = v_workspace_id and role = 'manager'
    loop
      perform public.notify_user(
        v_workspace_id,
        v_manager,
        v_actor_id,
        'task_completed',
        case when v_is_subtask then 'Subtask completed' else 'Task completed' end,
        '"' || left(new.title, 120) || '" was completed by ' || v_actor_name || '.',
        'task',
        new.id
      );
    end loop;
  elsif old.status = 'completed' and new.status <> 'completed' then
    perform public.notify_user(
      v_workspace_id,
      new.assigned_to,
      v_actor_id,
      'task_reopened',
      case when v_is_subtask then 'Subtask reopened' else 'Task reopened' end,
      '"' || left(new.title, 120) || '" was reopened by ' || v_actor_name || '.',
      'task',
      new.id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitation accepted -> workspace manager(s). The trigger fires on the
-- UPDATE that sets accepted_at, which accept_invitation() performs.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_invite_accepted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_manager uuid;
  v_actor_id uuid := auth.uid();
begin
  if old.accepted_at is not null or new.accepted_at is null then
    return new;
  end if;

  for v_manager in
    select user_id from public.workspace_members
    where workspace_id = new.workspace_id and role = 'manager'
  loop
    perform public.notify_user(
      new.workspace_id,
      v_manager,
      v_actor_id,
      'invite_accepted',
      'Invitation accepted',
      new.invited_email || ' accepted the invitation and joined the workspace.',
      'workspace',
      new.workspace_id
    );
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Project status changed -> members who have tasks in that project.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_project_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_recipient uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;
  v_actor_name := public.actor_display_name(v_actor_id);

  for v_recipient in
    select distinct t.assigned_to
    from public.tasks t
    where t.project_id = new.id
      and t.assigned_to is not null
      and t.assigned_to is distinct from v_actor_id
  loop
    perform public.notify_user(
      new.workspace_id,
      v_recipient,
      v_actor_id,
      'project_status_changed',
      'Project status changed',
      '"' || left(new.name, 120) || '" is now ' || replace(new.status::text, '_', ' ') || '.',
      'project',
      new.id
    );
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers. (trg_tasks_notify_assigned already exists from 0001; its
-- function was replaced above, so the trigger itself is unchanged.)
-- ---------------------------------------------------------------------------
create trigger trg_comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment_added();

create trigger trg_tasks_notify_status
  after update of status on public.tasks
  for each row execute function public.notify_on_task_status();

create trigger trg_invitations_notify_accepted
  after update of accepted_at on public.workspace_invitations
  for each row execute function public.notify_on_invite_accepted();

create trigger trg_projects_notify_status
  after update of status on public.projects
  for each row execute function public.notify_on_project_status();

-- ---------------------------------------------------------------------------
-- Indexes (spec): notifications by recipient + read state, for the unread
-- count and the All/Unread list. (activity_logs(workspace_id, created_at
-- desc) already exists in 0001 as idx_activity_logs_workspace_created;
-- tasks(status) goes in 0005 with the realtime publication.)
-- ---------------------------------------------------------------------------
create index idx_notifications_recipient_read
  on public.notifications (recipient_id, read_at, created_at desc);
