"use client";

import { useCallback, useEffect, useState } from "react";
import { postJson } from "./api";

// Stable runtimeSessionId (UUID) per browser session (SPEC §2). "New Session"
// ends the current session best-effort and rotates the ID. Persisted to
// sessionStorage so a reload keeps the same conversation.

const KEY = "agentcore.sessionId";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Math.abs(hashSeed()).toString(36)}`;
}

// Fallback only (crypto.randomUUID is available in all target browsers).
function hashSeed(): number {
  let h = 0;
  const s = String(performance.now());
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export function useSession() {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const existing = sessionStorage.getItem(KEY);
    if (existing) {
      setSessionId(existing);
    } else {
      const id = newSessionId();
      sessionStorage.setItem(KEY, id);
      setSessionId(id);
    }
  }, []);

  /** End current session (best-effort) and rotate to a fresh ID. */
  const rotate = useCallback(async (): Promise<string> => {
    const old = sessionStorage.getItem(KEY);
    if (old) {
      // Best-effort: never throws (route returns 200 even on expired).
      await postJson("/api/sessions/end", { sessionId: old }).catch(() => {});
    }
    const id = newSessionId();
    sessionStorage.setItem(KEY, id);
    setSessionId(id);
    return id;
  }, []);

  /** Adopt an existing session ID (Resume flow). */
  const adopt = useCallback((id: string) => {
    sessionStorage.setItem(KEY, id);
    setSessionId(id);
  }, []);

  return { sessionId, rotate, adopt };
}
