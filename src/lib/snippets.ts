import type { ParsedOperation } from "../types";

export type SnippetContext = {
  baseUrl: string;
  globalApiKey: string;
  endpointApiKey?: string;
  queryValues: Record<string, string>;
  pathValues: Record<string, string>;
  headerValues: Record<string, string>;
  cookieValues: Record<string, string>;
  bodyText: string;
};

export type SnippetLanguage = "shell" | "node" | "ruby" | "php" | "python";

function authKey(globalApiKey: string, endpointApiKey?: string): string {
  return endpointApiKey?.trim() || globalApiKey.trim();
}

function buildCookieHeader(operation: ParsedOperation, cookieValues: Record<string, string>): string {
  const cookiePairs = operation.parameters
    .filter((param) => param.location === "cookie")
    .map((param) => {
      const value = cookieValues[param.name]?.trim();
      if (!value) return "";
      return `${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`;
    })
    .filter(Boolean);
  return cookiePairs.join("; ");
}

function buildHeaders(
  operation: ParsedOperation,
  key: string,
  headerValues: Record<string, string>,
  cookieValues: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (operation.requiresAuth) {
    headers.Authorization = `Bearer ${key || "YOUR_API_KEY"}`;
  }
  if (operation.requestBodyType) {
    headers["Content-Type"] = operation.requestBodyType;
  }

  for (const param of operation.parameters) {
    if (param.location !== "header") continue;
    const value = headerValues[param.name]?.trim();
    if (value) {
      headers[param.name] = value;
    }
  }

  const cookieHeader = buildCookieHeader(operation, cookieValues);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return headers;
}

function hasJsonBody(operation: ParsedOperation, bodyText: string): boolean {
  return Boolean(operation.requestBodyType?.includes("json") && bodyText.trim().length > 0);
}

export function buildUrl(
  operation: ParsedOperation,
  baseUrl: string,
  pathValues: Record<string, string>,
  queryValues: Record<string, string>
): string {
  const withPathParams = operation.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = pathValues[key] ?? `{${key}}`;
    return encodeURIComponent(value);
  });

  const query = new URLSearchParams();
  operation.parameters
    .filter((p) => p.location === "query")
    .forEach((p) => {
      const val = queryValues[p.name];
      if (val !== undefined && val !== "") query.set(p.name, val);
    });

  const queryString = query.toString();
  return `${baseUrl.replace(/\/$/, "")}${withPathParams}${queryString ? `?${queryString}` : ""}`;
}

