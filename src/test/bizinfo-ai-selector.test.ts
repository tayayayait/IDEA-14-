import { describe, expect, it } from "vitest";
import * as bizinfoSupport from "../../supabase/functions/_shared/bizinfo-support";
import type {
  BizinfoProgram,
  BizinfoVerdictSignal,
  MatchedBizinfoProgram,
} from "../../supabase/functions/_shared/bizinfo-support";

interface AiSelectionContext {
  productName: string;
  productDescription: string;
  hsCode: string;
  hskCode: string;
  countryName: string;
  industryCode: string;
  verdictSignals: BizinfoVerdictSignal[];
}

type BuildPrompt = (
  candidates: MatchedBizinfoProgram[],
  context: AiSelectionContext,
) => string;

type ApplySelection = (
  candidates: MatchedBizinfoProgram[],
  response: unknown,
  context: AiSelectionContext,
  limit?: number,
) => MatchedBizinfoProgram[];

type SelectWithAi = (
  candidates: MatchedBizinfoProgram[],
  context: AiSelectionContext,
  apiKey: string,
  fetcher?: typeof fetch,
  signal?: AbortSignal,
) => Promise<MatchedBizinfoProgram[]>;

const moduleApi = bizinfoSupport as unknown as {
  buildBizinfoAiSelectionPrompt?: BuildPrompt;
  applyBizinfoAiSelection?: ApplySelection;
  selectBizinfoProgramsWithAi?: SelectWithAi;
};

const context: AiSelectionContext = {
  productName: "반도체(DRAM)",
  productDescription: "서버용 메모리 반도체",
  hsCode: "854232",
  hskCode: "8542321010",
  countryName: "미국",
  industryCode: "26111",
  verdictSignals: [
    {
      source: "risk",
      text: "미국 수입통관 시 원산지 입증이 부족하면 통관 보류 위험이 있습니다.",
    },
    {
      source: "action",
      text: "NRTL 안전인증 시험과 기술문서 준비를 우선 실행합니다.",
    },
  ],
};

const officialProgram = matchedProgram({
  id: "P_CERT",
  title: "해외규격인증 획득 지원사업",
  summary:
    "수출 중소기업을 대상으로 해외규격인증 시험비와 인증비를 지원합니다.",
  hashtags: "수출,해외인증,시험비,중소기업",
});

const sectorMismatchProgram = matchedProgram({
  id: "P_FOOD",
  title: "농식품 해외 판촉 지원사업",
  summary:
    "국내 농림축산식품 제조기업을 대상으로 해외 판촉과 샘플 운송을 지원합니다.",
  hashtags: "수출,농림축산식품,해외판촉",
});

