/**
 * Standardized API / server-fn error envelope + process guards.
 */

export type ApiErrorBody = {
  ok: false;
  error: string;
  code?: string;
  details?: string | number | boolean | null | Record<string, string | number | boolean | null>;

};

export type ApiSuccess<T> = { ok: true } & T;

export function toApiError(err: unknown, fallback = "Unknown error"): ApiErrorBody {
  if (err && typeof err === "object" && "ok" in err && (err as { ok: unknown }).ok === false) {
    return err as ApiErrorBody;
  }
  if (err instanceof Error) {
    const code =
      err.name === "AbortError"
        ? "ABORTED"
        : err.name === "TimeoutError"
          ? "TIMEOUT"
          : /DNS|ENOTFOUND|getaddrinfo/i.test(err.message)
            ? "DNS_FAILURE"
            : /HTTP\s+(\d{3})/i.test(err.message)
              ? "HTTP_ERROR"
              : "ERROR";
    return {
      ok: false,
      error: err.message || fallback,
      code,
    };
  }
  return { ok: false, error: String(err ?? fallback), code: "ERROR" };
}

/**
 * Wrap async handler so it never throws out of the server function boundary.
 */
export async function withApiGuard<T extends Record<string, unknown>>(
  fn: () => Promise<T | ApiErrorBody>,
): Promise<T | ApiErrorBody> {
  try {
    return await fn();
  } catch (err) {
    console.error("[api-guard]", err);
    return toApiError(err);
  }
}

let processGuardsInstalled = false;

/**
 * Install once-per-process handlers so uncaught errors log instead of silent death.
 * Does not exit the process (server must stay up for other requests).
 */
export function installProcessErrorGuards(): void {
  if (processGuardsInstalled) return;
  if (typeof process === "undefined" || !process.on) return;
  processGuardsInstalled = true;

  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
  });
}
