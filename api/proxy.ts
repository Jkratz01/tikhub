const ALLOWED_HOSTS = new Set(["api.tikhub.io", "api.tikhub.dev"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

type ProxyPayload = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

type ProxyRequest = {
  method?: string;
  body?: unknown;
};

type ProxyResponse = {
  status: (code: number) => ProxyResponse;
  send: (body: string) => void;
  setHeader: (name: string, value: string) => void;
};

function normalizeHeaders(input?: Record<string, string>): Record<string, string> {
  if (!input) return {};
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== "string") continue;
    const key = rawKey.toLowerCase();
    if (key === "host" || key === "origin" || key === "content-length") continue;
    output[rawKey] = rawValue;
  }
  return output;
}

export default async function handler(req: ProxyRequest, res: ProxyResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let payload: ProxyPayload;
  try {
    if (typeof req.body === "string") {
      payload = JSON.parse(req.body) as ProxyPayload;
    } else {
      payload = (req.body ?? {}) as ProxyPayload;
    }
  } catch {
    res.status(400).send("Invalid JSON payload");
    return;
  }

  const urlText = payload.url?.trim();
  if (!urlText) {
    res.status(400).send("Missing target URL");
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(urlText);
  } catch {
    res.status(400).send("Invalid target URL");
    return;
  }

  if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
    res.status(403).send("Target host is not allowed");
    return;
  }

  const method = (payload.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.status(405).send("Method is not allowed");
    return;
  }

  const headers = normalizeHeaders(payload.headers);
  const init: RequestInit = {
    method,
    headers
  };
  if (payload.body !== null && payload.body !== undefined && method !== "GET") {
    init.body = payload.body;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const upstream = await fetch(targetUrl.toString(), {
      ...init,
      signal: controller.signal
    });
    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      res.setHeader("content-type", contentType);
    }
    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(body);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      res.status(504).send("Upstream request timed out");
      return;
    }
    res.status(502).send("Upstream request failed");
  } finally {
    clearTimeout(timeout);
  }
}