describe("Bizinfo AI selector", () => {
  it("builds a grounded prompt from product codes, verdict risks, actions, and official candidates", () => {
    const buildPrompt = requireFunction(
      moduleApi.buildBizinfoAiSelectionPrompt,
      "buildBizinfoAiSelectionPrompt",
    );

    const prompt = buildPrompt(
      [officialProgram, sectorMismatchProgram],
      context,
    );

    expect(prompt).toContain("반도체(DRAM)");
    expect(prompt).toContain("854232");
    expect(prompt).toContain("8542321010");
    expect(prompt).toContain("통관 보류 위험");
    expect(prompt).toContain("NRTL 안전인증");
    expect(prompt).toContain("P_CERT");
    expect(prompt).toContain("P_FOOD");
    expect(prompt).toContain("특정 업종");
    expect(prompt).toContain("선택하지 마십시오");
    expect(prompt).toContain("후보에 없는 사업을 생성하지 마십시오");
  });

  it("keeps only AI selections grounded in an existing program and exact official evidence", () => {
    const applySelection = requireFunction(
      moduleApi.applyBizinfoAiSelection,
      "applyBizinfoAiSelection",
    );

    const selected = applySelection(
      [officialProgram, sectorMismatchProgram],
      {
        selections: [
          {
            programId: "P_CERT",
            priority: 1,
            eligibility: "likely",
            matchReasons: ["해외인증 시험비 지원", "현재 인증 준비 과제와 직접 연결"],
            signalIds: ["S2"],
            programEvidence: ["해외규격인증 시험비와 인증비를 지원합니다."],
            eligibilityNotes: ["세부 인증 종류가 지원 대상인지 확인"],
          },
          {
            programId: "P_FOOD",
            priority: 2,
            eligibility: "ineligible",
            matchReasons: ["제품 업종 불일치"],
            signalIds: ["S1"],
            programEvidence: ["국내 농림축산식품 제조기업"],
            eligibilityNotes: [],
          },
        ],
      },
      context,
    );

    expect(selected.map((program) => program.id)).toEqual(["P_CERT"]);
    expect(selected[0].matchReasons).toEqual([
      "해외인증 시험비 지원",
      "현재 인증 준비 과제와 직접 연결",
    ]);
    expect(selected[0].verdictEvidence).toEqual([
      "NRTL 안전인증 시험과 기술문서 준비를 우선 실행합니다.",
    ]);
    expect(selected[0].programEvidence).toEqual([
      "해외규격인증 시험비와 인증비를 지원합니다.",
    ]);
    expect(selected[0].eligibilityNotes).toContain(
      "세부 인증 종류가 지원 대상인지 확인",
    );
  });

  it("rejects unknown IDs, fabricated evidence, missing verdict links, and duplicate selections", () => {
    const applySelection = requireFunction(
      moduleApi.applyBizinfoAiSelection,
      "applyBizinfoAiSelection",
    );

    const selected = applySelection(
      [officialProgram],
      {
        selections: [
          {
            programId: "P_UNKNOWN",
            priority: 1,
            eligibility: "likely",
            matchReasons: ["존재하지 않는 사업"],
            signalIds: ["S2"],
            programEvidence: ["지원합니다."],
            eligibilityNotes: [],
          },
          {
            programId: "P_CERT",
            priority: 2,
            eligibility: "likely",
            matchReasons: ["근거 조작"],
            signalIds: ["S2"],
            programEvidence: ["반도체 기업에 현금 1억원을 지급합니다."],
            eligibilityNotes: [],
          },
          {
            programId: "P_CERT",
            priority: 3,
            eligibility: "likely",
            matchReasons: ["AI 판단 연결 없음"],
            signalIds: ["S99"],
            programEvidence: ["해외규격인증 시험비"],
            eligibilityNotes: [],
          },
          {
            programId: "P_CERT",
            priority: 4,
            eligibility: "check_required",
            matchReasons: ["공식 근거 확인"],
            signalIds: ["S2"],
            programEvidence: ["해외규격인증 시험비"],
            eligibilityNotes: ["중소기업 여부 확인"],
          },
          {
            programId: "P_CERT",
            priority: 5,
            eligibility: "likely",
            matchReasons: ["중복 선택"],
            signalIds: ["S2"],
            programEvidence: ["인증비를 지원합니다."],
            eligibilityNotes: [],
          },
        ],
      },
      context,
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: "P_CERT",
      matchReasons: ["공식 근거 확인"],
    });
  });

  it("allows the AI to return no recommendation instead of filling the list", () => {
    const applySelection = requireFunction(
      moduleApi.applyBizinfoAiSelection,
      "applyBizinfoAiSelection",
    );

    expect(
      applySelection(
        [officialProgram, sectorMismatchProgram],
        { selections: [] },
        context,
      ),
    ).toEqual([]);
  });

  it("asks Gemini for structured selections and validates its response before returning programs", async () => {
    const selectWithAi = requireFunction(
      moduleApi.selectBizinfoProgramsWithAi,
      "selectBizinfoProgramsWithAi",
    );
    let requestedUrl = "";
    let requestBody: Record<string, unknown> = {};
    let apiKeyHeader = "";
    const fetcher: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      apiKeyHeader = new Headers(init?.headers).get("x-goog-api-key") ?? "";
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                selections: [{
                  programId: "P_CERT",
                  priority: 1,
                  eligibility: "likely",
                  matchReasons: ["현재 해외인증 준비 과제와 직접 연결"],
                  signalIds: ["S2"],
                  programEvidence: ["해외규격인증 시험비"],
                  eligibilityNotes: [],
                }],
              }),
            }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const selected = await selectWithAi(
      [officialProgram],
      context,
      "server-gemini-secret",
      fetcher,
    );

    expect(requestedUrl).toContain(
      "/v1beta/models/gemini-3.5-flash:generateContent",
    );
    expect(requestedUrl).not.toContain("server-gemini-secret");
    expect(apiKeyHeader).toBe("server-gemini-secret");
    expect(requestBody).toMatchObject({
      generationConfig: {
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema: {
              type: "object",
            },
          },
        },
      },
    });
    expect(selected.map((program) => program.id)).toEqual(["P_CERT"]);
  });

  it("fails closed when Gemini cannot evaluate the official candidates", async () => {
    const selectWithAi = requireFunction(
      moduleApi.selectBizinfoProgramsWithAi,
      "selectBizinfoProgramsWithAi",
    );
    const fetcher: typeof fetch = async () =>
      new Response("provider unavailable", { status: 503 });

    await expect(
      selectWithAi(
        [officialProgram],
        context,
        "server-gemini-secret",
        fetcher,
      ),
    ).rejects.toThrow("지원사업 AI 선별 실패");
  });
});

function requireFunction<T extends (...args: never[]) => unknown>(
  value: T | undefined,
  name: string,
): T {
  expect(value, `${name} must be implemented`).toBeTypeOf("function");
  return value as T;
}

function matchedProgram(
  overrides: Partial<BizinfoProgram>,
): MatchedBizinfoProgram {
  return {
    id: "P_DEFAULT",
    title: "수출 지원사업",
    ministry: "중소벤처기업부",
    agency: "지원기관",
    category: "수출",
    target: "중소기업",
    summary: "수출 중소기업을 지원합니다.",
    applicationMethod: "온라인 접수",
    applicationUrl: "",
    detailUrl: "https://www.bizinfo.go.kr/detail/default",
    applicationPeriod: "2026-07-01 ~ 2026-08-31",
    updatedAt: "2026-07-20 09:00:00",
    hashtags: "수출,중소기업",
    applicationStatus: "open",
    applicationStatusLabel: "모집 중",
    matchReasons: [],
    verdictEvidence: [],
    eligibilityNotes: [],
    ...overrides,
  };
}
