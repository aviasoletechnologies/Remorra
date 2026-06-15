import { supabase } from "./supabase";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api/v1";

export async function api<T>(
  path: string,
  init: RequestInit & { version?: number } = {},
): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(!isForm ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.version ? { "if-match": String(init.version) } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.message ?? payload?.error?.message ?? `Request failed: ${response.status}`,
    );
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
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`${apiUrl}/jobs/${jobId}/stream`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
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
