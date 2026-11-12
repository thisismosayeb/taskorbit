-- TaskOrbit Part 2 — repair the Part 1 delete-activity triggers.
--
-- BUG (verified live 2026-11-12): deleting a task or a project fails with
--   409 / 23503  "insert or update on table activity_logs violates foreign
--   key constraint activity_logs_task_id_fkey /
--   activity_logs_project_id_fkey"
-- because log_task_activity / log_project_activity, on DELETE, inserted an
-- activity_logs row whose task_id / project_id was the id of the row that
-- had just been deleted. The FK then had no parent row, so the whole
-- DELETE was rolled back. Consequence: deleteTask / deleteProject could
-- never succeed, and a "task deleted / project deleted" activity row
-- could never exist.
--
-- FIX: the DELETE branches now insert the row with task_id / project_id
-- NULL (the deleted object's title stays in metadata, and workspace_id
-- is kept, so the row still appears in the workspace activity log). The
-- INSERT / UPDATE branches are unchanged. Do NOT edit 0001_init.sql —
-- it is already applied to the test project; this repair migration
-- replaces the two functions in place (same names, so the existing
-- triggers keep working).

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
    -- The project row is gone, so project_id must be NULL here: the FK
    -- activity_logs_project_id_fkey has no parent row to point at.
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (old.workspace_id, null, null, v_actor_id, 'project.deleted',
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
    -- The task row is gone (and its project's tasks are gone with it on a
    -- project delete), so task_id and project_id must be NULL here: the
    -- FKs activity_logs_task_id_fkey / activity_logs_project_id_fkey
    -- have no parent rows to point at.
    insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
    values (v_workspace_id, null, null, v_actor_id, 'task.deleted',
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
