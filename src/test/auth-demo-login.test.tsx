import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionOrRecoverMock, navigateMock, signInWithPasswordMock } = vi.hoisted(() => ({
  getSessionOrRecoverMock: vi.fn(),
  navigateMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: signInWithPasswordMock,
      signUp: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase-auth", () => ({
  getSessionOrRecover: getSessionOrRecoverMock,
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Auth contest demo login", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    getSessionOrRecoverMock.mockReset();
    navigateMock.mockReset();
    signInWithPasswordMock.mockReset();
    getSessionOrRecoverMock.mockResolvedValue(null);
    signInWithPasswordMock.mockResolvedValue({ error: null });
  });

  it("prefills the configured contest account and signs in from the demo button", async () => {
    vi.stubEnv("VITE_CONTEST_DEMO_EMAIL", "contest-demo@example.com");
    vi.stubEnv("VITE_CONTEST_DEMO_PASSWORD", "contest-password");

    const { default: Auth } = await import("@/pages/Auth");

    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("이메일")).toHaveValue("contest-demo@example.com");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("contest-password");

    fireEvent.click(screen.getByRole("button", { name: "공모전 데모 로그인" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "contest-demo@example.com",
        password: "contest-password",
      });
    });
  });
});
