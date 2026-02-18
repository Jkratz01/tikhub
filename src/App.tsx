import { useEffect, useMemo, useState } from "react";
import { getDocMeta, loadSpec, parseOperations } from "./lib/openapi";
import { buildSnippet, buildUrl, type SnippetLanguage } from "./lib/snippets";
import type { ParsedOperation } from "./types";

type RunResult = {
  status: number;
  elapsedMs: number;
  body: string;
  headers: Record<string, string>;
} | null;

const DEFAULT_HIDDEN_TAGS = new Set<string>([
  "Bilibili-App-API",
  "Bilibili-Web-API",
  "Demo-API",
  "Douyin-App-V3-API",
  "Douyin-Billboard-API",
  "Douyin-Creator-API",
  "Douyin-Creator-V2-API",
  "Douyin-Search-API",
  "Douyin-Web-API",
  "Douyin-Xingtu-API",
  "Douyin-Xingtu-V2-API",
  "Health-Check",
  "Hybrid-Parsing",
  "Kuaishou-App-API",
  "Kuaishou-Web-API",
  "Lemon8-App-API",
  "Temp-Mail-API",
  "Threads-Web-API",
  "Toutiao-App-API",
  "Toutiao-Web-API",
  "Weibo-App-API",
  "Weibo-Web-API",
  "Weibo-Web-V2-API",
  "Xiaohongshu-App-API",
  "Xiaohongshu-Web-API",
  "Xiaohongshu-Web-V2-API",
  "Xigua-App-V2-API",
  "Zhihu-Web-API"
]);

function methodClass(method: string): string {
  return `method method-${method.toLowerCase()}`;
}

