// Profile pictures (Part 4, Track B) — pure-helper unit tests. These run
// without Supabase: validation rules, storage-path building, public-URL
// parsing, the server-action URL guard, and the initials fallback.
import { describe, it, expect } from "vitest";
import {
  AVATAR_MAX_BYTES,
  avatarInitials,
  buildAvatarPath,
  isAllowedAvatarUrl,
  parseAvatarStoragePath,
  validateAvatarFile,
} from "@/lib/avatar";

const SUPABASE_URL = "https://abcdefghijk.supabase.co";
const USER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-8888-7777-6666-555555555555";
const PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/avatars/${USER_ID}/avatar-1700000000000.png`;

describe("validateAvatarFile", () => {
  it("accepts png/jpg/jpeg/webp/gif at or under 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(validateAvatarFile({ type, size: AVATAR_MAX_BYTES })).toBeNull();
      expect(validateAvatarFile({ type, size: 1024 })).toBeNull();
    }
  });

  it("rejects non-image types (svg, pdf, octet-stream)", () => {
    expect(validateAvatarFile({ type: "image/svg+xml", size: 100 })).toBe("invalid-type");
    expect(validateAvatarFile({ type: "application/pdf", size: 100 })).toBe("invalid-type");
    expect(validateAvatarFile({ type: "application/octet-stream", size: 100 })).toBe("invalid-type");
    expect(validateAvatarFile({ type: "", size: 100 })).toBe("invalid-type");
  });

  it("rejects files over 2 MB (2 MB + 1 byte fails, exactly 2 MB passes)", () => {
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 })).toBe("too-large");
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES })).toBeNull();
  });
});

describe("buildAvatarPath", () => {
  it("builds <user-id>/avatar-<timestamp>.<ext> from the file", () => {
    expect(buildAvatarPath(USER_ID, "photo.jpg", "image/jpeg", 1700000000000)).toBe(
      `${USER_ID}/avatar-1700000000000.jpg`,
    );
    expect(buildAvatarPath(USER_ID, "photo.PNG", "image/png", 1700000000000)).toBe(
      `${USER_ID}/avatar-1700000000000.png`,
    );
  });

  it("falls back to the MIME type when the name has no usable extension", () => {
    expect(buildAvatarPath(USER_ID, "photo", "image/webp", 1700000000000)).toBe(
      `${USER_ID}/avatar-1700000000000.webp`,
    );
  });

  it("returns null for a disallowed type or an empty user id", () => {
    expect(buildAvatarPath(USER_ID, "photo.svg", "image/svg+xml", 1700000000000)).toBeNull();
    expect(buildAvatarPath("", "photo.png", "image/png", 1700000000000)).toBeNull();
  });
});

describe("parseAvatarStoragePath", () => {
  it("extracts the storage path from a public avatars URL", () => {
    expect(parseAvatarStoragePath(PUBLIC_URL, SUPABASE_URL)).toBe(
      `${USER_ID}/avatar-1700000000000.png`,
    );
  });

  it("rejects URLs outside the avatars bucket, on another host, or malformed", () => {
    expect(
      parseAvatarStoragePath(
        `${SUPABASE_URL}/storage/v1/object/public/other/${USER_ID}/avatar-1.png`,
        SUPABASE_URL,
      ),
    ).toBeNull();
    expect(
      parseAvatarStoragePath(
        `https://evil.example.com/storage/v1/object/public/avatars/${USER_ID}/avatar-1.png`,
        SUPABASE_URL,
      ),
    ).toBeNull();
    expect(parseAvatarStoragePath("not-a-url", SUPABASE_URL)).toBeNull();
    expect(parseAvatarStoragePath(null, SUPABASE_URL)).toBeNull();
    expect(parseAvatarStoragePath(undefined, SUPABASE_URL)).toBeNull();
  });

  it("rejects path traversal in the object name", () => {
    expect(
      parseAvatarStoragePath(
        `${SUPABASE_URL}/storage/v1/object/public/avatars/${USER_ID}/..%2Favatar-1.png`,
        SUPABASE_URL,
      ),
    ).toBeNull();
  });
});

describe("isAllowedAvatarUrl", () => {
  it("allows a public URL in the caller's own avatars folder", () => {
    expect(isAllowedAvatarUrl(PUBLIC_URL, SUPABASE_URL, USER_ID)).toBe(true);
  });

  it("rejects another user's folder, another host, and non-storage URLs", () => {
    const otherUserUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${OTHER_ID}/avatar-1.png`;
    expect(isAllowedAvatarUrl(otherUserUrl, SUPABASE_URL, USER_ID)).toBe(false);
    expect(
      isAllowedAvatarUrl(
        `https://evil.example.com/storage/v1/object/public/avatars/${USER_ID}/avatar-1.png`,
        SUPABASE_URL,
        USER_ID,
      ),
    ).toBe(false);
    expect(isAllowedAvatarUrl("https://example.com/photo.png", SUPABASE_URL, USER_ID)).toBe(false);
  });
});

describe("avatarInitials", () => {
  it("uses first + last word initials, first two letters for one word", () => {
    expect(avatarInitials("Mosayeb Siam")).toBe("MS");
    expect(avatarInitials("Mamshad")).toBe("MA");
    expect(avatarInitials("  Nabil   Zaman  ")).toBe("NZ");
  });

  it("falls back to the email, then to ?", () => {
    expect(avatarInitials(null, "mosayeb@example.com")).toBe("MO");
    expect(avatarInitials("", "")).toBe("?");
    expect(avatarInitials(null, null)).toBe("?");
  });
});
