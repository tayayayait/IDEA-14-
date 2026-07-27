import { describe, expect, it } from "vitest";
import {
  fetchBizinfoPrograms,
  getBizinfoApplicationStatus,
  parseBizinfoResponse,
  selectRelevantBizinfoPrograms,
  type BizinfoProgram,
} from "../../supabase/functions/_shared/bizinfo-support";

const TODAY = "2026-07-27";

function program(overrides: Partial<BizinfoProgram> = {}): BizinfoProgram {
  return {
    id: "PBLN_1",
    title: "2026년 해외규격인증획득지원사업 참여기업 모집",
    ministry: "중소벤처기업부",
    agency: "한국화학융합시험연구원",
    category: "수출",
    target: "중소기업",
    summary: "해외규격인증의 인증비, 시험비 및 컨설팅비 일부를 지원합니다.",
    applicationMethod: "온라인 접수",
    applicationUrl: "https://example.go.kr/apply",
    detailUrl: "https://www.bizinfo.go.kr/detail/1",
    applicationPeriod: "2026-07-15 ~ 2026-08-14",
    updatedAt: "2026-07-15 15:54:54",
    hashtags: "수출,해외규격인증,중소기업",
    ...overrides,
  };
}

describe("Bizinfo official support normalization", () => {
  it("parses the live jsonArray response and strips HTML from official text", () => {
    const result = parseBizinfoResponse({
      jsonArray: [
        {
          pblancId: "PBLN_1",
          pblancNm: "해외규격인증 지원사업",
          jrsdInsttNm: "중소벤처기업부",
          excInsttNm: "한국화학융합시험연구원",
          pldirSportRealmLclasCodeNm: "수출",
          trgetNm: "중소기업",
          bsnsSumryCn: "<p>시험비의 <strong>50%~70%</strong>를 지원합니다.</p>",
          reqstMthPapersCn: "온라인 접수",
          rceptEngnHmpgUrl: "https://example.go.kr/apply",
          pblancUrl: "https://www.bizinfo.go.kr/detail/1",
          reqstBeginEndDe: "2026-07-15 ~ 2026-08-14",
          updtPnttm: "2026-07-15 15:54:54",
          hashtags: "수출,인증",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "PBLN_1",
      title: "해외규격인증 지원사업",
      summary: "시험비의 50%~70%를 지원합니다.",
      applicationPeriod: "2026-07-15 ~ 2026-08-14",
    });
  });

  it("also accepts the nested item shape shown in the provider documentation", () => {
    const result = parseBizinfoResponse({
      jsonArray: {
        item: [
          {
            pblancId: "PBLN_2",
            pblancNm: "공식 지원사업",
            pblancUrl: "https://www.bizinfo.go.kr/detail/2",
          },
        ],
      },
    });

    expect(result[0]?.id).toBe("PBLN_2");
  });
});

describe("Bizinfo official API client", () => {
  it("requests all current announcements with the server credential", async () => {
    let requestedUrl = "";
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        jsonArray: [
          {
            pblancId: "PBLN_1",
            pblancNm: "해외규격인증 지원사업",
            pblancUrl: "https://www.bizinfo.go.kr/detail/1",
          },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await fetchBizinfoPrograms("server-secret", fetcher);
    const url = new URL(requestedUrl);

    expect(url.searchParams.get("crtfcKey")).toBe("server-secret");
    expect(url.searchParams.get("dataType")).toBe("json");
    expect(url.searchParams.get("searchCnt")).toBe("0");
    expect(url.searchParams.get("searchLclasId")).toBe("04");
    expect(result[0]?.id).toBe("PBLN_1");
  });

  it("rejects provider errors instead of returning fabricated programs", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("error", { status: 503 });

    await expect(fetchBizinfoPrograms("server-secret", fetcher)).rejects.toThrow(
      "기업마당 API 호출 실패",
    );
  });
});

describe("Bizinfo application status", () => {
  it("marks a dated program open only while today is inside its application period", () => {
    expect(getBizinfoApplicationStatus("2026-07-15 ~ 2026-08-14", TODAY)).toBe("open");
    expect(getBizinfoApplicationStatus("2026-06-01 ~ 2026-06-30", TODAY)).toBe("closed");
    expect(getBizinfoApplicationStatus("2026-08-01 ~ 2026-08-31", TODAY)).toBe("upcoming");
  });

  it("does not claim that budget-limited announcements are definitely open", () => {
    expect(getBizinfoApplicationStatus("예산 소진시까지", TODAY)).toBe("check_required");
    expect(getBizinfoApplicationStatus("모집 완료시", TODAY)).toBe("check_required");
  });
});

describe("Bizinfo relevance filtering", () => {
  it("keeps nationwide regional announcements and rejects closed and product-restricted mismatches", () => {
    const selected = selectRelevantBizinfoPrograms(
      [
        program(),
        program({
          id: "PBLN_KOTRA",
          title: "해외규격인증 취득 절차 심층 컨설팅",
          ministry: "산업통상부",
          agency: "대한무역투자진흥공사",
          summary:
            "식품, 화장품, 섬유 및 의류, 유아용품을 수출 희망하는 기업을 대상으로 해외규격인증 컨설팅을 지원합니다.",
        }),
        program({
          id: "PBLN_REGION",
          title: "[강원] 해외규격인증 획득 지원사업",
          ministry: "강원특별자치도",
        }),
        program({
          id: "PBLN_CLOSED",
          title: "종료된 해외규격인증 지원사업",
          applicationPeriod: "2026-06-01 ~ 2026-06-30",
        }),
      ],
      {
        productName: "고정밀 볼베어링",
        countryName: "일본",
        companyAddress: "부산광역시 강서구",
        verdictSignals: [
          {
            source: "action",
            text: "수출 대상국의 기술규격 적합성 검증과 시험성적서를 확보합니다.",
          },
        ],
      },
      TODAY,
    );

    expect(selected.map((item) => item.id)).toEqual([
      "PBLN_1",
      "PBLN_REGION",
    ]);
    expect(selected[0]).toMatchObject({
      applicationStatus: "open",
      applicationStatusLabel: "모집 중",
    });
    expect(selected[0].matchReasons).toContain("해외규격·인증 지원");
  });

  it("returns at most three official programs and never fabricates a fallback", () => {
    const selected = selectRelevantBizinfoPrograms(
      [
        program({ id: "P1" }),
        program({ id: "P2" }),
        program({ id: "P3" }),
        program({ id: "P4" }),
      ],
      {
        productName: "볼베어링",
        countryName: "일본",
        companyAddress: "부산광역시",
        verdictSignals: [
          { source: "action", text: "해외규격인증 시험을 준비합니다." },
        ],
      },
      TODAY,
    );

    expect(selected).toHaveLength(3);
    expect(
      selectRelevantBizinfoPrograms([], {
        productName: "볼베어링",
        countryName: "일본",
        companyAddress: "부산광역시",
        verdictSignals: [
          { source: "action", text: "해외규격인증 시험을 준비합니다." },
        ],
      }, TODAY),
    ).toEqual([]);
  });

  it("does not mistake buyer credit checks for trade-show or buyer-discovery support", () => {
    const selected = selectRelevantBizinfoPrograms(
      [
        program(),
        program({
          id: "P_EXHIBITION",
          title: "2026년 일본 국제 전시회 참가기업 모집",
          summary: "해외 전시회 참가와 현지 바이어 상담을 지원합니다.",
          hashtags: "전시회,바이어,해외마케팅",
        }),
        program({
          id: "P_IP_GUARANTEE",
          title: "소프트웨어 지식재산권 평가보증 지원사업",
          summary: "소프트웨어 지식재산권의 기술가치 평가와 보증을 지원합니다.",
          hashtags: "소프트웨어,지식재산,보증",
        }),
      ],
      {
        productName: "고정밀 볼베어링",
        countryName: "일본",
        companyAddress: "부산광역시",
        verdictSignals: [
          {
            source: "action",
            text: "기술규격 적합성 검증 및 시험성적서를 확보합니다.",
          },
          {
            source: "action",
            text: "무역보험 가입 및 거래처 신용조사를 실시합니다.",
          },
        ],
      },
      TODAY,
    );

    expect(selected.map((item) => item.id)).toEqual(["PBLN_1"]);
  });

  it("uses AI verdict risks and actions as the primary relevance evidence across products and countries", () => {
    const paymentAction =
      "외상거래 전에 수출보험 가입과 해외 거래처 신용조사를 실시합니다.";
    const selected = selectRelevantBizinfoPrograms(
      [
        program(),
        program({
          id: "P_INSURANCE",
          title: "단기수출보험 및 수출채권 회수 지원사업",
          agency: "공공 수출신용기관",
          summary: "수출보험, 신용조사 및 대금회수 서비스를 지원합니다.",
          hashtags: "수출보험,신용조사,대금회수",
        }),
        program({
          id: "P_MARKET",
          title: "해외 전시회 및 바이어 발굴 지원사업",
          summary: "해외 전시회 참가와 바이어 상담을 지원합니다.",
          hashtags: "전시회,바이어,해외마케팅",
        }),
      ],
      {
        productName: "산업용 펌프",
        countryName: "독일",
        companyAddress: "경기도 화성시",
        verdictSignals: [
          {
            source: "risk",
            text: "외상 결제 조건에 따른 수출대금 미회수 위험이 있습니다.",
          },
          { source: "action", text: paymentAction },
        ],
      },
      TODAY,
    );

    expect(selected.map((item) => item.id)).toEqual(["P_INSURANCE"]);
    expect(selected[0].matchReasons).toContain("무역보험·대금회수 지원");
    expect(selected[0].verdictEvidence).toContain(paymentAction);
  });

  it("does not recommend a program from product or country similarity without a matching AI verdict need", () => {
    const selected = selectRelevantBizinfoPrograms(
      [
        program({
          title: "독일 산업재 해외규격인증 지원사업",
          summary: "산업용 펌프의 해외규격인증 비용을 지원합니다.",
        }),
      ],
      {
        productName: "산업용 펌프",
        countryName: "독일",
        companyAddress: "경기도 화성시",
        verdictSignals: [
          {
            source: "summary",
            text: "시장 수요가 안정적이며 별도의 지원과제는 확인되지 않았습니다.",
          },
        ],
      },
      TODAY,
    );

    expect(selected).toEqual([]);
  });

  it.each([
    {
      expected: "해외규격·인증 지원",
      signal: "필수 제품인증과 공인 시험성적서 확보가 필요합니다.",
      title: "해외규격인증 및 제품시험 지원사업",
      summary: "해외인증 획득과 시험비를 지원합니다.",
    },
    {
      expected: "무역보험·대금회수 지원",
      signal: "외상 결제에 대비해 수출보험과 신용조사가 필요합니다.",
      title: "수출보험 및 거래처 신용조사 지원",
      summary: "무역보험과 대금회수 서비스를 지원합니다.",
    },
    {
      expected: "FTA·통관·수출통제 지원",
      signal: "FTA 원산지 증명과 수출통관 절차를 사전에 검토해야 합니다.",
      title: "FTA 원산지 및 수출통관 컨설팅",
      summary: "원산지증명과 관세·통관 상담을 지원합니다.",
    },
    {
      expected: "해외시장·바이어 발굴 지원",
      signal: "현지 유통망 구축과 신규 바이어 발굴이 필요합니다.",
      title: "해외 바이어 발굴 및 수출상담 지원",
      summary: "해외마케팅과 바이어 상담을 지원합니다.",
    },
    {
      expected: "수출바우처·사업화 지원",
      signal: "수출 사업화와 해외진출 홍보자료 준비가 필요합니다.",
      title: "중소기업 수출바우처 지원사업",
      summary: "해외진출과 수출사업화 서비스를 지원합니다.",
    },
    {
      expected: "물류·운송 지원",
      signal: "국제운송과 선적 과정의 물류비 부담을 줄여야 합니다.",
      title: "중소기업 수출물류비 지원사업",
      summary: "국제운송과 선적 비용을 지원합니다.",
    },
    {
      expected: "수출금융 지원",
      signal: "수출 생산자금 조달과 운전자금 확보가 필요합니다.",
      title: "수출기업 정책자금 융자사업",
      summary: "수출금융과 운전자금 융자를 지원합니다.",
    },
    {
      expected: "법률·지식재산권 지원",
      signal: "해외 상표권 침해와 수출계약 분쟁에 대비해야 합니다.",
      title: "해외 지식재산권 및 수출계약 법률 지원",
      summary: "상표·특허 보호와 법률상담을 지원합니다.",
    },
  ])("classifies common export support needs without product-specific rules: $expected", ({
    expected,
    signal,
    title,
    summary,
  }) => {
    const selected = selectRelevantBizinfoPrograms(
      [
        program({
          id: `P_${expected}`,
          title,
          summary,
          hashtags: "",
        }),
      ],
      {
        productName: "범용 제조제품",
        countryName: "해외시장",
        companyAddress: "서울특별시",
        verdictSignals: [{ source: "action", text: signal }],
      },
      TODAY,
    );

    expect(selected[0]?.matchReasons).toContain(expected);
    expect(selected[0]?.verdictEvidence).toContain(signal);
  });
});
