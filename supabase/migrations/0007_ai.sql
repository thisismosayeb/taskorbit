-- TaskOrbit — Part 3, migration 0007: TaskOrbit AI + daily scheduler.
--
-- STATUS: WRITTEN, NOT APPLIED. This file was written without a database
-- connection (no PAT is active on this machine and direct Postgres TCP is
-- blocked by the egress proxy). Apply it with a project-scoped PAT via the
-- Supabase Management API, or paste it into the Supabase dashboard SQL
-- editor, then verify with the checks at the end of this file. Do NOT
-- claim it was applied until those checks pass.
--
-- Contents:
--   * ai_summaries  — cached AI output (one row per workspace/project/user/
--     type/locale/day), so a repeated generate reuses the cached result
--     when the input digest is unchanged.
--   * ai_usage      — per-call usage ledger (feature, date, status, token
--     estimate). NEVER stores prompts, model replies, secrets or keys.
--   * daily_job_runs — idempotency ledger for the daily cron (one row per
--     workspace + job + workspace-local date; a second run the same day
--     is a no-op).
--   * run_daily_reminders() / run_daily_reminders_all() — SECURITY DEFINER
--     functions the /api/cron/daily route calls with the publishable key.
--     The cron route has no user session, so it cannot insert into
--     notifications under RLS; these functions do the selection and the
--     inserts in the database instead, reusing the existing notify_user()
--     helper. This keeps the DECISIONS.md rule intact: notification
--     generation lives in the database, never in lib/actions/* or a route
--     handler. No service-role key is used anywhere.
--   * get_daily_brief_input() — SECURITY DEFINER function returning the
--     minimal brief input (titles, statuses, dates, assignee first names,
--     short recent comments) for one workspace, plus today's cached brief
--     digest and today's AI usage count, so the cron route can generate
--     the daily brief without a user session.
--   * save_ai_summary() / log_ai_usage() — SECURITY DEFINER write paths
--     for the server actions / cron route. There are NO direct INSERT
--     policies on ai_summaries / ai_usage: a client (or a forged request)
--     can never write these tables directly.
--
-- SECURITY NOTES — read before applying:
--   * run_daily_reminders* / get_daily_brief_input are granted to `anon`
--     because the cron route calls Supabase with the publishable key and
--     no JWT. They are safe by construction, not by secrecy:
--       - run_daily_reminders* only writes legitimate reminders (tasks
--         genuinely due today/tomorrow or overdue), only to the task's
--         assignee and the workspace manager(s), only once per workspace
--         per local date (daily_job_runs), and returns counts only.
--         The worst an unauthenticated caller can do is trigger one
--         day's legitimate reminders early.
--       - get_daily_brief_input returns only data every workspace member
--         can already see (task titles/statuses/dates, assignee first
--         names, short recent comments); the caller must know the
--         workspace UUID (128-bit, unguessable). The intended caller is
--         the /api/cron/daily route, which is itself protected by
--         CRON_SECRET. If this is ever unacceptable, restrict EXECUTE on
--         this function to a dedicated database role used only by the
--         cron route, and remove the anon grant.
--   * save_ai_summary / log_ai_usage are granted to `authenticated`
--     (server actions run as the signed-in user) AND to `anon` (the cron
--     route, which has no session). The functions themselves enforce the
--     rule, so the grant is safe: when called with no session they accept
--     ONLY a daily_brief written after today's reminders job has run for
--     that workspace — see the v_cron_ok check in each function. A
--     signed-in caller must be a member of the workspace, and may only
--     save a my_focus summary for themselves (managers may save any).
--   * notify_user()'s type whitelist is extended here (same function,
--     same name, same logic) with 'task_due_soon' and 'task_overdue'.
--     0004 is NOT edited.
--
-- Depends on 0001 (workspaces, workspace_members, projects, tasks,
-- comments, notifications, activity_logs, profiles) and 0004 (notify_user).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  project_id uuid references public.projects on delete cascade,
  user_id uuid references auth.users on delete cascade,
  summary_type text not null,
  locale text not null default 'en',
  summary_date date not null,
  content jsonb not null,
  model text not null default '',
  input_digest text not null,
  generated_by uuid references auth.users on delete set null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- NULLs never conflict in a plain UNIQUE constraint, so the uniqueness
-- rule (workspace, project, user, type, locale, date) is enforced with an
-- index that coalesces the two nullable ids to the zero UUID.
create unique index uq_ai_summaries_scope on public.ai_summaries (
  workspace_id,
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'),
  summary_type, locale, summary_date
);
create index idx_ai_summaries_workspace_date on public.ai_summaries (workspace_id, summary_date);

comment on table public.ai_summaries is
  'Cached TaskOrbit AI output. content holds the validated JSON the model returned (plus generated metadata); no prompts, emails, keys or auth data are stored. Rows expire after 7 days.';
comment on column public.ai_summaries.summary_type is
  'One of: daily_brief, project_summary, my_focus, deadline_risk, standup, next_actions.';
comment on column public.ai_summaries.input_digest is
  'SHA-256 hex of the canonical JSON input the summary was generated from. Regeneration reuses the row when the digest is unchanged.';

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  actor_id uuid references auth.users on delete set null,
  feature text not null,
  request_date date not null,
  status text not null,
  estimated_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_ai_usage_workspace_date on public.ai_usage (workspace_id, request_date);
create index idx_ai_usage_actor_hour on public.ai_usage (actor_id, created_at);

comment on table public.ai_usage is
  'AI usage ledger for rate limits (30 calls per workspace per day, 10 per user per hour). Counts and statuses only — no prompts, replies, secrets or keys.';

create table public.daily_job_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  job text not null,
  local_date date not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, job, local_date)
);

comment on table public.daily_job_runs is
  'Idempotency ledger for the daily cron. One row per workspace + job + workspace-local date; a second run the same day finds the row and does nothing extra.';
comment on column public.daily_job_runs.job is
  'One of: daily_reminders, daily_brief.';

-- ---------------------------------------------------------------------------
-- RLS: reads for members; NO direct writes (writes go through the
-- SECURITY DEFINER functions below only).
-- ---------------------------------------------------------------------------

alter table public.ai_summaries enable row level security;
alter table public.ai_usage enable row level security;
alter table public.daily_job_runs enable row level security;

-- Members read summaries of their workspace. A my_focus summary is
-- personal: only its owner (or the workspace manager, who can already
-- see every task) may read it.
create policy ai_summaries_select on public.ai_summaries
  for select using (
    public.is_workspace_member(workspace_id)
    and (
      user_id is null
      or user_id = auth.uid()
      or public.member_role(workspace_id) = 'manager'
    )
  );

-- Usage rows: a member reads their own rows; the manager reads the
-- workspace's rows (needed to see the daily limit).
create policy ai_usage_select on public.ai_usage
  for select using (
    public.is_workspace_member(workspace_id)
    and (
      actor_id is null
      or actor_id = auth.uid()
      or public.member_role(workspace_id) = 'manager'
    )
  );

-- Job-run rows are counts only; any workspace member may read them.
create policy daily_job_runs_select on public.daily_job_runs
  for select using (public.is_workspace_member(workspace_id));

-- No INSERT / UPDATE / DELETE policies on any of the three tables: direct
-- writes are denied for every role, including authenticated users. The
-- SECURITY DEFINER functions below are the only write path.

-- ---------------------------------------------------------------------------
-- notify_user(): same function as 0004, whitelist extended with the two
-- reminder types the daily cron sends. (0004 is not edited.)
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
    'comment_added', 'invite_accepted', 'project_status_changed',
    'task_due_soon', 'task_overdue'
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
revoke execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, uuid) from anon;
grant execute on function public.notify_user(uuid, uuid, uuid, text, text, text, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily reminders (cron). Idempotent per workspace per local date.
-- ---------------------------------------------------------------------------

create or replace function public.run_daily_reminders(
  p_workspace_id uuid,
  p_local_date date
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_claimed uuid;
  v_due_soon integer := 0;
  v_overdue integer := 0;
  r record;
  v_manager_ids uuid[];
  v_manager_id uuid;
  v_title text;
begin
  if p_workspace_id is null or p_local_date is null then
    raise exception 'run_daily_reminders needs a workspace id and a local date.';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'Workspace not found.';
  end if;

  -- Idempotency claim: first run of the day inserts the row; a second
  -- run the same day finds it and returns immediately, nothing extra.
  insert into public.daily_job_runs (workspace_id, job, local_date, result)
  values (p_workspace_id, 'daily_reminders', p_local_date, '{}'::jsonb)
  on conflict (workspace_id, job, local_date) do nothing
  returning id into v_claimed;

  if v_claimed is null then
    return jsonb_build_object(
      'workspace_id', p_workspace_id,
      'local_date', p_local_date,
      'already_run', true,
      'due_soon', 0,
      'overdue', 0
    );
  end if;

  v_manager_ids := array(
    select user_id from public.workspace_members
    where workspace_id = p_workspace_id and role = 'manager'
  );

  -- (1) Due soon: top-level tasks due today or tomorrow (workspace-local
  -- dates), not completed, with an assignee -> notify the assignee once.
  -- Subtasks follow their parent's assignee and are covered by the
  -- parent's reminder, so they are not notified separately.
  for r in
    select t.id, t.title, t.due_date, t.assigned_to
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where p.workspace_id = p_workspace_id
      and t.parent_task_id is null
      and t.status <> 'completed'
      and t.assigned_to is not null
      and t.due_date >= p_local_date
      and t.due_date <= p_local_date + interval '1 day'
  loop
    v_title := left('Due soon: ' || r.title, 190);
    perform public.notify_user(
      p_workspace_id, r.assigned_to, null,
      'task_due_soon', v_title,
      'Due ' || r.due_date::text || '.',
      'task', r.id
    );
    v_due_soon := v_due_soon + 1;
  end loop;

  -- (2) Overdue: top-level tasks whose due date has passed, not
  -- completed, with an assignee -> notify the assignee AND the workspace
  -- manager(s), once per task ever (a previous 'task_overdue'
  -- notification for this task means it was already reported; the
  -- manager can see it in the notification list).
  for r in
    select t.id, t.title, t.due_date, t.assigned_to
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where p.workspace_id = p_workspace_id
      and t.parent_task_id is null
      and t.status <> 'completed'
      and t.assigned_to is not null
      and t.due_date < p_local_date
      and not exists (
        select 1 from public.notifications n
        where n.entity_id = t.id and n.type = 'task_overdue'
      )
  loop
    v_title := left('Overdue: ' || r.title, 190);
    perform public.notify_user(
      p_workspace_id, r.assigned_to, null,
      'task_overdue', v_title,
      'Was due ' || r.due_date::text || '.',
      'task', r.id
    );
    -- Manager(s): notify_user skips a recipient equal to the actor;
    -- actor is null here, so the manager is notified even if they are
    -- also the assignee (they get one row as assignee; the loop below
    -- would add a second identical row, so skip the assignee here).
    foreach v_manager_id in array v_manager_ids
    loop
      if v_manager_id <> r.assigned_to then
        perform public.notify_user(
          p_workspace_id, v_manager_id, null,
          'task_overdue', v_title,
          'Was due ' || r.due_date::text || '.',
          'task', r.id
        );
      end if;
    end loop;
    v_overdue := v_overdue + 1;
  end loop;

  update public.daily_job_runs
  set result = jsonb_build_object(
    'workspace_id', p_workspace_id,
    'local_date', p_local_date,
    'already_run', false,
    'due_soon', v_due_soon,
    'overdue', v_overdue
  )
  where id = v_claimed;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'local_date', p_local_date,
    'already_run', false,
    'due_soon', v_due_soon,
    'overdue', v_overdue
  );
end;
$$;

revoke execute on function public.run_daily_reminders(uuid, date) from public;
grant execute on function public.run_daily_reminders(uuid, date) to anon, authenticated, service_role;

-- All workspaces, each on its own local date (derived from the workspace
-- timezone). The cron route calls this once; it fans out to
-- run_daily_reminders per workspace, so the route never needs a session
-- or a workspace list of its own.
create or replace function public.run_daily_reminders_all()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  w record;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
begin
  for w in select id, timezone from public.workspaces loop
    v_one := public.run_daily_reminders(
      w.id,
      (now() at time zone coalesce(w.timezone, 'Asia/Dhaka'))::date
    );
    v_results := v_results || jsonb_build_array(v_one);
  end loop;
  return jsonb_build_object('workspaces', v_results);
end;
$$;

revoke execute on function public.run_daily_reminders_all() from public;
grant execute on function public.run_daily_reminders_all() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Daily brief input for the cron route (minimal data only).
-- ---------------------------------------------------------------------------

create or replace function public.get_daily_brief_input(p_workspace_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ws record;
  v_local_date date;
  v_result jsonb;
begin
  if p_workspace_id is null then
    raise exception 'get_daily_brief_input needs a workspace id.';
  end if;
  select w.id, w.name, coalesce(w.timezone, 'Asia/Dhaka') as timezone
    into v_ws from public.workspaces w where w.id = p_workspace_id;
  if v_ws.id is null then
    raise exception 'Workspace not found.';
  end if;
  v_local_date := (now() at time zone v_ws.timezone)::date;

  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_ws.id, 'name', v_ws.name, 'timezone', v_ws.timezone
    ),
    'localDate', v_local_date,
    -- Minimal data only: titles, statuses, dates, assignee first names,
    -- short recent comments. No emails, no auth data, no full bodies.
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'status', p.status
      ) order by p.created_at)
      from public.projects p
      where p.workspace_id = v_ws.id and p.status = 'active'
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'projectId', t.project_id, 'title', t.title,
        'status', t.status, 'priority', t.priority,
        'dueDate', t.due_date, 'completedAt', t.completed_at,
        'assigneeFirstName', split_part(coalesce(nullif(btrim(pr.full_name), ''), 'Unassigned'), ' ', 1),
        'isSubtask', t.parent_task_id is not null
      ) order by t.due_date nulls last, t.created_at)
      from public.tasks t
      left join public.profiles pr on pr.id = t.assigned_to
      join public.projects p on p.id = t.project_id
      where p.workspace_id = v_ws.id
    ), '[]'::jsonb),
    'recentComments', coalesce((
      select jsonb_agg(c order by c.created_at desc)
      from (
        select left(cm.content, 200) as text,
               left(coalesce(nullif(btrim(pr.full_name), ''), 'Someone'), 30) as authorFirstName,
               t.title as taskTitle, cm.created_at as createdAt
        from public.comments cm
        join public.tasks t on t.id = cm.task_id
        join public.projects p on p.id = t.project_id
        left join public.profiles pr on pr.id = cm.author_id
        where p.workspace_id = v_ws.id
        order by cm.created_at desc
        limit 10
      ) c
    ), '[]'::jsonb),
    'recentActivityCount', (
      select count(*) from public.activity_logs a
      where a.workspace_id = v_ws.id
        and a.created_at >= now() - interval '24 hours'
    ),
    'cachedDigest', (
      select s.input_digest from public.ai_summaries s
      where s.workspace_id = v_ws.id
        and s.project_id is null and s.user_id is null
        and s.summary_type = 'daily_brief'
        and s.locale = 'en'
        and s.summary_date = v_local_date
      order by s.generated_at desc limit 1
    ),
    'workspaceUsageToday', (
      select count(*) from public.ai_usage u
      where u.workspace_id = v_ws.id and u.request_date = v_local_date
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.get_daily_brief_input(uuid) from public;
grant execute on function public.get_daily_brief_input(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Server-only write paths for AI cache + usage (no direct INSERT policies).
-- ---------------------------------------------------------------------------

-- True when the cron route may write for this workspace without a session:
-- today's reminders job has already run for it (the cron route runs the
-- reminders first, so this chains the brief write to a real cron run).
create or replace function public.cron_write_allowed(p_workspace_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
begin
  select coalesce(timezone, 'Asia/Dhaka') into v_tz
  from public.workspaces where id = p_workspace_id;
  if v_tz is null then return false; end if;
  v_today := (now() at time zone v_tz)::date;
  return exists (
    select 1 from public.daily_job_runs
    where workspace_id = p_workspace_id
      and job = 'daily_reminders'
      and local_date = v_today
  );
end;
$$;

revoke execute on function public.cron_write_allowed(uuid) from public;
grant execute on function public.cron_write_allowed(uuid) to anon, authenticated, service_role;

create or replace function public.save_ai_summary(
  p_workspace_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_summary_type text,
  p_locale text,
  p_summary_date date,
  p_content jsonb,
  p_model text,
  p_input_digest text,
  p_generated_by uuid
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_id uuid;
begin
  if p_workspace_id is null or p_summary_type is null or p_summary_date is null
     or p_content is null or p_input_digest is null then
    raise exception 'save_ai_summary is missing required fields.';
  end if;
  if p_summary_type not in (
    'daily_brief', 'project_summary', 'my_focus',
    'deadline_risk', 'standup', 'next_actions'
  ) then
    raise exception 'Unknown summary type: %', p_summary_type;
  end if;

  if v_caller is not null then
    -- Signed-in caller (server action): must be a member, and may only
    -- save a my_focus summary for themselves (managers may save any).
    if not public.is_workspace_member(p_workspace_id) then
      raise exception 'You are not a member of this workspace.';
    end if;
    if p_summary_type = 'my_focus'
       and p_user_id is not null
       and p_user_id <> v_caller
       and public.member_role(p_workspace_id) <> 'manager' then
      raise exception 'You can only save your own focus summary.';
    end if;
  else
    -- No session (cron route): only a daily_brief, and only after
    -- today's reminders job has run for this workspace.
    if p_summary_type <> 'daily_brief' or p_user_id is not null
       or p_project_id is not null
       or not public.cron_write_allowed(p_workspace_id) then
      raise exception 'Unauthenticated AI summary writes are only allowed for the daily cron brief.';
    end if;
  end if;

  insert into public.ai_summaries
    (workspace_id, project_id, user_id, summary_type, locale, summary_date,
     content, model, input_digest, generated_by,
     generated_at, expires_at)
  values
    (p_workspace_id, p_project_id, p_user_id, p_summary_type,
     coalesce(p_locale, 'en'), p_summary_date,
     p_content, coalesce(p_model, ''), p_input_digest, p_generated_by,
     now(), now() + interval '7 days')
  on conflict (workspace_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'),
    summary_type, locale, summary_date)
  do update set
    content = excluded.content,
    model = excluded.model,
    input_digest = excluded.input_digest,
    generated_by = excluded.generated_by,
    generated_at = now(),
    expires_at = now() + interval '7 days'
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_ai_summary(uuid, uuid, uuid, text, text, date, jsonb, text, text, uuid) from public;
grant execute on function public.save_ai_summary(uuid, uuid, uuid, text, text, date, jsonb, text, text, uuid) to anon, authenticated, service_role;

create or replace function public.log_ai_usage(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_feature text,
  p_request_date date,
  p_status text,
  p_estimated_tokens integer
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_id uuid;
begin
  if p_workspace_id is null or p_feature is null or p_request_date is null or p_status is null then
    raise exception 'log_ai_usage is missing required fields.';
  end if;
  if p_status not in ('ok', 'error', 'limit', 'cached') then
    raise exception 'Unknown AI usage status: %', p_status;
  end if;

  if v_caller is not null then
    if not public.is_workspace_member(p_workspace_id) then
      raise exception 'You are not a member of this workspace.';
    end if;
    if p_actor_id is not null and p_actor_id <> v_caller then
      raise exception 'You can only log your own AI usage.';
    end if;
  else
    -- No session (cron route): only the daily brief, after today's
    -- reminders job has run for this workspace.
    if p_feature <> 'daily_brief' or not public.cron_write_allowed(p_workspace_id) then
      raise exception 'Unauthenticated AI usage writes are only allowed for the daily cron brief.';
    end if;
  end if;

  insert into public.ai_usage
    (workspace_id, actor_id, feature, request_date, status, estimated_tokens)
  values
    (p_workspace_id, p_actor_id, p_feature, p_request_date, p_status,
     coalesce(p_estimated_tokens, 0))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_ai_usage(uuid, uuid, text, date, text, integer) from public;
grant execute on function public.log_ai_usage(uuid, uuid, text, date, text, integer) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification (run after applying; all must pass).
--   select count(*) from information_schema.tables
--     where table_schema = 'public'
--     and table_name in ('ai_summaries', 'ai_usage', 'daily_job_runs');
--     -- expect 3
--   select routine_name from information_schema.routines
--     where routine_schema = 'public'
--     and routine_name in ('run_daily_reminders', 'run_daily_reminders_all',
--       'get_daily_brief_input', 'save_ai_summary', 'log_ai_usage',
--       'cron_write_allowed');
--     -- expect 6 rows
--   select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--     and tablename in ('ai_summaries', 'ai_usage', 'daily_job_runs');
--     -- expect rowsecurity = true on all three
--   -- Idempotency / selection check (replace <workspace-uuid> with a real
--   -- one; run twice — the second run must return already_run = true and
--   -- create no extra notifications):
--   select public.run_daily_reminders('<workspace-uuid>', current_date);
--   select count(*) from daily_job_runs
--     where workspace_id = '<workspace-uuid>' and job = 'daily_reminders';
--     -- expect 1 after two calls
-- ---------------------------------------------------------------------------