export function toPythonSnippet(operation: ParsedOperation, ctx: SnippetContext): string {
  const url = buildUrl(operation, ctx.baseUrl, ctx.pathValues, ctx.queryValues);
  const key = authKey(ctx.globalApiKey, ctx.endpointApiKey);
  const headers = buildHeaders(operation, key, ctx.headerValues, ctx.cookieValues);

  const headerLines = Object.entries(headers).map(([k, v]) => `    "${k}": "${v}",`);
  const useJsonBody = hasJsonBody(operation, ctx.bodyText);
  const bodyLine = useJsonBody
    ? `payload = ${ctx.bodyText}`
    : operation.requestBodyType
      ? `payload = """${ctx.bodyText || ""}"""`
      : "";

  const requestBodyPart =
    useJsonBody || operation.requestBodyType
      ? `,\n    ${useJsonBody ? "json" : "data"}=payload`
      : "";

  return [
    "import requests",
    "",
    `url = "${url}"`,
    "headers = {",
    ...(headerLines.length ? headerLines : ['    # "Authorization": "Bearer YOUR_API_KEY",']),
    "}",
    bodyLine,
    "",
    "response = requests.request(",
    `    "${operation.method.toUpperCase()}",`,
    "    url,",
    "    headers=headers" + requestBodyPart,
    ")",
    "",
    "print(response.status_code)",
    "print(response.text)"
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function toNodeSnippet(operation: ParsedOperation, ctx: SnippetContext): string {
  const url = buildUrl(operation, ctx.baseUrl, ctx.pathValues, ctx.queryValues);
  const key = authKey(ctx.globalApiKey, ctx.endpointApiKey);
  const headers = buildHeaders(operation, key, ctx.headerValues, ctx.cookieValues);

  const hasBody = operation.requestBodyType && ctx.bodyText.trim().length > 0;
  const bodyLine = hasBody ? `  body: JSON.stringify(${ctx.bodyText}),` : "";

  return [
    `const url = "${url}";`,
    "",
    "const response = await fetch(url, {",
    `  method: "${operation.method.toUpperCase()}",`,
    "  headers: {",
    ...(Object.keys(headers).length
      ? Object.entries(headers).map(([k, v]) => `    "${k}": "${v}",`)
      : ['    // "Authorization": "Bearer YOUR_API_KEY",']),
    "  },",
    bodyLine,
    "});",
    "",
    "const data = await response.text();",
    "// handle data"
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function toShellSnippet(operation: ParsedOperation, ctx: SnippetContext): string {
  const url = buildUrl(operation, ctx.baseUrl, ctx.pathValues, ctx.queryValues);
  const key = authKey(ctx.globalApiKey, ctx.endpointApiKey);
  const headers = buildHeaders(operation, key, ctx.headerValues, ctx.cookieValues);

  const headerParts = Object.entries(headers).map(
    ([k, v]) => `  --header '${k}: ${v}' \\`
  );
  const bodyLine =
    operation.requestBodyType && ctx.bodyText.trim().length > 0
      ? `  --data '${ctx.bodyText.replace(/'/g, "'\\''")}' \\`
      : "";

  return [
    `curl --request ${operation.method.toUpperCase()} \\`,
    `  --url '${url}' \\`,
    ...headerParts,
    bodyLine
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\\\n$/, "");
}

export function toRubySnippet(operation: ParsedOperation, ctx: SnippetContext): string {
  const url = buildUrl(operation, ctx.baseUrl, ctx.pathValues, ctx.queryValues);
  const key = authKey(ctx.globalApiKey, ctx.endpointApiKey);
  const headers = buildHeaders(operation, key, ctx.headerValues, ctx.cookieValues);
  const headerLines = Object.entries(headers).map(([k, v]) => `  "${k}" => "${v}",`);
  const bodyLine =
    operation.requestBodyType && ctx.bodyText.trim().length > 0
      ? `request.body = ${JSON.stringify(ctx.bodyText)}`
      : "";

  return [
    "require 'uri'",
    "require 'net/http'",
    "",
    `url = URI("${url}")`,
    "http = Net::HTTP.new(url.host, url.port)",
    "http.use_ssl = true",
    "",
    `request = Net::HTTP::${operation.method.toUpperCase()[0]}${operation.method
      .slice(1)
      .toLowerCase()}.new(url)`,
    "request.initialize_http_header({",
    ...headerLines,
    "})",
    bodyLine,
    "",
    "response = http.request(request)",
    "puts response.code",
    "puts response.body"
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function toPhpSnippet(operation: ParsedOperation, ctx: SnippetContext): string {
  const url = buildUrl(operation, ctx.baseUrl, ctx.pathValues, ctx.queryValues);
  const key = authKey(ctx.globalApiKey, ctx.endpointApiKey);
  const headers = buildHeaders(operation, key, ctx.headerValues, ctx.cookieValues);
  const headerLines = Object.entries(headers).map(([k, v]) => `  "${k}: ${v}",`);
  const bodyPart =
    operation.requestBodyType && ctx.bodyText.trim().length > 0
      ? `CURLOPT_POSTFIELDS => ${JSON.stringify(ctx.bodyText)},`
      : "";

  return [
    "<?php",
    "$curl = curl_init();",
    "",
    "curl_setopt_array($curl, [",
    `  CURLOPT_URL => "${url}",`,
    "  CURLOPT_RETURNTRANSFER => true,",
    `  CURLOPT_CUSTOMREQUEST => "${operation.method.toUpperCase()}",`,
    "  CURLOPT_HTTPHEADER => [",
    ...headerLines,
    "  ],",
    bodyPart,
    "]);",
    "",
    "$response = curl_exec($curl);",
    "$statusCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);",
    "curl_close($curl);",
    "",
    "echo $statusCode . PHP_EOL;",
    "echo $response;"
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildSnippet(
  language: SnippetLanguage,
  operation: ParsedOperation,
  ctx: SnippetContext
): string {
  if (language === "shell") return toShellSnippet(operation, ctx);
  if (language === "node") return toNodeSnippet(operation, ctx);
  if (language === "ruby") return toRubySnippet(operation, ctx);
  if (language === "php") return toPhpSnippet(operation, ctx);
  return toPythonSnippet(operation, ctx);
}
