-- TaskOrbit — Part 2, migration 0005: realtime publication (+ analytics index).
-- Adds tasks, comments and notifications to the supabase_realtime
-- publication so the app can subscribe with postgres_changes. Subscriptions
-- are still RLS-respecting: a client only receives rows its SELECT policies
-- allow (e.g. notifications only where recipient_id = auth.uid()).
-- REPLICA IDENTITY FULL is set so UPDATE / DELETE payloads carry the old
-- row as well as the new one.
-- The publication guard is a DO block because a fresh local Postgres has no
-- supabase_realtime publication, while a hosted Supabase project does; the
-- duplicate_object handler makes the migration re-runnable.
-- Depends on 0001 (tables).

-- Spec index for analytics/board filtering by status.
create index if not exists idx_tasks_status on public.tasks (status);

alter table public.tasks replica identity full;
alter table public.comments replica identity full;
alter table public.notifications replica identity full;

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.tasks, public.comments, public.notifications';
    exception when duplicate_object then
      -- Table already in the publication (re-run); nothing to do.
      null;
    end;
  end if;
end
$do$;
