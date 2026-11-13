/**
 * Shared HTTP client for provider adapters.
 *
 * Uses ordinary HTTPS requests and respects upstream access controls.
 * A 401/403/429 response is surfaced as an unavailable-provider error;
 * this client does not solve challenges, rotate proxies, or impersonate browsers.
 */

async function requestText(url: string, headers: Record<string, string>): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid upstream URL."); }
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS upstream requests are allowed.");

  const response = await fetch(parsed, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new Error(`Upstream denied access (HTTP ${status}). Use an authorized API or source link.`);
    }
    if (status === 429) throw new Error("Upstream rate limit reached. Try again later.");
    throw new Error(`Upstream request failed (HTTP ${status}).`);
  }
  return response.text();
}

export async function fetchHTML(
  url: string,
  referer = "https://www.google.com/",
  _legacyCloudflareFlag = false,
): Promise<string> {
  return requestText(url, {
    Referer: referer,
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });
}

export async function fetchJSON<T = unknown>(
  url: string,
  referer = "https://comick.io/",
  _legacyCloudflareFlag = false,
): Promise<T> {
  const body = await requestText(url, {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: new URL(referer).origin,
    Referer: referer,
  });
  try { return JSON.parse(body) as T; }
  catch { throw new Error("Provider returned invalid JSON."); }
}

export async function fetchMangaDexJSON<T = unknown>(
  url: string,
  referer = "https://mangadex.org/",
): Promise<T> {
  const body = await requestText(url, {
    Accept: "application/json",
    Referer: referer,
    "User-Agent": "ComicVerse/1.0",
  });
  try { return JSON.parse(body) as T; }
  catch { throw new Error("MangaDex returned invalid JSON."); }
}
