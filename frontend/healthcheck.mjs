const baseUrl = process.env.INTERNAL_API_BASE_URL ?? "http://127.0.0.1:8000";

try {
  const response = await fetch(`${baseUrl}/health/live`, {
    signal: AbortSignal.timeout(3000)
  });

  if (!response.ok) {
    process.exit(1);
  }
} catch {
  process.exit(1);
}
