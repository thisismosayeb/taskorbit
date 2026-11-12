-- TaskOrbit — Part 2, migration 0003: atomic member-removal RPC for the
-- Team page upgrade.
--
-- NO RLS POLICY CHANGE for workspace_invitations is included, deliberately.
-- The Part 1 report ("Pending invitations" stuck at 0 after creating an
-- invite) was investigated against the live test project on 2026-11-12:
--   * the SELECT policy invitations_select_manager (member_role = 'manager')
--     returns invitation rows for the manager, and
--   * the team page's exact pending query (accepted_at IS NULL,
--     revoked_at IS NULL, expires_at > now()) returns a freshly inserted
--     pending invite for the manager.
-- The data layer is therefore correct; the stale (0) was a client-render
-- problem (the page never showed the just-created invite after the
-- refresh), fixed in components/team/pending-invites.tsx by keeping the
-- pending list in client state seeded from the server and appending the
-- newly created invite immediately. 0001/0002 are untouched.
--
-- Depends on 0001 (workspace_members, tasks, projects, activity_logs,
-- prevent_last_manager_removal trigger, notify_on_task_assigned trigger).

-- ---------------------------------------------------------------------------
-- remove_workspace_member: manager removes a developer from a workspace.
-- Atomically (single transaction, single RPC call):
--   1. unassigns the developer's OPEN tasks in the workspace (completed
--      tasks stay assigned as a historical record),
--   2. deletes the workspace_members row,
--   3. writes a 'member.removed' activity_log row.
-- No notification is created: notify_on_task_assigned() only fires when
-- new.assigned_to is NOT null, and unassigning sets it to null.
-- The manager cannot remove themselves, and the workspace manager can
-- never be removed (the trg_members_prevent_last_manager trigger is the
-- backstop). Returns the number of open tasks that became unassigned.
-- ---------------------------------------------------------------------------
create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.workspace_role;
  v_target_role public.workspace_role;
  v_target_name text;
  v_unassigned int;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated.';
  end if;
  if p_workspace_id is null then
    raise exception 'Workspace id is required.';
  end if;
  if p_user_id is null then
    raise exception 'Member id is required.';
  end if;

  -- Only the workspace manager may remove a member.
  select wm.role into v_actor_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = v_actor_id;
  if v_actor_role is null then
    raise exception 'You are not a member of this workspace.';
  end if;
  if v_actor_role <> 'manager' then
    raise exception 'Only the workspace manager can remove members.';
  end if;

  -- The manager cannot remove themselves.
  if p_user_id = v_actor_id then
    raise exception 'You cannot remove yourself from the workspace.';
  end if;

  -- The target must be a member of this workspace, and must be a
  -- developer — the single manager is never removable.
  select wm.role into v_target_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;
  if v_target_role is null then
    raise exception 'That person is not a member of this workspace.';
  end if;
  if v_target_role = 'manager' then
    raise exception 'The workspace manager cannot be removed.';
  end if;

  select coalesce(p.full_name, '') into v_target_name
  from public.profiles p where p.id = p_user_id;

  -- 1) Count, then unassign, their OPEN tasks in this workspace
  -- (top-level tasks and subtasks). The count is taken before the
  -- update: the trg_tasks_cascade_reassign trigger reassigns a parent's
  -- subtasks as part of the same statement, so counting afterwards
  -- would miss subtasks already unassigned by the cascade.
  select count(*) into v_unassigned
  from public.tasks t
  join public.projects p on p.id = t.project_id
  where p.workspace_id = p_workspace_id
    and t.assigned_to = p_user_id
    and t.status <> 'completed';

  update public.tasks t
  set assigned_to = null
  from public.projects p
  where t.project_id = p.id
    and p.workspace_id = p_workspace_id
    and t.assigned_to = p_user_id
    and t.status <> 'completed';

  -- 2) Remove the membership (member DELETE logs nothing by trigger).
  delete from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = p_user_id;
  if not found then
    raise exception 'That person is not a member of this workspace.';
  end if;

  -- 3) Log the removal.
  insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
  values (p_workspace_id, null, null, v_actor_id, 'member.removed',
          jsonb_build_object('user_id', p_user_id, 'name', v_target_name,
                             'open_tasks_unassigned', v_unassigned));

  return v_unassigned;
end;
$$;

revoke execute on function public.remove_workspace_member(uuid, uuid) from public;
-- NOTE (verified 2026-11-12 on taskorbit-test): revoke from public alone
-- does NOT remove anon's EXECUTE here — anon holds an explicit grant
-- (same ACL pattern as Part 1's create_workspace/accept_invitation), so
-- revoke from anon explicitly as well.
revoke execute on function public.remove_workspace_member(uuid, uuid) from anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated, service_role;