function initialParamValues(
  operation: ParsedOperation,
  location: "query" | "path" | "header" | "cookie"
): Record<string, string> {
  return operation.parameters
    .filter((param) => param.location === location)
    .reduce<Record<string, string>>((acc, param) => {
      acc[param.name] = param.defaultValue;
      return acc;
    }, {});
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export default function App() {
  const [docMeta, setDocMeta] = useState({
    title: "TikHub API Docs",
    version: "loading",
    description: "",
    baseUrls: ["https://api.tikhub.io", "https://api.tikhub.dev"]
  });
  const [allOperations, setAllOperations] = useState<ParsedOperation[]>([]);
  const [specLoading, setSpecLoading] = useState(true);
  const [specError, setSpecError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [showAppFilters, setShowAppFilters] = useState(true);
  const [showTagFilters, setShowTagFilters] = useState(true);
  const [showHiddenTags, setShowHiddenTags] = useState(false);
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [language, setLanguage] = useState<SnippetLanguage>("python");
  const [globalApiKey, setGlobalApiKey] = useState("");
  const [perEndpointApiKey, setPerEndpointApiKey] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState("https://api.tikhub.io");
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, string>>({});
  const [cookieValues, setCookieValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState("");
  const [runResult, setRunResult] = useState<RunResult>(null);

  useEffect(() => {
    let active = true;
    async function initializeSpec() {
      setSpecLoading(true);
      setSpecError("");
      try {
        const loadedSpec = await loadSpec();
        if (!active) return;
        const parsedMeta = getDocMeta(loadedSpec);
        const parsedOps = parseOperations(loadedSpec);
        setDocMeta(parsedMeta);
        setAllOperations(parsedOps);
        setSelectedOperationId(parsedOps[0]?.id ?? "");
        setBaseUrl(parsedMeta.baseUrls[0] ?? "https://api.tikhub.io");
      } catch {
        if (!active) return;
        setSpecError("Could not load openapi.json. Ensure the file is present and valid JSON.");
      } finally {
        if (active) setSpecLoading(false);
      }
    }
    void initializeSpec();
    return () => {
      active = false;
    };
  }, []);

  const apps = useMemo(() => {
    const counts = allOperations.reduce<Record<string, number>>((acc, op) => {
      acc[op.app] = (acc[op.app] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([app, count]) => ({ app, count }));
  }, [allOperations]);

  const appFilteredOperations = useMemo(() => {
    return allOperations.filter((op) => selectedApp === "All" || op.app === selectedApp);
  }, [selectedApp, allOperations]);

  const visibleAppOperations = useMemo(() => {
    return showHiddenTags
      ? appFilteredOperations
      : appFilteredOperations.filter((op) => !DEFAULT_HIDDEN_TAGS.has(op.tag));
  }, [appFilteredOperations, showHiddenTags]);

  const tags = useMemo(() => {
    const counts = visibleAppOperations.reduce<Record<string, number>>((acc, op) => {
      acc[op.tag] = (acc[op.tag] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }, [visibleAppOperations]);

  useEffect(() => {
    if (selectedTag === "All") return;
    const stillExists = tags.some((item) => item.tag === selectedTag);
    if (!stillExists) {
      setSelectedTag("All");
    }
  }, [selectedTag, tags]);

  const filteredOperations = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return visibleAppOperations.filter((op) => {
      const inTag = selectedTag === "All" || op.tag === selectedTag;
      if (!inTag) return false;
      if (!searchLower) return true;
      return (
        op.path.toLowerCase().includes(searchLower) ||
        op.summary.toLowerCase().includes(searchLower) ||
        op.id.toLowerCase().includes(searchLower) ||
        op.tag.toLowerCase().includes(searchLower) ||
        op.app.toLowerCase().includes(searchLower)
      );
    });
  }, [search, selectedTag, visibleAppOperations]);

  const selectedOperation = useMemo(
    () =>
      filteredOperations.find((op) => op.id === selectedOperationId) ??
      filteredOperations[0] ??
      allOperations[0],
    [selectedOperationId, filteredOperations, allOperations]
  );

  useEffect(() => {
    if (!selectedOperation) return;
    setQueryValues(initialParamValues(selectedOperation, "query"));
    setPathValues(initialParamValues(selectedOperation, "path"));
    setHeaderValues(initialParamValues(selectedOperation, "header"));
    setCookieValues(initialParamValues(selectedOperation, "cookie"));
    setBodyText(selectedOperation.requestBodyTemplate ?? "");
    setRunResult(null);
    setRunError("");
  }, [selectedOperation]);

  const endpointApiKey = selectedOperation ? perEndpointApiKey[selectedOperation.id] ?? "" : "";

  const codeSnippet = useMemo(() => {
    if (!selectedOperation) return "";
    const ctx = {
      baseUrl,
      globalApiKey,
      endpointApiKey,
      queryValues,
      pathValues,
      headerValues,
      cookieValues,
      bodyText
    };
    return buildSnippet(language, selectedOperation, ctx);
  }, [
    selectedOperation,
    baseUrl,
    globalApiKey,
    endpointApiKey,
    queryValues,
    pathValues,
    headerValues,
    cookieValues,
    bodyText,
    language
  ]);
  const requestUrl = useMemo(() => {
    if (!selectedOperation) return "";
    return buildUrl(selectedOperation, baseUrl, pathValues, queryValues);
  }, [selectedOperation, baseUrl, pathValues, queryValues]);

  async function runRequest() {
    if (!selectedOperation) return;
    setRunError("");
    setRunLoading(true);
    setRunResult(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    const start = performance.now();

    try {
      const url = buildUrl(selectedOperation, baseUrl, pathValues, queryValues);
      const headers: Record<string, string> = {};
      const activeApiKey = (endpointApiKey || globalApiKey).trim();
      if (selectedOperation.requiresAuth && activeApiKey) {
        headers.Authorization = `Bearer ${activeApiKey}`;
      }
      if (selectedOperation.requestBodyType) {
        headers["Content-Type"] = selectedOperation.requestBodyType;
      }
      for (const param of selectedOperation.parameters) {
        if (param.location !== "header") continue;
        const value = headerValues[param.name]?.trim();
        if (value) headers[param.name] = value;
      }
      const cookieHeader = selectedOperation.parameters
        .filter((param) => param.location === "cookie")
        .map((param) => {
          const value = cookieValues[param.name]?.trim();
          if (!value) return "";
          return `${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`;
        })
        .filter(Boolean)
        .join("; ");
      if (cookieHeader) headers.Cookie = cookieHeader;

      const body =
        selectedOperation.requestBodyType && bodyText.trim()
          ? selectedOperation.requestBodyType.includes("json")
            ? bodyText
            : bodyText
          : undefined;

      const response = await fetch(url, {
        method: selectedOperation.method.toUpperCase(),
        headers,
        body,
        signal: controller.signal
      });

      const elapsedMs = Math.round(performance.now() - start);
      const responseText = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      setRunResult({
        status: response.status,
        elapsedMs,
        body: responseText,
        headers: responseHeaders
      });
    } catch {
      setRunError(
        "Request failed. Check your API key, endpoint parameters, CORS policy, and network connectivity."
      );
    } finally {
      window.clearTimeout(timeout);
      setRunLoading(false);
    }
  }

  if (specLoading) {
    return <main className="empty-state">Loading OpenAPI spec and building endpoint index...</main>;
  }

  if (specError) {
    return <main className="empty-state">{specError}</main>;
  }

  if (!selectedOperation) {
    return <main className="empty-state">No operations were found in the OpenAPI spec.</main>;
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Tikhub Easy Documentation</h1>
          <p className="muted">
            Version {docMeta.version} • {allOperations.length} endpoints • interactive docs and tester
          </p>
        </div>
        <div className="top-controls">
          <label>
            Base URL
            <select value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)}>
              {docMeta.baseUrls.map((url) => (
                <option value={url} key={url}>
                  {url}
                </option>
              ))}
            </select>
          </label>
          <label>
            Global API Key (memory only)
            <input
              type="password"
              value={globalApiKey}
              onChange={(event) => setGlobalApiKey(event.target.value)}
              placeholder="Bearer token for all endpoints"
            />
          </label>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by path, summary, tag, operationId"
          />
          <div className="filter-row">
            <div className="muted tiny">App Filter</div>
            <button className="toggle-btn" onClick={() => setShowAppFilters((prev) => !prev)}>
              {showAppFilters ? "Hide" : "Show"}
            </button>
          </div>
          {showAppFilters && (
            <div className="tags">
              <button
                className={selectedApp === "All" ? "tag-btn active" : "tag-btn"}
                onClick={() => setSelectedApp("All")}
              >
                All Apps ({allOperations.length})
              </button>
              {apps.map((item) => (
                <button
                  key={item.app}
                  className={selectedApp === item.app ? "tag-btn active" : "tag-btn"}
                  onClick={() => setSelectedApp(item.app)}
                >
                  {item.app} ({item.count})
                </button>
              ))}
            </div>
          )}

          <div className="filter-row">
            <div className="muted tiny">Tag Filter</div>
            <div className="filter-actions">
              <button className="toggle-btn" onClick={() => setShowHiddenTags((prev) => !prev)}>
                {showHiddenTags ? "Hide Hidden Tags" : "Show Hidden Tags"}
              </button>
              <button className="toggle-btn" onClick={() => setShowTagFilters((prev) => !prev)}>
                {showTagFilters ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {showTagFilters && (
            <div className="tags">
              <button
                className={selectedTag === "All" ? "tag-btn active" : "tag-btn"}
                onClick={() => setSelectedTag("All")}
              >
                All Tags ({visibleAppOperations.length})
              </button>
              {tags.map((item) => (
                <button
                  key={item.tag}
                  className={selectedTag === item.tag ? "tag-btn active" : "tag-btn"}
                  onClick={() => setSelectedTag(item.tag)}
                >
                  {item.tag} ({item.count})
                </button>
              ))}
            </div>
          )}
          <div className="endpoint-list">
            {filteredOperations.map((op) => (
              <button
                key={op.id}
                className={op.id === selectedOperation.id ? "endpoint-item selected" : "endpoint-item"}
                onClick={() => setSelectedOperationId(op.id)}
              >
                <span className={methodClass(op.method)}>{op.method.toUpperCase()}</span>
                <span className="path">{op.path}</span>
                <span className="summary">{op.summary}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="main">
          <div className="card">
            <div className="endpoint-heading">
              <span className={methodClass(selectedOperation.method)}>
                {selectedOperation.method.toUpperCase()}
              </span>
              <h2>{selectedOperation.path}</h2>
            </div>
            <p className="summary">{selectedOperation.summary}</p>
            <p className="muted small">{selectedOperation.id}</p>
            <p className="muted small">
              App: {selectedOperation.app} • Tag: {selectedOperation.tag}
            </p>
            <p className="muted small">
              Auth: {selectedOperation.requiresAuth ? "Bearer token required" : "No token required"}
            </p>
            <ul className="howto">
              <li>Set API key globally at the top, or override for this endpoint only below.</li>
              <li>Fill query/path parameters and optional JSON body, then click Run Request.</li>
              <li>Use the language tabs to copy exact request snippets.</li>
            </ul>
          </div>

          <div className="card">
            <h3>Request Setup</h3>
            <label>
              Endpoint API Key Override (optional)
              <input
                type="password"
                value={endpointApiKey}
                onChange={(event) =>
                  setPerEndpointApiKey((prev) => ({
                    ...prev,
                    [selectedOperation.id]: event.target.value
                  }))
                }
                placeholder="Overrides global key for this endpoint only"
              />
            </label>

            {!!selectedOperation.parameters.length && (
              <div className="params-section">
                {(["path", "query", "header", "cookie"] as const).map((location) => {
                  const params = selectedOperation.parameters.filter((param) => param.location === location);
                  if (!params.length) return null;
                  return (
                    <div key={location}>
                      <div className="muted tiny param-title">{location.toUpperCase()} PARAMETERS</div>
                      <div className="param-grid">
                        {params.map((param) => {
                          let value = "";
                          if (location === "path") value = pathValues[param.name] ?? "";
                          if (location === "query") value = queryValues[param.name] ?? "";
                          if (location === "header") value = headerValues[param.name] ?? "";
                          if (location === "cookie") value = cookieValues[param.name] ?? "";
                          return (
                            <label key={`${param.location}-${param.name}`}>
                              {param.name}
                              <input
                                value={value}
                                onChange={(event) => {
                                  const newValue = event.target.value;
                                  if (location === "path") {
                                    setPathValues((prev) => ({ ...prev, [param.name]: newValue }));
                                  }
                                  if (location === "query") {
                                    setQueryValues((prev) => ({ ...prev, [param.name]: newValue }));
                                  }
                                  if (location === "header") {
                                    setHeaderValues((prev) => ({ ...prev, [param.name]: newValue }));
                                  }
                                  if (location === "cookie") {
                                    setCookieValues((prev) => ({ ...prev, [param.name]: newValue }));
                                  }
                                }}
                                placeholder={param.required ? "required" : "optional"}
                              />
                              <span className="muted tiny">
                                {param.type}
                                {param.required ? " • required" : ""}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedOperation.requestBodyType && (
              <label>
                Request Body ({selectedOperation.requestBodyType})
                <textarea
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                  rows={12}
                  spellCheck={false}
                />
              </label>
            )}

          </div>

          <div className="card playground-card">
            <div className="playground-header">
              <h3>Language</h3>
              <div className="segment">
                <button className={language === "shell" ? "active" : ""} onClick={() => setLanguage("shell")}>
                  Shell
                </button>
                <button className={language === "node" ? "active" : ""} onClick={() => setLanguage("node")}>
                  Node
                </button>
                <button className={language === "ruby" ? "active" : ""} onClick={() => setLanguage("ruby")}>
                  Ruby
                </button>
                <button className={language === "php" ? "active" : ""} onClick={() => setLanguage("php")}>
                  PHP
                </button>
                <button className={language === "python" ? "active" : ""} onClick={() => setLanguage("python")}>
                  Python
                </button>
              </div>
            </div>

            <div className="url-section">
              <div className="muted tiny">URL</div>
              <div className="url-box">{requestUrl}</div>
            </div>

            <div className="snippet-actions">
              <button className="copy-btn" onClick={() => navigator.clipboard.writeText(codeSnippet)}>
                Copy code
              </button>
              <button className="run-btn" onClick={runRequest} disabled={runLoading}>
                {runLoading ? "Running..." : "Try It!"}
              </button>
            </div>
            <pre className="code-block">{codeSnippet}</pre>

            <div className="response-wrapper">
              <h4>Response</h4>
              {!runResult && !runError && (
                <div className="response-empty">
                  Click <code>Try It!</code> to start a request and see the response here.
                </div>
              )}
              {runError && <div className="error-box">{runError}</div>}
              {runResult && (
                <div className="response-box">
                  <p>
                    Status <strong>{runResult.status}</strong> • {runResult.elapsedMs} ms
                  </p>
                  <div className="status-list">
                    {selectedOperation.responseCodes.slice(0, 4).map((code) => (
                      <span key={code} className={runResult.status.toString() === code ? "status-pill active" : "status-pill"}>
                        {code}
                      </span>
                    ))}
                  </div>
                  <details>
                    <summary>Response headers</summary>
                    <pre>{prettyJson(runResult.headers)}</pre>
                  </details>
                  <pre>{runResult.body || "(empty response body)"}</pre>
                </div>
              )}
            </div>
          </div>

          <div className="card examples">
            <h3>Examples</h3>
            <p className="muted tiny">
              Success code candidates: {selectedOperation.responseCodes.join(", ")}
            </p>
            <div className="example-grid">
              <div>
                <h4>Sample Success Response</h4>
                <pre>{prettyJson(selectedOperation.successExample)}</pre>
              </div>
              <div>
                <h4>Common Error Response</h4>
                <pre>{prettyJson(selectedOperation.errorExample)}</pre>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
