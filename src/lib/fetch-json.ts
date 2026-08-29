type FetchJsonOptions = RequestInit & {
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

export class HttpResponseError extends Error {
  readonly status: number;
  readonly data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(
      typeof data.error === "string"
        ? data.error
        : `Request failed with HTTP ${status}.`,
    );
    this.name = "HttpResponseError";
    this.status = status;
    this.data = data;
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function abortError() {
  return new DOMException("The request was aborted.", "AbortError");
}

function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function attemptSignal(parent: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Fetch JSON across unreliable mobile connections. Retrying song import is safe:
 * the server deduplicates imports by canonical YouTube video ID.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  options: FetchJsonOptions = {},
): Promise<T> {
  const {
    attempts = 2,
    retryDelayMs = 350,
    timeoutMs = 15_000,
    signal: parentSignal,
    ...requestInit
  } = options;
  const boundedAttempts = Math.max(1, attempts);
  let lastError: unknown;

  for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
    if (parentSignal?.aborted) throw abortError();
    const scoped = attemptSignal(parentSignal, timeoutMs);
    try {
      const response = await fetch(input, {
        ...requestInit,
        signal: scoped.signal,
      });
      const data = await responseData(response);
      if (response.ok) return data as T;

      const error = new HttpResponseError(response.status, data);
      if (!RETRYABLE_STATUS.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (parentSignal?.aborted) throw abortError();
      if (error instanceof HttpResponseError && !RETRYABLE_STATUS.has(error.status)) {
        throw error;
      }
      lastError = error;
    } finally {
      scoped.cleanup();
    }

    if (attempt + 1 < boundedAttempts) {
      await wait(retryDelayMs * (attempt + 1), parentSignal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The request could not be completed.");
}
