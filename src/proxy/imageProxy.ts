import { Router, Request, Response } from "express";
import { asyncWrapper } from "../utils/asyncWrapper";

export const proxyRouter = Router();

const ALLOWED_IMAGE_DOMAINS = [
  "meo.comick.pictures", "meo2.comick.pictures",
  "uploads.mangadex.org", "cdn.weebcentral.com",
  "gg.asuracomic.net", "asuracomic.net",
  "novelfull.com", "img.novelfull.com",
];

const REFERER_MAP: Record<string, string> = {
  "meo.comick.pictures":  "https://comick.io/",
  "meo2.comick.pictures": "https://comick.io/",
  "uploads.mangadex.org": "https://mangadex.org/",
  "cdn.weebcentral.com":  "https://weebcentral.com/",
  "gg.asuracomic.net":    "https://asuracomic.net/",
};

proxyRouter.get("/image", asyncWrapper(async (req: Request, res: Response) => {
  const rawUrl = String(req.query.url ?? "").trim();
  if (!rawUrl) return res.status(400).json({ error: "'url' query param required." });

  let parsed: URL;
  try { parsed = new URL(rawUrl); }
  catch { return res.status(400).json({ error: "Invalid URL." }); }

  if (parsed.protocol !== "https:") {
    return res.status(400).json({ error: "Only HTTPS image URLs are allowed." });
  }
  if (parsed.username || parsed.password || parsed.port) {
    return res.status(400).json({ error: "Image URL credentials and custom ports are not allowed." });
  }

  const domainAllowed = ALLOWED_IMAGE_DOMAINS.some(
    d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
  );
  if (!domainAllowed) {
    return res.status(403).json({ error: `Domain '${parsed.hostname}' not in allow-list.` });
  }

  const referer = REFERER_MAP[parsed.hostname] ?? `${parsed.protocol}//${parsed.hostname}/`;

  const response = await fetch(rawUrl, {
    headers: { Referer: referer, Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    return res.status(response.status === 403 || response.status === 401 ? 403 : 502)
      .json({ error: `Image host denied access or returned HTTP ${response.status}.` });
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > 15 * 1024 * 1024) {
    return res.status(413).json({ error: "Image exceeds the 15 MB limit." });
  }

  const finalUrl = new URL(response.url);
  const finalHostAllowed = ALLOWED_IMAGE_DOMAINS.some(
    (domain) => finalUrl.hostname === domain || finalUrl.hostname.endsWith(`.${domain}`)
  );
  if (!finalHostAllowed || finalUrl.protocol !== "https:") {
    return res.status(403).json({ error: "Image redirect target is not allowed." });
  }

  const contentType = String(response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) {
    return res.status(502).json({ error: "Upstream did not return an image." });
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.end(body);
}));
