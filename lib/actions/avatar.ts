// Profile picture save (Part 4, Track B).
//
// The picture bytes are uploaded by the browser client straight to
// Supabase Storage (`avatars/<user-id>/...`, storage RLS enforces the
// own-folder rule). This action only stores the resulting public URL
// on the caller's own profile row, through the existing
// `profiles_update_own` policy (id = auth.uid()) — no RLS bypass, no
// service-role key. The URL is validated first (isAllowedAvatarUrl):
// it must be a public URL in this bucket, on this Supabase project,
// inside the caller's own folder. Passing null removes the picture
// (the UI falls back to initials).

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAvatarUrl } from "@/lib/avatar";

export async function saveAvatarUrl(url: string | null): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to change your profile picture." };

  if (url !== null) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !isAllowedAvatarUrl(url, supabaseUrl, user.id)) {
      return { ok: false, error: "That picture URL is not valid. Upload a picture from this page instead." };
    }
  }

  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your profile picture. Try again." };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
