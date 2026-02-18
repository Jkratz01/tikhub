export type HttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "trace";

export type SchemaObject = {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  enum?: Array<string | number | boolean>;
  default?: unknown;
  example?: unknown;
  description?: string;
  required?: string[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  allOf?: SchemaObject[];
  additionalProperties?: boolean | SchemaObject;
  $ref?: string;
};

export type ParameterObject = {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
};

export type MediaTypeObject = {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
};

export type ResponseObject = {
  description?: string;
  content?: Record<string, MediaTypeObject>;
};

export type OperationObject = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: ParameterObject[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, MediaTypeObject>;
  };
  responses: Record<string, ResponseObject>;
  security?: Array<Record<string, string[]>>;
};

export type PathItemObject = Partial<Record<HttpMethod, OperationObject>> & {
  parameters?: ParameterObject[];
};

export type OpenApiSpec = {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, unknown>;
  };
  paths: Record<string, PathItemObject>;
};

export type ParsedParameter = {
  name: string;
  required: boolean;
  location: "query" | "header" | "path" | "cookie";
  description: string;
  type: string;
  defaultValue: string;
};

export type ParsedOperation = {
  id: string;
  app: string;
  tag: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  requiresAuth: boolean;
  parameters: ParsedParameter[];
  requestBodyType?: string;
  requestBodyTemplate?: string;
  requestBodyRaw?: unknown;
  responseCodes: string[];
  successExample: unknown;
  errorExample: unknown;
};
