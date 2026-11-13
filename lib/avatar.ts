// Profile pictures (Part 4, Track B) — pure helpers, no I/O, so they are
// unit-testable without Supabase. The upload flow is:
//   1. client validates the file with validateAvatarFile (type + 2 MB),
//   2. client uploads to `avatars/<user-id>/avatar-<timestamp>.<ext>`
//      via the Supabase Storage browser client (storage RLS enforces
//      the own-folder rule in the database too),
//   3. server action saveAvatarUrl stores the public URL, but only
//      after isAllowedAvatarUrl proves it points at this bucket, this
//      Supabase project, and the caller's own folder.

export const AVATAR_BUCKET = "avatars";

/** 2 MB — enforced client-side here, in the storage policy (0008), and
 *  documented in the upload UI; the server action validates the URL. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const AVATAR_ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

export type AvatarFileError = "invalid-type" | "too-large";

/** Returns null when the file may be uploaded, else the failure reason. */
export function validateAvatarFile(file: { type: string; size: number }): AvatarFileError | null {
  if (!(AVATAR_ALLOWED_TYPES as readonly string[]).includes(file.type)) return "invalid-type";
  if (file.size > AVATAR_MAX_BYTES) return "too-large";
  return null;
}

function extensionForFile(fileName: string, mimeType: string): string | null {
  const fromName = fileName.split(".").pop()?.toLowerCase() ?? "";
  if ((AVATAR_ALLOWED_EXTENSIONS as readonly string[]).includes(fromName)) return fromName;
  // Fall back to the MIME type when the name has no (or a wrong) extension.
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return null;
}

/**
 * Storage path for a new upload: `<user-id>/avatar-<timestamp>.<ext>`.
 * The timestamp makes every upload a new object, so replacing a picture
 * never overwrites (and never needs `upsert`) — the old object is
 * deleted best-effort after the new URL is saved. Returns null when the
 * file's extension/MIME type is not an allowed image type.
 */
export function buildAvatarPath(
  userId: string,
  fileName: string,
  mimeType: string,
  now: number = Date.now(),
): string | null {
  if (!userId) return null;
  const ext = extensionForFile(fileName, mimeType);
  if (!ext) return null;
  return `${userId}/avatar-${now}.${ext}`;
}

/** Initials shown when no picture is set (or the picture fails to load).
 *  Same rules as the Avatar component always used: first + last word
 *  initials, or the first two letters of a single word / email. */
export function avatarInitials(name: string | null | undefined, email?: string | null): string {
  const source = (name || "").trim() || (email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PUBLIC_PREFIX = "/storage/v1/object/public/avatars/";

/**
 * Extracts the storage path (`<user-id>/avatar-....png`) from a public
 * avatar URL, or null when the URL is not an avatars-bucket public URL.
 * Used to delete the previous picture after a replace/remove; never
 * trusts a URL outside this bucket. When `supabaseUrl` is given, the
 * URL must also be on the same origin.
 */
export function parseAvatarStoragePath(publicUrl: string | null | undefined, supabaseUrl?: string): string | null {
  if (!publicUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return null;
  }
  if (supabaseUrl) {
    try {
      if (parsed.origin !== new URL(supabaseUrl).origin) return null;
    } catch {
      return null;
    }
  }
  if (!parsed.pathname.startsWith(AVATAR_PUBLIC_PREFIX)) return null;
  const path = decodeURIComponent(parsed.pathname.slice(AVATAR_PUBLIC_PREFIX.length));
  if (!path || path.includes("..") || !path.includes("/")) return null;
  return path;
}

/**
 * Server-side guard for the URL a client asks to store as its avatar:
 * it must be a public URL in the `avatars` bucket, on this Supabase
 * project, inside the caller's own folder. Anything else (another
 * user's picture, an external image host, a non-storage path) is
 * rejected so a forged request cannot point a profile at an arbitrary
 * image.
 */
export function isAllowedAvatarUrl(url: string, supabaseUrl: string, userId: string): boolean {
  const path = parseAvatarStoragePath(url, supabaseUrl);
  if (!path) return false;
  return path.startsWith(`${userId}/`);
}
