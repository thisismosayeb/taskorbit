-- TaskOrbit — Part 1, migration 0002: atomic RPCs for workspace creation and
-- invitation acceptance. Both are SECURITY DEFINER with search_path = '',
-- EXECUTE revoked from public and granted only to authenticated users.
-- Depends on 0001 (tables, public.sha256_hex, activity_logs).

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_slug text;
  v_suffix text;
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;
  if v_name is null or v_name = '' then
    raise exception 'Workspace name is required.';
  end if;
  if char_length(v_name) > 100 then
    raise exception 'Workspace name must be 100 characters or fewer.';
  end if;

  -- Human-readable slug plus a short random suffix so it stays unique.
  v_suffix := substr(md5(v_user_id::text || clock_timestamp()::text || random()::text), 1, 6);
  v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  v_slug := left(v_slug, 60) || '-' || v_suffix;

  insert into public.workspaces (name, slug, timezone, created_by)
  values (v_name, v_slug, 'Asia/Dhaka', v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'manager');

  insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
  values (v_workspace_id, null, null, v_user_id, 'workspace.created',
          jsonb_build_object('name', v_name));

  return v_workspace_id;
end;
$$;

revoke execute on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated, service_role;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_inv public.workspace_invitations%rowtype;
  v_hash text;
  v_updated int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Invitation token is required.';
  end if;

  -- The raw token is never stored; only its SHA-256 hex hash is compared.
  v_hash := public.sha256_hex(btrim(p_token));

  select * into v_inv
  from public.workspace_invitations
  where token_hash = v_hash;

  if not found then
    raise exception 'Invitation not found or already used.';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was revoked.';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation was already used.';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'This invitation has expired.';
  end if;

  -- The logged-in user's verified email must match the invited email.
  select lower(email) into v_email from auth.users where id = v_user_id;
  if v_email is null then
    raise exception 'Could not verify your email address.';
  end if;
  if v_email <> v_inv.invited_email then
    raise exception 'This invitation was sent to a different email address.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_user_id, 'developer')
  on conflict (workspace_id, user_id) do nothing;

  -- Atomic reuse guard: only the first concurrent caller marks it accepted.
  update public.workspace_invitations
  set accepted_at = now()
  where id = v_inv.id and accepted_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'This invitation was already used.';
  end if;

  insert into public.activity_logs (workspace_id, project_id, task_id, actor_id, action, metadata)
  values (v_inv.workspace_id, null, null, v_user_id, 'invitation.accepted',
          jsonb_build_object('invitation_id', v_inv.id));

  return v_inv.workspace_id;
end;
$$;

revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated, service_role;
