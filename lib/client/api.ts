// Thin fetch helpers for the internal API routes. Client-only.

import type { ApiError } from "./types";

export class ApiRequestError extends Error {
  code: string;
  constructor(err: ApiError) {
    super(err.message);
    this.code = err.code;
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.error)) {
    const err: ApiError = body?.error ?? {
      code: "HttpError",
      message: `Request failed (${res.status}).`,
    };
    throw new ApiRequestError(err);
  }
  return body as T;
}

export function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(json<T>);
}

export function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal
): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  }).then(json<T>);
}

/** Build a querystring, skipping undefined/empty values. */
export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
