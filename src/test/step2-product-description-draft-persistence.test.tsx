import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Step2Product from "@/pages/Step2Product";

const {
  authGetUserMock,
  companyMaybeSingleMock,
  insertMock,
  invokeMock,
  productMaybeSingleMock,
  updateEqMock,
  updateMock,
} = vi.hoisted(() => ({
  authGetUserMock: vi.fn(),
  companyMaybeSingleMock: vi.fn(),
  insertMock: vi.fn(),
  invokeMock: vi.fn(),
  productMaybeSingleMock: vi.fn(),
  updateEqMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children, actionBar }: { children: React.ReactNode; actionBar?: React.ReactNode }) => (
    <main>
      {children}
      {actionBar}
    </main>
  ),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: vi.fn(),
}));

vi.mock("@/hooks/useApiCall", () => ({
  useApiCall: () => ({
    invoke: invokeMock,
    isRetrying: false,
    retryInSec: 0,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const createSelectChain = (maybeSingleMock: ReturnType<typeof vi.fn>) => {
    const chain = {
      eq: vi.fn(() => chain),
      maybeSingle: maybeSingleMock,
      select: vi.fn(() => chain),
    };
    return chain;
  };

  return {
    supabase: {
      auth: {
        getUser: authGetUserMock,
      },
      from: (table: string) => {
        if (table === "project_products") {
          return {
            delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
            insert: insertMock,
            select: vi.fn(() => createSelectChain(productMaybeSingleMock)),
            update: updateMock,
          };
        }
        if (table === "project_companies") {
          return createSelectChain(companyMaybeSingleMock);
        }
        return createSelectChain(vi.fn().mockResolvedValue({ data: null, error: null }));
      },
    },
  };
});

describe("Step2Product AI description draft persistence", () => {
  beforeEach(() => {
    productMaybeSingleMock.mockReset();
    companyMaybeSingleMock.mockReset();
    invokeMock.mockReset();
    updateMock.mockReset();
    updateEqMock.mockReset();
    insertMock.mockReset();
    authGetUserMock.mockReset();

    productMaybeSingleMock.mockResolvedValue({
      data: {
        ai_rationale: null,
        components: JSON.stringify({ tags: ["접이식 프레임"] }),
        confirmed: false,
        description: "",
        hs_candidates: [],
        hs_code: null,
        hsk_code: null,
        id: "product-row-1",
        name: "영유아 운송기구",
      },
      error: null,
    });
    companyMaybeSingleMock.mockResolvedValue({
      data: {
        company_name: "테스트 제조",
        industrial_complex: "경기 산단",
        industry_code: "31999",
        raw: null,
      },
      error: null,
    });
    updateMock.mockReturnValue({ eq: updateEqMock });
    updateEqMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
    authGetUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("saves a button-generated description draft so it survives later reloads", async () => {
    const draft =
      "영유아의 안전한 이동을 목적으로 제작된 접이식 운송기구입니다. 안전벨트와 브레이크, 보관이 쉬운 프레임 구조를 갖추고 있습니다.";
    const formattedDraft =
      "영유아의 안전한 이동을 목적으로 제작된 접이식 운송기구입니다.\n\n안전벨트와 브레이크, 보관이 쉬운 프레임 구조를 갖추고 있습니다.";

    invokeMock.mockResolvedValue({
      attempts: 1,
      data: {
        description: draft,
        rationale: "제품명과 주요 부품을 근거로 작성했습니다.",
        state: "success",
      },
      message: null,
      ok: true,
      retried: false,
      state: "success",
      status: 200,
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/projects/project-1/product"]}
      >
        <Routes>
          <Route path="/projects/:id/product" element={<Step2Product />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByDisplayValue("영유아 운송기구");

    fireEvent.click(screen.getByRole("button", { name: /AI 설명 초안 작성/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("용도, 정격 출력, 소재, 인증, 응용 분야 등 (20~1000자)")).toHaveValue(
        formattedDraft,
      );
    });

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ai_rationale: "제품명과 주요 부품을 근거로 작성했습니다.",
          description: formattedDraft,
          name: "영유아 운송기구",
        }),
      );
    });
    expect(updateEqMock).toHaveBeenCalledWith("id", "product-row-1");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("formats an AI-generated description draft into readable paragraphs without a separate paragraph button", async () => {
    const draft =
      "승용 자동차는 인원 수송을 목적으로 설계된 차량입니다. 내연기관과 전동화 시스템을 기반으로 도심 및 장거리 이동에 사용됩니다. 차체 구조와 전자 제어장치가 결합되어 안전성과 주행 편의를 제공합니다.";
    const formattedDraft =
      "승용 자동차는 인원 수송을 목적으로 설계된 차량입니다.\n\n내연기관과 전동화 시스템을 기반으로 도심 및 장거리 이동에 사용됩니다.\n\n차체 구조와 전자 제어장치가 결합되어 안전성과 주행 편의를 제공합니다.";

    invokeMock.mockResolvedValue({
      attempts: 1,
      data: {
        description: draft,
        rationale: "제품명과 주요 특징을 근거로 작성했습니다.",
        state: "success",
      },
      message: null,
      ok: true,
      retried: false,
      state: "success",
      status: 200,
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/projects/project-1/product"]}
      >
        <Routes>
          <Route path="/projects/:id/product" element={<Step2Product />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByDisplayValue("영유아 운송기구");

    expect(screen.queryByRole("button", { name: /문단 정리/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AI 설명 초안 작성/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("용도, 정격 출력, 소재, 인증, 응용 분야 등 (20~1000자)")).toHaveValue(
        formattedDraft,
      );
    });
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ai_rationale: "제품명과 주요 특징을 근거로 작성했습니다.",
          description: formattedDraft,
          name: "영유아 운송기구",
        }),
      );
    });
    expect(updateEqMock).toHaveBeenCalledWith("id", "product-row-1");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
