import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: mockAuth,
  },
}));

import { api } from "./api";

describe("api auth recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries with a refreshed token before surfacing 401", async () => {
    const fetchMock = vi.fn();
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: "stale-token" } },
    });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: { access_token: "fresh-token" } },
    });
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/jobs")).resolves.toEqual({ ok: true });
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signs out when the refreshed token is still rejected", async () => {
    const fetchMock = vi.fn();
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: "stale-token" } },
    });
    mockAuth.refreshSession.mockResolvedValue({
      data: { session: { access_token: "fresh-token" } },
    });
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/jobs")).rejects.toThrow("Request failed: 401");
    expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
