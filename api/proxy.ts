const ALLOWED_HOSTS = new Set(["api.tikhub.io", "api.tikhub.dev"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

type ProxyPayload = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

function normalizeHeaders(input?: Record<string, string>): Record<string, string> {
  if (!input) return {};
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.toLowerCase();
    if (key === "host" || key === "origin" || key === "content-length") continue;
    output[rawKey] = rawValue;
  }
  return output;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: ProxyPayload;
  try {
    payload = (await request.json()) as ProxyPayload;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const urlText = payload.url?.trim();
  if (!urlText) {
    return new Response("Missing target URL", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlText);
  } catch {
    return new Response("Invalid target URL", { status: 400 });
  }

  if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return new Response("Target host is not allowed", { status: 403 });
  }

  const method = (payload.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return new Response("Method is not allowed", { status: 405 });
  }

  const headers = normalizeHeaders(payload.headers);
  const init: RequestInit = {
    method,
    headers
  };
  if (payload.body !== null && payload.body !== undefined && method !== "GET") {
    init.body = payload.body;
  }

  try {
    const upstream = await fetch(targetUrl.toString(), init);
    const body = await upstream.text();
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", "no-store");
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch {
    return new Response("Upstream request failed", { status: 502 });
  }
}
