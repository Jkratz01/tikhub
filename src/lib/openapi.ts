import openapiUrl from "../../openapi.json?url";
import type {
  HttpMethod,
  OpenApiSpec,
  ParsedOperation,
  ParameterObject,
  SchemaObject
} from "../types";

const SUPPORTED_METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace"
];

const HTTP_METHODS_WITHOUT_BODY = new Set<HttpMethod>(["get", "head", "trace"]);

const APP_KEYWORDS: Array<{ app: string; keys: string[] }> = [
  { app: "TikTok", keys: ["tiktok"] },
  { app: "Douyin", keys: ["douyin"] },
  { app: "Instagram", keys: ["instagram"] },
  { app: "Xiaohongshu", keys: ["xiaohongshu"] },
  { app: "Lemon8", keys: ["lemon8"] },
  { app: "YouTube", keys: ["youtube"] },
  { app: "Twitter", keys: ["twitter"] },
  { app: "Threads", keys: ["threads"] },
  { app: "Reddit", keys: ["reddit"] },
  { app: "Bilibili", keys: ["bilibili"] },
  { app: "Kuaishou", keys: ["kuaishou"] },
  { app: "Weibo", keys: ["weibo"] },
  { app: "WeChat", keys: ["wechat"] },
  { app: "Zhihu", keys: ["zhihu"] },
  { app: "Sora2", keys: ["sora2"] },
  { app: "Toutiao", keys: ["toutiao"] },
  { app: "Xigua", keys: ["xigua"] },
  { app: "Pipixia", keys: ["pipixia"] },
  { app: "LinkedIn", keys: ["linkedin"] },
  { app: "TikHub Core", keys: ["tikhub", "health", "demo", "temp_mail", "temp-mail"] }
];

function englishOnlyText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const hasCjk = (text: string): boolean => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);

  const slashParts = trimmed
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length > 1) {
    const englishPart =
      slashParts.find((part) => /[A-Za-z]/.test(part) && !hasCjk(part)) ??
      slashParts.find((part) => !hasCjk(part)) ??
      slashParts.find((part) => /[A-Za-z]/.test(part));
    if (englishPart) return englishPart;
  }

  const stripped = trimmed
    .replace(/[\u3400-\u9FFF\uF900-\uFAFF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || trimmed;
}

function getRefName(ref: string): string {
  const parts = ref.split("/");
  return parts[parts.length - 1] ?? "";
}

function resolveSchema(
  schema: SchemaObject | undefined,
  schemas: Record<string, SchemaObject>
): SchemaObject | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;
  const key = getRefName(schema.$ref);
  return schemas[key] ?? schema;
}

function schemaType(schema: SchemaObject | undefined): string {
  if (!schema) return "string";
  if (schema.enum?.length) return "enum";
  return schema.type ?? "string";
}

function getExampleFromMedia(content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: SchemaObject }>, schemas?: Record<string, SchemaObject>): unknown {
  if (!content) return undefined;
  const firstMedia = Object.values(content)[0];
  if (!firstMedia) return undefined;
  if (firstMedia.example !== undefined) return firstMedia.example;
  const examples = firstMedia.examples ? Object.values(firstMedia.examples) : [];
  const firstExample = examples[0]?.value;
  if (firstExample !== undefined) return firstExample;
  return buildExampleFromSchema(resolveSchema(firstMedia.schema, schemas ?? {}), schemas ?? {});
}

function buildExampleFromSchema(
  schema: SchemaObject | undefined,
  schemas: Record<string, SchemaObject>,
  depth = 0
): unknown {
  if (!schema || depth > 5) return {};
  const resolved = resolveSchema(schema, schemas) ?? schema;

  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];

  if (resolved.oneOf?.length) {
    return buildExampleFromSchema(resolved.oneOf[0], schemas, depth + 1);
  }
  if (resolved.anyOf?.length) {
    return buildExampleFromSchema(resolved.anyOf[0], schemas, depth + 1);
  }
  if (resolved.allOf?.length) {
    const merged = resolved.allOf.reduce<Record<string, unknown>>((acc, item) => {
      const value = buildExampleFromSchema(item, schemas, depth + 1);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(acc, value);
      }
      return acc;
    }, {});
    return merged;
  }

  switch (resolved.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      const properties = resolved.properties ?? {};
      for (const [key, value] of Object.entries(properties)) {
        obj[key] = buildExampleFromSchema(value, schemas, depth + 1);
      }
      if (!Object.keys(obj).length && resolved.additionalProperties && typeof resolved.additionalProperties === "object") {
        obj.example_key = buildExampleFromSchema(resolved.additionalProperties, schemas, depth + 1);
      }
      return obj;
    }
    case "array":
      return [buildExampleFromSchema(resolved.items, schemas, depth + 1)];
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return true;
    case "string":
    default:
      if (resolved.format === "date-time") return "2026-01-01T00:00:00Z";
      if (resolved.format === "date") return "2026-01-01";
      return "string";
  }
}

