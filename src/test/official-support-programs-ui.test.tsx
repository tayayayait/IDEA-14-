import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfficialSupportProgramsSection } from "@/components/OfficialSupportProgramsSection";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

const props = {
  projectId: "project-1",
  productName: "고정밀 볼베어링",
  countryName: "일본",
  verdictSignals: [
    {
      source: "action" as const,
      text: "수출 대상국의 기술규격 적합성 검증과 시험성적서를 확보합니다.",
    },
  ],
};

describe("OfficialSupportProgramsSection", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("shows verified official program data and refreshes it on demand", async () => {
    invokeMock.mockResolvedValue({
      data: {
        programs: [
          {
            id: "PBLN_1",
            title: "2026년 해외규격인증획득지원사업 참여기업 모집",
            ministry: "중소벤처기업부",
            agency: "한국화학융합시험연구원",
            category: "수출",
            target: "중소기업",
            summary: "인증비, 시험비 및 컨설팅비 일부를 지원합니다.",
            applicationMethod: "온라인 접수",
            applicationUrl: "https://www.smes.go.kr/globalcerti/",
            detailUrl: "https://www.bizinfo.go.kr/detail/1",
            applicationPeriod: "2026-07-15 ~ 2026-08-14",
            applicationStatus: "open",
            applicationStatusLabel: "모집 중",
            matchReasons: ["해외규격·인증 지원"],
            verdictEvidence: [
              "수출 대상국의 기술규격 적합성 검증과 시험성적서를 확보합니다.",
            ],
            programEvidence: [
              "인증비, 시험비 및 컨설팅비 일부를 지원합니다.",
            ],
            eligibilityNotes: ["중소기업 해당 여부 확인"],
          },
        ],
        checked_at: "2026-07-27T08:00:00.000Z",
      },
      error: null,
    });

    render(<OfficialSupportProgramsSection {...props} />);

    expect(
      await screen.findByText("2026년 해외규격인증획득지원사업 참여기업 모집"),
    ).toBeInTheDocument();
    expect(screen.getByText("모집 중")).toBeInTheDocument();
    expect(screen.getByText("해외규격·인증 지원")).toBeInTheDocument();
    expect(screen.getByText("AI 판단 연결 근거")).toBeInTheDocument();
    expect(screen.getByText("공고 확인 근거")).toBeInTheDocument();
    expect(
      screen.getByText(
        "수출 대상국의 기술규격 적합성 검증과 시험성적서를 확보합니다.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("“인증비, 시험비 및 컨설팅비 일부를 지원합니다.”"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /공식 공고 보기/ })).toHaveAttribute(
      "href",
      "https://www.bizinfo.go.kr/detail/1",
    );
    expect(invokeMock).toHaveBeenCalledWith("api-bizinfo-support", {
      body: {
        project_id: "project-1",
        product_name: "고정밀 볼베어링",
        country_name: "일본",
        verdict_signals: [
          {
            source: "action",
            text: "수출 대상국의 기술규격 적합성 검증과 시험성적서를 확보합니다.",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "최신 지원사업 다시 확인" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
  });

  it("does not invent a fallback when the official API returns no match", async () => {
    invokeMock.mockResolvedValue({
      data: {
        programs: [],
        checked_at: "2026-07-27T08:00:00.000Z",
      },
      error: null,
    });

    render(<OfficialSupportProgramsSection {...props} />);

    expect(
      await screen.findByText(
        /AI가 현재 수출 업무에 직접 도움이 된다고 판단한 지원사업이 없습니다/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/후보에 없는 사업은 임의로 추천하지 않습니다/)).toBeInTheDocument();
  });
});
