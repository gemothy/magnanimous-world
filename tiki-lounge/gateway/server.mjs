import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";
const SIGNING_SECRET = process.env.SIGNING_SECRET || GATEWAY_SECRET;
const MANIFEST_TTL_MS = Number(process.env.MANIFEST_TTL_MS || 300_000);
const SIGNED_URL_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS || 21_600);

let accessToken = { value: "", expiresAt: 0 };
let manifestCache = { value: null, expiresAt: 0 };

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

function bearerToken(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function isAuthorized(req) {
  if (!GATEWAY_SECRET) return false;
  const supplied = Buffer.from(bearerToken(req));
  const expected = Buffer.from(GATEWAY_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function signatureFor(id, expires) {
  return createHmac("sha256", SIGNING_SECRET)
    .update(`${id}.${expires}`)
    .digest("base64url");
}

function signatureIsValid(id, expires, supplied) {
  if (!SIGNING_SECRET || !supplied || !Number.isFinite(expires) || expires < Date.now() / 1000) {
    return false;
  }
  const expected = Buffer.from(signatureFor(id, expires));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  if (accessToken.value && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;

  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );

  if (!response.ok) {
    throw new Error(`Unable to obtain Google access token (${response.status})`);
  }

  const payload = await response.json();
  accessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3000) * 1000
  };
  return accessToken.value;
}

function displayTitle(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*\d+\s*[-_.]\s*/, "")
    .trim();
}

function trackOrder(filename) {
  const match = filename.match(/^\s*(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function loadManifest(force = false) {
  if (!force && manifestCache.value && manifestCache.expiresAt > Date.now()) {
    return manifestCache.value;
  }
  if (!DRIVE_FOLDER_ID) throw new Error("DRIVE_FOLDER_ID is required");

  const token = await getAccessToken();
  const query = `'${DRIVE_FOLDER_ID.replaceAll("'", "\\'")}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    orderBy: "name_natural",
    pageSize: "1000",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    fields: "files(id,name,mimeType,description,appProperties,modifiedTime,size)"
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Drive list failed (${response.status}): ${await response.text()}`);
  }

  const payload = await response.json();
  const tracks = (payload.files || [])
    .filter((file) => String(file.mimeType || "").startsWith("audio/"))
    .sort((a, b) => trackOrder(a.name) - trackOrder(b.name) || a.name.localeCompare(b.name))
    .map((file) => ({
      id: file.id,
      title: file.appProperties?.title || displayTitle(file.name),
      artist: file.appProperties?.artist || "Magnanimis Library",
      duration: Number(file.appProperties?.duration || 0),
      streamUrl: "",
      modifiedTime: file.modifiedTime,
      size: Number(file.size || 0)
    }));

  const version = tracks.map((track) => `${track.id}:${track.modifiedTime}`).join("|");
  manifestCache = {
    value: {
      title: process.env.LIBRARY_TITLE || "Lagoon Lounge",
      subtitle: process.env.LIBRARY_SUBTITLE || `${tracks.length} selections from the private library`,
      version,
      tracks
    },
    expiresAt: Date.now() + MANIFEST_TTL_MS
  };
  return manifestCache.value;
}

function publicBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type"
  };
}

async function streamTrack(req, res, id) {
  const url = new URL(req.url, publicBaseUrl(req));
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";

  if (!signatureIsValid(id, expires, signature)) {
    return json(res, 403, { error: "This stream link has expired" }, corsHeaders());
  }

  const manifest = await loadManifest();
  if (!manifest.tracks.some((track) => track.id === id)) {
    return json(res, 404, { error: "Track not found" }, corsHeaders());
  }

  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (req.headers.range) headers.Range = req.headers.range;

  const driveResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    { method: req.method, headers }
  );

  const responseHeaders = {
    ...corsHeaders(),
    "Accept-Ranges": driveResponse.headers.get("accept-ranges") || "bytes",
    "Cache-Control": "private, max-age=300",
    "Content-Type": driveResponse.headers.get("content-type") || "audio/mpeg"
  };
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = driveResponse.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  res.writeHead(driveResponse.status, responseHeaders);
  if (req.method === "HEAD" || !driveResponse.body) return res.end();

  const reader = driveResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
  } finally {
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      return res.end();
    }

    const url = new URL(req.url, publicBaseUrl(req));
    if (url.pathname === "/health") return json(res, 200, { ok: true });

    if (url.pathname === "/v1/manifest" && req.method === "GET") {
      if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
      return json(res, 200, await loadManifest());
    }

    const signMatch = url.pathname.match(/^\/v1\/sign\/([^/]+)$/);
    if (signMatch && req.method === "POST") {
      if (!isAuthorized(req)) return json(res, 401, { error: "Unauthorized" });
      const id = decodeURIComponent(signMatch[1]);
      const manifest = await loadManifest();
      if (!manifest.tracks.some((track) => track.id === id)) {
        return json(res, 404, { error: "Track not found" });
      }
      const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
      const signature = signatureFor(id, expires);
      const streamUrl =
        `${publicBaseUrl(req)}/v1/audio/${encodeURIComponent(id)}` +
        `?expires=${expires}&signature=${encodeURIComponent(signature)}`;
      return json(res, 200, { url: streamUrl, expires });
    }

    const audioMatch = url.pathname.match(/^\/v1\/audio\/([^/]+)$/);
    if (audioMatch && (req.method === "GET" || req.method === "HEAD")) {
      return await streamTrack(req, res, decodeURIComponent(audioMatch[1]));
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Gateway error" }, corsHeaders());
  }
});

server.listen(PORT, () => {
  console.log(`Drive gateway listening on ${PORT}`);
});