function defaultValueForParameter(param: ParameterObject, schemas: Record<string, SchemaObject>): string {
  if (param.example !== undefined) return String(param.example);
  const resolved = resolveSchema(param.schema, schemas);
  if (resolved?.example !== undefined) return String(resolved.example);
  if (resolved?.default !== undefined) return String(resolved.default);
  if (resolved?.enum?.length) return String(resolved.enum[0]);
  const type = schemaType(resolved);
  if (type === "integer" || type === "number") return "1";
  if (type === "boolean") return "true";
  return "";
}

function responseExample(
  responses: Record<string, { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: SchemaObject }> }>,
  preferredCode: string,
  schemas: Record<string, SchemaObject>
): unknown {
  const preferred = responses[preferredCode];
  const fromPreferred = getExampleFromMedia(preferred?.content, schemas);
  if (fromPreferred !== undefined) return fromPreferred;

  const first = Object.values(responses)[0];
  const fromFirst = getExampleFromMedia(first?.content, schemas);
  if (fromFirst !== undefined) return fromFirst;
  return {};
}

function parseBaseUrls(infoDescription?: string): string[] {
  if (!infoDescription) return ["https://api.tikhub.io", "https://api.tikhub.dev"];
  const regex = /https:\/\/api\.tikhub\.(?:io|dev)/g;
  const matches = infoDescription.match(regex) ?? [];
  const unique = [...new Set(matches)];
  return unique.length ? unique : ["https://api.tikhub.io", "https://api.tikhub.dev"];
}

function inferApp(tag: string, path: string, operationId: string): string {
  const raw = `${tag} ${path} ${operationId}`.toLowerCase();
  for (const candidate of APP_KEYWORDS) {
    if (candidate.keys.some((key) => raw.includes(key))) {
      return candidate.app;
    }
  }
  return "Other";
}

export async function loadSpec(): Promise<OpenApiSpec> {
  const response = await fetch(openapiUrl);
  if (!response.ok) {
    throw new Error(`Failed to load OpenAPI spec: ${response.status}`);
  }
  return (await response.json()) as OpenApiSpec;
}

export function parseOperations(spec: OpenApiSpec): ParsedOperation[] {
  const schemas = spec.components?.schemas ?? {};
  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of SUPPORTED_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const tag = op.tags?.[0] ?? "Other";
      const id = op.operationId ?? `${method}_${path}`;
      const app = inferApp(tag, path, id);
      const mergedParameters = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])];
      const uniqueParameters = mergedParameters.filter((param, index, list) => {
        return list.findIndex((candidate) => candidate.name === param.name && candidate.in === param.in) === index;
      });

      const parameters = uniqueParameters.map((param) => {
        const resolved = resolveSchema(param.schema, schemas);
        return {
          name: param.name,
          required: Boolean(param.required),
          location: param.in,
          description: englishOnlyText(param.description ?? ""),
          type: schemaType(resolved),
          defaultValue: defaultValueForParameter(param, schemas)
        };
      });

      const requestBodyType = op.requestBody?.content ? Object.keys(op.requestBody.content)[0] : undefined;
      const requestBodyRaw = getExampleFromMedia(op.requestBody?.content, schemas);
      const requestBodyTemplate =
        requestBodyRaw !== undefined && requestBodyRaw !== null
          ? JSON.stringify(requestBodyRaw, null, 2)
          : HTTP_METHODS_WITHOUT_BODY.has(method)
            ? ""
            : "{\n  \n}";

      const responseCodes = Object.keys(op.responses ?? {});
      const successCode = responseCodes.includes("200") ? "200" : responseCodes[0] ?? "200";
      const errorCode = responseCodes.includes("422")
        ? "422"
        : responseCodes.find((code) => code.startsWith("4") || code.startsWith("5")) ?? successCode;

      operations.push({
        id,
        app,
        tag,
        method,
        path,
        summary: englishOnlyText(op.summary ?? id),
        description: englishOnlyText(op.description ?? ""),
        requiresAuth: Boolean(op.security),
        parameters,
        requestBodyType,
        requestBodyTemplate,
        requestBodyRaw,
        responseCodes,
        successExample: responseExample(op.responses, successCode, schemas),
        errorExample: responseExample(op.responses, errorCode, schemas)
      });
    }
  }

  return operations.sort((a, b) => {
    if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });
}

export function getDocMeta(spec: OpenApiSpec): {
  title: string;
  version: string;
  description: string;
  baseUrls: string[];
} {
  return {
    title: englishOnlyText(spec.info?.title ?? "API Documentation"),
    version: spec.info?.version ?? "unknown",
    description: englishOnlyText(spec.info?.description ?? ""),
    baseUrls: parseBaseUrls(spec.info?.description)
  };
}
