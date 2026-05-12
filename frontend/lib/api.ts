import { z } from "zod";

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string()
});

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  email_verified: z.boolean().default(false)
});

const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  last_used_at: z.string().nullable(),
  created_at: z.string()
});

const apiKeyCreateSchema = z.object({
  key: apiKeySchema,
  api_key: z.string()
});

const statusSchema = z.object({
  status: z.string()
});

const revokeAllSchema = z.object({
  revoked_count: z.number()
});

const authSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  user: userSchema,
  organization: organizationSchema
});

const dashboardSchema = z.object({
  user: userSchema,
  organizations: z.array(organizationSchema)
});

const domNodeSchema = z.object({
  nodeId: z.string(),
  tag: z.string(),
  text: z.string(),
  attrs: z.record(z.string()).default({}),
  classes: z.array(z.string()).default([]),
  parentNodeId: z.string().nullable().default(null),
  nthOfType: z.number().default(1),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

const pageSessionSchema = z.object({
  sessionId: z.string(),
  screenshotUrl: z.string().nullable(),
  domNodes: z.array(domNodeSchema),
  title: z.string().nullable(),
  jobStatus: z.string()
});

const selectorSchema = z.object({
  selector: z.string(),
  matchCount: z.number(),
  strategy: z.string()
});

const extractTypeSchema = z.enum(["text", "href", "src", "attribute", "html"]);

const previewFieldSchema = z.object({
  name: z.string(),
  selector: z.string(),
  extract: extractTypeSchema,
  attribute: z.string().optional()
});

const previewSchema = z.object({
  rows: z.array(z.record(z.string())),
  rowCount: z.number()
});

const recipeSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  websiteId: z.string(),
  name: z.string(),
  url: z.string(),
  pageType: z.string(),
  status: z.string(),
  version: z.number(),
  config: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});

const runCreateSchema = z.object({
  runId: z.string(),
  jobId: z.string().nullable(),
  status: z.string()
});

const extractedRecordSchema = z.object({
  id: z.string(),
  recordKey: z.string(),
  data: z.record(z.unknown()),
  createdAt: z.string()
});

const changeEventSchema = z.object({
  id: z.string(),
  changeType: z.string(),
  recordKey: z.string(),
  oldData: z.record(z.unknown()).nullable(),
  newData: z.record(z.unknown()).nullable(),
  createdAt: z.string()
});

const runSchema = z.object({
  id: z.string(),
  recipeId: z.string(),
  organizationId: z.string(),
  url: z.string(),
  status: z.string(),
  totalRecords: z.number(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  jobId: z.string().nullable(),
  records: z.array(extractedRecordSchema),
  changes: z.object({
    new: z.array(changeEventSchema),
    changed: z.array(changeEventSchema),
    removed: z.array(changeEventSchema)
  })
});

export type AuthSession = z.infer<typeof authSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type PageSession = z.infer<typeof pageSessionSchema>;
export type DomNode = z.infer<typeof domNodeSchema>;
export type SelectorResult = z.infer<typeof selectorSchema>;
export type ExtractType = z.infer<typeof extractTypeSchema>;
export type PreviewField = z.infer<typeof previewFieldSchema>;
export type PreviewResult = z.infer<typeof previewSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RunCreate = z.infer<typeof runCreateSchema>;
export type ExtractionRun = z.infer<typeof runSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function parseApiResponse<TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "detail" in body
        ? String(body.detail)
        : `API request failed with ${response.status}`;
    throw new Error(message);
  }

  return schema.parse(body);
}

export async function register(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return parseApiResponse(response, authSchema);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return parseApiResponse(response, authSchema);
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const response = await fetch(`${baseUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  return parseApiResponse(response, authSchema);
}

export async function logout(refreshToken: string): Promise<void> {
  await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
}

export async function getDashboard(accessToken: string): Promise<Dashboard> {
  const response = await fetch(`${baseUrl}/me/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, dashboardSchema);
}

export async function createPageSession(url: string, accessToken: string): Promise<PageSession> {
  const response = await fetch(`${baseUrl}/api/page-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ url })
  });
  return parseApiResponse(response, pageSessionSchema);
}

export async function fetchScreenshot(screenshotUrl: string, accessToken: string): Promise<string> {
  const response = await fetch(screenshotUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Screenshot request failed with ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function generateSelector(
  sessionId: string,
  nodeId: string,
  accessToken: string,
  containerSelector?: string
): Promise<SelectorResult> {
  const response = await fetch(`${baseUrl}/api/page-sessions/${sessionId}/selector`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nodeId,
      mode: containerSelector ? "node" : "container",
      containerSelector
    })
  });
  return parseApiResponse(response, selectorSchema);
}

export async function previewPageSession(
  sessionId: string,
  containerSelector: string,
  fields: PreviewField[],
  accessToken: string
): Promise<PreviewResult> {
  const response = await fetch(`${baseUrl}/api/page-sessions/${sessionId}/preview`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ containerSelector, fields })
  });
  return parseApiResponse(response, previewSchema);
}

export async function createRecipe(
  name: string,
  url: string,
  containerSelector: string,
  fields: PreviewField[],
  accessToken: string
): Promise<Recipe> {
  const response = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, url, containerSelector, fields, pageType: "listing" })
  });
  return parseApiResponse(response, recipeSchema);
}

export async function runRecipe(recipeId: string, accessToken: string): Promise<RunCreate> {
  const response = await fetch(`${baseUrl}/api/recipes/${recipeId}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return parseApiResponse(response, runCreateSchema);
}

export async function getRun(runId: string, accessToken: string): Promise<ExtractionRun> {
  const response = await fetch(`${baseUrl}/api/runs/${runId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, runSchema);
}

export async function downloadRunExport(
  runId: string,
  format: "csv" | "json",
  accessToken: string
): Promise<Blob> {
  const response = await fetch(`${baseUrl}/api/runs/${runId}/export.${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "detail" in body
        ? String(body.detail)
        : `Export request failed with ${response.status}`;
    throw new Error(message);
  }
  return response.blob();
}

export async function requestEmailVerification(accessToken: string): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/auth/verify/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return parseApiResponse(response, statusSchema);
}

export async function confirmEmailVerification(token: string): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/auth/verify/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  return parseApiResponse(response, statusSchema);
}

export async function requestPasswordReset(email: string): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  return parseApiResponse(response, statusSchema);
}

export async function confirmPasswordReset(
  token: string,
  password: string
): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password })
  });
  return parseApiResponse(response, statusSchema);
}

export async function listApiKeys(accessToken: string): Promise<ApiKey[]> {
  const response = await fetch(`${baseUrl}/me/api-keys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, z.array(apiKeySchema));
}

export async function createApiKey(
  accessToken: string,
  name: string
): Promise<ApiKeyCreate> {
  const response = await fetch(`${baseUrl}/me/api-keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name })
  });
  return parseApiResponse(response, apiKeyCreateSchema);
}

export async function deleteApiKey(
  accessToken: string,
  keyId: string
): Promise<{ status: string }> {
  const response = await fetch(`${baseUrl}/me/api-keys/${keyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return parseApiResponse(response, statusSchema);
}

export async function revokeAllSessions(
  accessToken: string
): Promise<{ revoked_count: number }> {
  const response = await fetch(`${baseUrl}/auth/sessions/revoke-all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return parseApiResponse(response, revokeAllSchema);
}
