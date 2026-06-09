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

const containerCandidateSchema = z.object({
  nodeId: z.string(),
  tag: z.string(),
  label: z.string(),
  group: z.string(),
  score: z.number(),
  reason: z.string(),
  matchCount: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

const accessBlockSchema = z.object({
  blocked: z.boolean(),
  status: z.number(),
  vendor: z.string(),
  reason: z.string()
});

const pageSessionSchema = z.object({
  sessionId: z.string(),
  screenshotUrl: z.string().nullable(),
  domNodes: z.array(domNodeSchema),
  title: z.string().nullable(),
  jobStatus: z.string(),
  overlayDismissals: z.array(z.record(z.string())).default([]),
  containerCandidates: z.array(containerCandidateSchema).default([]),
  accessBlock: accessBlockSchema.nullable().default(null)
});

const selectorSchema = z.object({
  selector: z.string(),
  matchCount: z.number(),
  strategy: z.string(),
  // Exact nodeIds the selector matches (backend-authoritative); the builder outlines
  // these instead of guessing from tag+class signatures. Defaults to [] for older
  // payloads and the synthetic single-record `body` selector.
  matchedNodeIds: z.array(z.string()).default([])
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

// Snapshot preview also returns the generated selectors so the caller can save them.
const snapshotPreviewSchema = previewSchema.extend({
  fields: z.array(previewFieldSchema)
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

const recipesSchema = z.array(recipeSchema);
const runsSchema = z.array(runSchema);

export type AuthSession = z.infer<typeof authSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type PageSession = z.infer<typeof pageSessionSchema>;
export type DomNode = z.infer<typeof domNodeSchema>;
export type ContainerCandidate = z.infer<typeof containerCandidateSchema>;
export type AccessBlock = z.infer<typeof accessBlockSchema>;
export type SelectorResult = z.infer<typeof selectorSchema>;
export type ExtractType = z.infer<typeof extractTypeSchema>;
export type PreviewField = z.infer<typeof previewFieldSchema>;
export type PreviewResult = z.infer<typeof previewSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type ChangeEvent = z.infer<typeof changeEventSchema>;
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
  containerSelector?: string,
  // For single-record pages: request a page-wide unique selector (mode "node", no
  // container) instead of a container-relative one.
  options?: { single?: boolean }
): Promise<SelectorResult> {
  const mode = options?.single ? "node" : containerSelector ? "node" : "container";
  const response = await fetch(`${baseUrl}/api/page-sessions/${sessionId}/selector`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nodeId,
      mode,
      containerSelector: options?.single ? undefined : containerSelector
    })
  });
  return parseApiResponse(response, selectorSchema);
}

// Teach-by-example (ADR 0009): infer a selector covering several clicked examples.
// Items use mode "container"; fields pass the container selector for a relative match.
export async function inferSelector(
  sessionId: string,
  positiveNodeIds: string[],
  accessToken: string,
  options: { mode: "container" | "node"; containerSelector?: string }
): Promise<SelectorResult> {
  const response = await fetch(`${baseUrl}/api/page-sessions/${sessionId}/selector/infer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      positiveNodeIds,
      mode: options.mode,
      containerSelector: options.containerSelector
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

export type SnapshotPick = { nodeId: string; extract: ExtractType; name: string };
export type SnapshotPreview = z.infer<typeof snapshotPreviewSchema>;

// Fast preview from the render snapshot (ADR 0009): generates each picked field's selector
// and reads its value from domNodes server-side — no S3 fetch, no HTML re-parse. Returns the
// extracted rows AND the generated fields (to save). containerSelector "body" = single page.
export async function previewFromSnapshot(
  sessionId: string,
  containerSelector: string,
  picks: SnapshotPick[],
  accessToken: string
): Promise<SnapshotPreview> {
  const response = await fetch(`${baseUrl}/api/page-sessions/${sessionId}/preview/snapshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ containerSelector, picks })
  });
  return parseApiResponse(response, snapshotPreviewSchema);
}

export async function createRecipe(
  name: string,
  url: string,
  containerSelector: string,
  fields: PreviewField[],
  accessToken: string,
  pageType: "listing" | "single" = "listing"
): Promise<Recipe> {
  const response = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, url, containerSelector, fields, pageType })
  });
  return parseApiResponse(response, recipeSchema);
}

export async function listRecipes(accessToken: string): Promise<Recipe[]> {
  const response = await fetch(`${baseUrl}/api/recipes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, recipesSchema);
}

export async function runRecipe(recipeId: string, accessToken: string): Promise<RunCreate> {
  const response = await fetch(`${baseUrl}/api/recipes/${recipeId}/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return parseApiResponse(response, runCreateSchema);
}

export async function listRuns(accessToken: string): Promise<ExtractionRun[]> {
  const response = await fetch(`${baseUrl}/api/runs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, runsSchema);
}

export async function getRun(runId: string, accessToken: string): Promise<ExtractionRun> {
  const response = await fetch(`${baseUrl}/api/runs/${runId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  return parseApiResponse(response, runSchema);
}

// Stream a run's state via Server-Sent Events until it reaches a terminal state.
// We consume the stream with fetch + ReadableStream rather than the native EventSource
// API specifically because EventSource cannot send an Authorization header, and the API
// authenticates with Bearer tokens. `onRun` fires with the full run on each change; the
// returned promise resolves when the stream ends (terminal state, cap, or abort).
export async function streamRunEvents(
  runId: string,
  accessToken: string,
  onRun: (run: ExtractionRun) => void,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/event-stream" },
    cache: "no-store",
    signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`Run stream failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; a frame may carry multiple `data:` lines.
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) {
        const parsed = runSchema.safeParse(JSON.parse(data));
        if (parsed.success) onRun(parsed.data);
        // Non-run frames (e.g. `event: error`) are ignored; the stream simply ends.
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
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
