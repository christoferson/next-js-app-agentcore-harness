// Extract citation sources (URL + optional title) from a tool-result payload.
// Web-search tools return sources in varied shapes; this is defensive and
// best-effort — it never throws and degrades to "no sources" on anything odd.
// Shared by the live chat panel and the memory-events history so citations
// render identically in both. Pure/client-safe: no imports.

export interface Source {
  url: string;
  title?: string;
}

const URL_RE = /https?:\/\/[^\s"'`)<>\]]+/gi;

/** Strip trailing punctuation a URL regex commonly over-captures. */
function cleanUrl(u: string): string {
  return u.replace(/[.,;:!?)]+$/, "");
}

/**
 * Walk a parsed JSON value collecting {url,title}-shaped objects. Handles the
 * common search-result shapes: arrays of {url,title}/{link,name}/{source} etc.
 */
function collectStructured(value: unknown, out: Source[], seen: Set<string>) {
  if (out.length >= 50) return;
  if (Array.isArray(value)) {
    for (const v of value) collectStructured(v, out, seen);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  const url =
    pick(o, "url") ?? pick(o, "link") ?? pick(o, "source") ?? pick(o, "href");
  if (url) {
    const clean = cleanUrl(url);
    if (/^https?:\/\//i.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      const title =
        pick(o, "title") ?? pick(o, "name") ?? pick(o, "heading") ?? undefined;
      out.push({ url: clean, title: title?.trim() || undefined });
    }
  }
  // Recurse into nested objects/arrays (e.g. { results: [...] }).
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") collectStructured(v, out, seen);
  }
}

function pick(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Extract sources from raw tool-result content. Tries structured JSON first
 * (richer: carries titles); falls back to scraping bare URLs from text.
 */
export function extractSources(content: string | undefined): Source[] {
  if (!content || !content.trim()) return [];
  const out: Source[] = [];
  const seen = new Set<string>();

  // 1) Structured: the content may be JSON (possibly the whole thing, or a
  //    JSON string). Try to parse and walk it for {url,title} objects.
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      collectStructured(JSON.parse(trimmed), out, seen);
    } catch {
      /* not JSON — fall through to text scrape */
    }
  }

  // 2) Text fallback: scrape any bare URLs not already found.
  const matches = content.match(URL_RE);
  if (matches) {
    for (const m of matches) {
      const clean = cleanUrl(m);
      if (!seen.has(clean)) {
        seen.add(clean);
        out.push({ url: clean });
      }
      if (out.length >= 50) break;
    }
  }

  return out;
}

/** A short, human-readable label for a source when it has no title. */
export function sourceLabel(s: Source): string {
  if (s.title) return s.title;
  try {
    const u = new URL(s.url);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return s.url;
  }
}
