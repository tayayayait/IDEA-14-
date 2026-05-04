import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApiCall } from "@/hooks/useApiCall";

const { getSessionMock, invokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
    auth: {
      getSession: getSessionMock,
    },
  },
}));

describe("useApiCall Edge CPU limit handling", () => {
  afterEach(() => {
    getSessionMock.mockReset();
    invokeMock.mockReset();
  });

  it("does not retry Supabase Edge Function 546 CPU limit responses", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "user-token" } },
      error: null,
    });
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { status: 546 },
      },
      response: new Response("", { status: 546 }),
    });

    const { result } = renderHook(() => useApiCall());
    let output: Awaited<ReturnType<typeof result.current.invoke<unknown>>> | null = null;

    await act(async () => {
      output = await result.current.invoke("recommend-countries", { project_id: "p1" }, {
        retry500DelayMs: 0,
      });
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("recommend-countries", expect.objectContaining({
      headers: { Authorization: "Bearer user-token" },
    }));
    expect(output?.ok).toBe(false);
    expect(output?.status).toBe(546);
    expect(output?.retried).toBe(false);
    expect(output?.message).toContain("CPU limit");
  });

  it("does not call an authenticated Edge Function without a session", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useApiCall());
    let output: Awaited<ReturnType<typeof result.current.invoke<unknown>>> | null = null;

    await act(async () => {
      output = await result.current.invoke("country-detail", { project_id: "p1" });
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(output?.ok).toBe(false);
    expect(output?.status).toBe(401);
    expect(output?.attempts).toBe(0);
  });
});
