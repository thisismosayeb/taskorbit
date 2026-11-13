-- TaskOrbit Part 4, Track B — profile pictures.
--
-- Design decision — bucket is PUBLIC, reads are open:
--   Profile pictures are shown next to a user's name everywhere their
--   initials appear today (top bar, task rows, board cards, comments,
--   team list, activity). The `profiles_select` policy already lets any
--   workspace co-member read a profile's `avatar_url`, so the picture
--   itself is not more sensitive than the name it sits next to, and a
--   public bucket avoids signed-URL expiry complexity for images
--   rendered by server components. What stays private is the WRITE
--   side: storage RLS below allows upload / replace / delete ONLY for
--   objects whose first path segment is the caller's own user id
--   (`<user-id>/...`), so nobody can overwrite or delete another
--   user's picture. The server action (`lib/actions/avatar.ts`) adds a
--   second check: it only stores a URL that points at this bucket,
--   this Supabase project, and the caller's own folder.
--
-- Enforcement layers (no single layer is trusted alone):
--   1. Client validation in `lib/avatar.ts` — image type
--      (png/jpg/jpeg/webp/gif) and 2 MB size limit.
--   2. Storage INSERT/UPDATE policy below — same extension allow-list
--      (via `storage.extension(name)`) and the same 2 MB limit read
--      from the object's metadata (`coalesce(..., 0)` so an upload
--      whose metadata is not populated yet is not blocked outright;
--      layers 1 and 3 are the primary enforcement).
--   3. Server action URL validation (`isAllowedAvatarUrl`) before the
--      `profiles.avatar_url` write, which goes through the existing
--      `profiles_update_own` policy (own row only, no RLS bypass, no
--      service-role key).
--
-- Idempotency: every statement is safe to re-run (`IF NOT EXISTS`,
-- `ON CONFLICT DO NOTHING`, `DROP POLICY IF EXISTS`). This migration
-- does NOT edit 0001: `profiles.avatar_url` already exists there
-- (added in 0001 with `handle_new_user` reading it from signup
-- metadata), so the `ADD COLUMN IF NOT EXISTS` below is a no-op on
-- databases built from 0001 and only matters for any older snapshot.

alter table public.profiles
  add column if not exists avatar_url text;

-- Storage bucket for profile pictures (public: see header).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- If the bucket already existed as private (e.g. created by hand),
-- make it public so the pictures render without signed URLs.
update storage.buckets set public = true where id = 'avatars';

-- ---------------------------------------------------------------------------
-- Storage RLS on storage.objects (bucket 'avatars').
-- Object layout: <user-id>/avatar-<timestamp>.<ext> — the first path
-- segment MUST be the caller's own auth.uid().
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select_public on storage.objects;
create policy avatars_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp', 'gif')
    and coalesce((metadata ->> 'size')::bigint, 0) <= 2097152
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.extension(name) in ('png', 'jpg', 'jpeg', 'webp', 'gif')
    and coalesce((metadata ->> 'size')::bigint, 0) <= 2097152
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
