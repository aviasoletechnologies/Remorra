import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/v1";



export async function api<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.message ?? payload?.error?.message ?? `Request failed: ${response.status}`;
    if (typeof message === "string" && message.includes("TOKEN_BUDGET_EXCEEDED")) {
      window.dispatchEvent(new CustomEvent("token-budget-exceeded"));
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function waitForJob<T = Record<string, unknown>>(
  jobId: string,
  timeoutMs = 90_000,
  onProgress?: (result: Record<string, unknown>) => void,
): Promise<T> {
  try {
    return await streamJob<T>(jobId, timeoutMs, onProgress);
  } catch {
    return pollJob<T>(jobId, timeoutMs, onProgress);
  }
}

async function streamJob<T = Record<string, unknown>>(
  jobId: string,
  timeoutMs: number,
  onProgress?: (result: Record<string, unknown>) => void,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await authorizedFetch(`/jobs/${jobId}/stream`, {
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    window.clearTimeout(timeout);
    throw new Error("Streaming is not available for this job.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as {
          job?: { status: string; result?: T; error?: string };
          done?: boolean;
        };
        if (payload.job?.result && onProgress) {
          onProgress(payload.job.result as Record<string, unknown>);
        }
        if (payload.job?.status === "completed") return payload.job.result as T;
        if (payload.job?.status === "failed") {
          throw new Error(payload.job.error ?? "AI job failed.");
        }
        if (payload.done) return payload.job?.result as T;
      }
    }
  } finally {
    window.clearTimeout(timeout);
    controller.abort();
  }
  throw new Error("AI response timed out. The job is still available in Jobs.");
}

async function pollJob<T = Record<string, unknown>>(
  jobId: string,
  timeoutMs: number,
  onProgress?: (result: Record<string, unknown>) => void,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await api<{ status: string; result?: T; error?: string }>(
      `/jobs/${jobId}`,
    );
    if (job.result && onProgress) {
      onProgress(job.result as Record<string, unknown>);
    }
    if (job.status === "completed") return job.result as T;
    if (job.status === "failed") {
      throw new Error(job.error ?? "AI job failed.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  throw new Error("AI response timed out. The job is still available in Jobs.");
}

export function streamTextJob(
  jobId: string,
  onToken: (text: string) => void,
  onStateChange?: (state: "connecting" | "reconnecting" | "connected" | "done" | "failed") => void,
  onError?: (err: Error) => void,
  onEvent?: (event: { sequence: number; type: string; delta?: string; snapshot?: string; metadata?: any }) => void
): () => void {
  let lastSequence = 0;
  let isAborted = false;
  let controller = new AbortController();
  let currentText = "";

  const connect = async () => {
    if (isAborted) return;
    onStateChange?.(lastSequence > 0 ? "reconnecting" : "connecting");

    try {
      controller = new AbortController();
      const response = await authorizedFetch(`/jobs/${jobId}/tokens/stream?after=${lastSequence}`, {
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to connect to SSE stream: ${response.status}`);
      }

      onStateChange?.("connected");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;

          const event = JSON.parse(line.slice(5).trim()) as {
            sequence: number;
            type: string;
            delta?: string;
            snapshot?: string;
            metadata?: any;
          };

          lastSequence = event.sequence;

          if (event.type === "token" && event.delta) {
            currentText += event.delta;
            onToken(currentText);
            if (onEvent) onEvent(event);
          } else if (event.type === "snapshot" && event.snapshot) {
            currentText = event.snapshot;
            onToken(currentText);
            if (onEvent) onEvent(event);
          } else if (event.type === "completed") {
            if (event.snapshot) {
              currentText = event.snapshot;
            }
            onToken(currentText);
            // onEvent last: it merges the final message into cache and clears
            // streamedReply — must win over the onToken call above, or the
            // message renders twice (committed bubble + stale streaming bubble).
            if (onEvent) onEvent(event);
            onStateChange?.("done");
            return;
          } else if (event.type === "failed") {
            if (onEvent) onEvent(event);
            throw new Error(event.delta ?? "Stream failed.");
          } else {
            if (onEvent) onEvent(event);
          }
        }
      }
    } catch (err: any) {
      if (isAborted) return;
      if (err.name === "AbortError") return;

      console.warn("SSE stream error, retrying...", err);
      onStateChange?.("reconnecting");
      if (onError && lastSequence === 0) {
        // If it fails on initial connection, propagate
        onError(err);
      }
      setTimeout(connect, 1500);
    }
  };

  connect();

  return () => {
    isAborted = true;
    controller.abort();
  };
}

export function streamRecentJobs(
  onJobs: (jobs: any[]) => void,
  onError?: (err: Error) => void,
): () => void {
  let isAborted = false;
  let controller = new AbortController();

  const connect = async () => {
    if (isAborted) return;

    try {
      controller = new AbortController();
      const response = await authorizedFetch("/events/stream", {
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to connect to events SSE stream: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;

          try {
            const payload = JSON.parse(line.slice(5).trim()) as {
              type: string;
              jobs: any[];
            };

            if (payload.type === "jobs") {
              onJobs(payload.jobs);
            }
          } catch (parseErr) {
            console.error("Failed to parse SSE jobs event", parseErr);
          }
        }
      }
    } catch (err: any) {
      if (isAborted) return;
      if (err.name === "AbortError") return;

      console.warn("Events SSE stream error, retrying...", err);
      if (onError) {
        onError(err as Error);
      }
      setTimeout(connect, 2000);
    }
  };

  connect();

  return () => {
    isAborted = true;
    controller.abort();
  };
}


function stripHtml(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/<\/?(?:script|iframe|object|embed|form|input|button)[^>]*>/gi, "");
  }
  if (Array.isArray(value)) return value.map(stripHtml);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = stripHtml(v);
    }
    return result;
  }
  return value;
}

async function authorizedFetch(
  path: string,
  init: RequestInit & { version?: number } = {},
) {
  let token = await accessToken();
  const isForm = init.body instanceof FormData;

  // Sanitize outgoing JSON bodies recursively
  if (init.body && typeof init.body === "string" && !isForm) {
    try {
      const parsed = JSON.parse(init.body);
      const sanitized = stripHtml(parsed);
      init.body = JSON.stringify(sanitized);
    } catch {
      // not a JSON string, ignore
    }
  }

  const request = (accessToken?: string) =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...(!isForm ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(init.version ? { "if-match": String(init.version) } : {}),
        ...init.headers,
      },
    });

  let response = await request(token);
  if (response.status === 401 && supabase) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token;
    if (token) response = await request(token);
    if (response.status === 401) {
      await expireSession();
    }
  }
  return response;
}

async function accessToken() {
  if (!supabase) return undefined;
  const current = await supabase.auth.getSession();
  const session = current.data.session;
  if (!session) return undefined;
  const expiresSoon =
    typeof session.expires_at === "number" &&
    session.expires_at * 1000 <= Date.now() + 30_000;
  if (!expiresSoon) return session.access_token;
  const refreshed = await supabase.auth.refreshSession();
  if (!refreshed.data.session) {
    await expireSession();
    return undefined;
  }
  return refreshed.data.session.access_token;
}

async function expireSession() {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
  window.dispatchEvent(new CustomEvent("remorra-session-expired"));
}

export async function advancePhase(
  projectId: string,
  toPhase: string,
  currentVersion: number,
): Promise<{ id: string; phase: string; version: number }> {
  return api(`/projects/${projectId}/phase`, {
    method: "PATCH",
    version: currentVersion,
    body: JSON.stringify({ phase: toPhase }),
  });
}
