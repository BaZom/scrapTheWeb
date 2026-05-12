"use client";

let initialized = false;

export async function initSentry(): Promise<void> {
  if (initialized) {
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }
  initialized = true;
  try {
    const Sentry = await import("@sentry/browser");
    const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "local";
    const tracesSampleRate = Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0"
    );
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
      sendDefaultPii: false
    });
  } catch (error) {
    initialized = false;
    // eslint-disable-next-line no-console
    console.warn("Sentry initialization failed", error);
  }
}
