"use client";

// Auth seam (SPEC §9): a single hook returning the seeded actor identity.
// Future auth (Cognito/OIDC) replaces the hook body; memory scoping and
// sessions already key on it. The default is baked at build time from
// NEXT_PUBLIC_DEFAULT_ACTOR_ID (falls back to 'default-user').

export function useActor(): { actorId: string } {
  const actorId =
    process.env.NEXT_PUBLIC_DEFAULT_ACTOR_ID?.trim() || "default-user";
  return { actorId };
}
