import { describe, expect, it } from "vitest";
import {
  buildReportEvidenceHash,
  buildReportDraftFallback,
  normalizeReportDraft,
  type ReportEvidenceBundle,
} from "@/lib/report-draft";

const baseEvidence: ReportEvidenceBundle = {
  company: { companyName: "동원전기", industrialComplex: "부산", address: "부산광역시 사하구" },
  product: {
    name: "전기 콘센트",
    hsCode: "853630",
    hskCode: "8536300000",
    hsReviewRequired: true,
  },
  topCountries: [
    {
      countryCode: "CN",
      countryName: "중국",
      totalScore: 78,
      label: "검토권장",
      summary: "인증 근거 10건과 수입규제 검토 항목이 확인됨",
      evidenceSources: [
        {
          title: "중국 유아용품 수요 증가",
          country: "중국",
          summary: "유모차 제품군 관련 직접 뉴스",
          evidenceType: "direct",
        },
      ],
    },
    {
      countryCode: "US",
      countryName: "미국",
      totalScore: 74,
      label: "검토권장",
      summary: "직접 근거 일부 확인",
    },
  ],
  certs: [{ countryCode: "CN", summary: "CCC 인증" }],
  regs: [{ countryCode: "CN", summary: "반덤핑 검토" }],
  risks: [{ countryCode: "CN", category: "k_sure_payment", summary: "평균 결제기간 75.1일" }],
  safetyFlags: [{ flagType: "strategic", summary: "전략물자 연계 매칭 결과 없음" }],
  apiLogs: [{ apiKeyName: "kotra_overseas_certification", status: "success", responseCount: 10 }],
  missingEvidence: ["K-SURE 국가위험(확실한 정보 없음)", "관세청 품목별 수출입실적(미실행)"],
};

const fullCountryCautionSections = [
  {
    kind: "certification",
    title: "인증",
    facts: [
      {
        label: "인증 근거",
        value: "10건",
        meaning: "해당 제품과 관련될 가능성이 있는 인증 자료가 10건 조회되었다는 의미",
      },
    ],
    interpretation: "인증 정보가 조회되었지만 실제 제품 사양에 적용되는지는 원문 확인이 필요합니다.",
  },
  {
    kind: "regulation",
    title: "규제",
    facts: [
      {
        label: "수입규제",
        value: "적용 범위 확인 필요",
        meaning: "실제 제품이 규제 대상에 포함되는지 확인해야 한다는 의미",
      },
    ],
    interpretation: "HS 코드와 원산지 기준으로 규제 적용 여부를 확인해야 합니다.",
  },
  {
    kind: "ksure_country_risk",
    title: "K-SURE 국가위험",
    facts: [
      {
        label: "Grade",
        value: "2",
        meaning: "국가의 정치·경제·대외 지급 위험 수준이며 숫자가 낮을수록 상대적으로 안정적이라는 의미",
      },
    ],
    interpretation: "국가 차원의 거래 위험은 낮은 편이지만 인증과 결제 조건은 별도 검토가 필요합니다.",
  },
  {
    kind: "ksure_industry_risk",
    title: "K-SURE 업종위험",
    facts: [
      {
        label: "Risk Index",
        value: "4",
        meaning: "해당 업종에서 결제 지연, 부실 가능성, 업황 변동이 발생할 수 있는 정도",
      },
    ],
    interpretation: "업종위험이 존재하므로 거래처 신용도와 기존 거래 이력을 확인해야 합니다.",
  },
  {
    kind: "ksure_payment",
    title: "K-SURE 수출결제",
    facts: [
      {
        label: "Late rate",
        value: "13.8%",
        meaning: "전체 거래 중 결제가 지연된 비율",
      },
      {
        label: "Avg payment period",
        value: "75.1일",
        meaning: "평균적으로 결제까지 걸리는 기간",
      },
      {
        label: "Avg late period",
        value: "14.0일",
        meaning: "결제가 늦어졌을 때 평균적으로 지연되는 기간",
      },
      {
        label: "Top term",
        value: "O/A(T/T 포함) 79.6%",
        meaning: "가장 많이 사용된 결제 방식이며 사후 결제 구조가 많다는 의미",
      },
    ],
    interpretation: "평균 결제 기간이 짧지 않으므로 초기 거래에서는 선금, 분할 결제, 신용장 등을 검토해야 합니다.",
  },
];

describe("report draft", () => {
  it("builds a structured fallback with country strategy, phased actions, unresolved items, and cautions", () => {
    const draft = buildReportDraftFallback(baseEvidence);

    expect(draft.executiveSummary).toContain("전기 콘센트");
    expect(draft.topCountryReason).toContain("중국");
    expect(draft.countryStrategies).toHaveLength(2);
    expect(draft.countryStrategies[0]).toMatchObject({
      countryCode: "CN",
      countryName: "중국",
    });
    expect(draft.countryStrategies[0].position).toContain("검토권장");
    expect(draft.countryStrategies[0].entryMode).toContain("원문");
    expect(draft.countryStrategies[0].evidenceRefs).toContain("중국 유아용품 수요 증가");
    expect(draft.countryStrategies[0].requiredChecks.length).toBeGreaterThanOrEqual(3);
    expect(draft.actionPlan7Days.length).toBeGreaterThanOrEqual(3);
    expect(draft.actionPlan30Days.length).toBeGreaterThanOrEqual(3);
    expect(draft.actionPlan90Days.length).toBeGreaterThanOrEqual(3);
    expect(draft.unresolvedItems).toContain("관세청 품목별 수출입실적(미실행)");
    expect(draft.finalCautions.some((item) => item.includes("최종 판정"))).toBe(true);
    expect(draft.countryCautionAnalysisStatus).toBe("not_generated");
    expect(draft.countryCautionAnalyses).toEqual([]);
  });

  it("creates a one-line export decision for each country strategy", () => {
    const draft = buildReportDraftFallback(baseEvidence);

    expect(draft.countryStrategies[0].oneLineDecision).toContain("중국");
    expect(draft.countryStrategies[0].oneLineDecision).toContain("진출 가능");
    expect(draft.countryStrategies[0].oneLineDecision).toContain("직접 뉴스 근거 있음");
    expect(draft.countryStrategies[1].oneLineDecision).toContain("미국");
    expect(draft.countryStrategies[1].oneLineDecision).toContain("보류 권고");
  });

  it("normalizes partial AI output without hiding missing evidence", () => {
    const draft = normalizeReportDraft(
      {
        executiveSummary: "AI 작성 요약",
        countryStrategies: [
          {
            countryCode: "CN",
            countryName: "중국",
            position: "수요 확인",
            entryMode: "인증 확인 후 진입",
            requiredChecks: ["CCC 인증 원문 확인"],
            riskResponse: "결제조건 보수 적용",
            evidenceLimits: ["인증 최종 판정 아님"],
            evidenceRefs: ["KOTRA 인증"],
          },
        ],
        actionPlan7Days: ["HS/HSK 코드 재확인"],
      },
      baseEvidence,
    );

    expect(draft.executiveSummary).toBe("AI 작성 요약");
    expect(draft.countryStrategies[0].requiredChecks).toContain("CCC 인증 원문 확인");
    expect(draft.countryStrategies[0].position).toBe("수요 확인");
    expect(draft.countryStrategies[0].evidenceRefs).toContain("KOTRA 인증");
    expect(draft.actionPlan30Days.length).toBeGreaterThan(0);
    expect(draft.actionPlan90Days.length).toBeGreaterThan(0);
    expect(draft.unresolvedItems).toEqual(
      expect.arrayContaining(["K-SURE 국가위험(확실한 정보 없음)", "관세청 품목별 수출입실적(미실행)"]),
    );
  });

  it("normalizes Gemini country caution analyses when all fixed sections are present", () => {
    const draft = normalizeReportDraft(
      {
        countryCautionAnalysisStatus: "generated",
        countryCautionAnalyses: [
          {
            countryCode: "CN",
            countryName: "중화인민공화국(The People's Republic of China)",
            coreSummary: "중국은 인증·규제 확인과 결제조건 검토가 함께 필요한 시장입니다.",
            sections: fullCountryCautionSections,
          },
        ],
      },
      baseEvidence,
    );

    expect(draft.countryCautionAnalysisStatus).toBe("generated");
    expect(draft.countryCautionAnalyses).toHaveLength(1);
    expect(draft.countryCautionAnalyses[0].sections.map((section) => section.kind)).toEqual([
      "certification",
      "regulation",
      "ksure_country_risk",
      "ksure_industry_risk",
      "ksure_payment",
    ]);
    expect(draft.countryCautionAnalyses[0].sections[2].facts[0]).toMatchObject({
      label: "Grade",
      value: "2",
    });
    expect(JSON.stringify(draft.countryCautionAnalyses)).toContain("Late rate");
    expect(JSON.stringify(draft.countryCautionAnalyses)).not.toContain("Country: 중국 | Grade");
  });

  it("accepts AI country caution analyses even when status is omitted and section kinds use display titles", () => {
    const draft = normalizeReportDraft(
      {
        countryCautionAnalyses: [
          {
            countryCode: "US",
            countryName: "미합중국(The United States of America)",
            summary: "미국은 인증·무역규제와 결제조건을 함께 확인해야 하는 시장입니다.",
            sections: [
              { title: "인증", facts: fullCountryCautionSections[0].facts, interpretation: "인증 원문 확인이 필요합니다." },
              { title: "규제", facts: fullCountryCautionSections[1].facts, interpretation: "규제 적용 범위를 확인해야 합니다." },
              { title: "K-SURE 국가위험", facts: fullCountryCautionSections[2].facts, interpretation: "국가위험은 낮은 편입니다." },
              { title: "K-SURE 업종위험", facts: fullCountryCautionSections[3].facts, interpretation: "업종위험은 거래처별로 확인해야 합니다." },
              { title: "K-SURE 수출결제", facts: fullCountryCautionSections[4].facts, interpretation: "결제조건을 계약서에 명확히 둬야 합니다." },
            ],
          },
        ],
      },
      baseEvidence,
    );

    expect(draft.countryCautionAnalysisStatus).toBe("generated");
    expect(draft.countryCautionAnalyses[0].coreSummary).toContain("미국");
    expect(draft.countryCautionAnalyses[0].sections.map((section) => section.kind)).toEqual([
      "certification",
      "regulation",
      "ksure_country_risk",
      "ksure_industry_risk",
      "ksure_payment",
    ]);
  });

  it("does not build local country caution fallback when Gemini analysis is missing or invalid", () => {
    const draft = normalizeReportDraft(
      {
        countryCautionAnalysisStatus: "generated",
        countryCautionAnalyses: [
          {
            countryCode: "TR",
            countryName: "튀르키예공화국(Republic of Türkiye)",
            coreSummary: "위험 없음",
            sections: [],
          },
        ],
      },
      {
        ...baseEvidence,
        topCountries: [
          {
            countryCode: "TR",
            countryName: "튀르키예공화국(Republic of Türkiye)",
            totalScore: 60,
            label: "검토권장",
            summary: null,
          },
        ],
        risks: [
          {
            countryCode: "TR",
            category: "k_sure_payment",
            summary: "확실한 정보 없음",
          },
        ],
      },
    );

    expect(draft.countryCautionAnalysisStatus).toBe("not_generated");
    expect(draft.countryCautionAnalyses).toEqual([]);
    expect(JSON.stringify(draft.countryCautionAnalyses)).not.toContain("위험 없음");
  });

  it("converts legacy summary/actions into the new draft contract", () => {
    const draft = normalizeReportDraft(
      {
        summary: "기존 AI 요약",
        actions: ["7일 과제 1", "7일 과제 2"],
      },
      baseEvidence,
    );

    expect(draft.executiveSummary).toBe("기존 AI 요약");
    expect(draft.actionPlan7Days).toEqual(expect.arrayContaining(["7일 과제 1", "7일 과제 2"]));
    expect(draft.countryStrategies.length).toBeGreaterThan(0);
  });

  it("does not copy off-target news summaries into country entry strategies", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      product: {
        name: "유모차",
        hsCode: "871500",
        hskCode: "8715000000",
        hsReviewRequired: false,
      },
      topCountries: [
        {
          countryCode: "US",
          countryName: "미합중국(The United States of America)",
          totalScore: 86,
          label: "우선검토",
          summary: "미국 경제 설명 | 직접 근거: 베네수엘라, 유모차 수요 급증 | 세계 최대 프리미엄 유모차 시장 중 하나",
          evidenceSources: [
            {
              title: "베네수엘라, 유모차 수요 급증",
              country: "베네수엘라",
              summary: "대상국이 미국이 아닌 뉴스",
              evidenceType: "indirect",
            },
          ],
        },
      ],
      certs: [{ countryCode: "US", summary: "FDA(Food and Drug Administration) (Medical Device)" }],
      regs: [{ countryCode: "US", summary: "반덤핑(규제중)" }],
      risks: [{ countryCode: "US", category: "k_sure_payment", summary: "Late rate 18.9%" }],
    });

    const strategyText = [
      draft.countryStrategies[0].position,
      draft.countryStrategies[0].entryMode,
      ...draft.countryStrategies[0].requiredChecks,
      draft.countryStrategies[0].riskResponse,
      ...draft.countryStrategies[0].evidenceLimits,
      ...draft.countryStrategies[0].evidenceRefs,
    ].join(" ");

    expect(strategyText).not.toContain("베네수엘라");
    expect(strategyText).not.toContain("세계 최대 프리미엄");
    expect(strategyText).not.toContain("FDA");
    expect(draft.countryStrategies[0].evidenceLimits).toEqual(
      expect.arrayContaining(["대상국 일치 직접 뉴스 근거 없음"]),
    );
    expect(draft.countryStrategies[0].requiredChecks).toEqual(
      expect.arrayContaining(["인증 근거 1건 원문 적합성 확인"]),
    );
  });

  it("rejects direct evidence when the title mentions a different known country", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      topCountries: [
        {
          countryCode: "CN",
          countryName: "중화인민공화국(The People's Republic of China)",
          totalScore: 78,
          label: "검토권장",
          summary: null,
          evidenceSources: [
            {
              title: "데이터센터용 전기식 커넥터, AI 인프라 확산에 미국 핵심 부품 산업으로 부상",
              country: "중국",
              summary: "제목은 미국 산업을 설명함",
              evidenceType: "direct",
            },
          ],
        },
      ],
    });

    expect(draft.countryStrategies[0].evidenceRefs.join(" ")).not.toContain("미국 핵심 부품");
    expect(draft.countryStrategies[0].evidenceLimits).toEqual(
      expect.arrayContaining(["대상국 일치 직접 뉴스 근거 없음"]),
    );
  });

  it("does not expose no-evidence placeholders as evidence references", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      topCountries: [
        {
          countryCode: "DE",
          countryName: "독일연방공화국(The Federal Republic of Germany)",
          totalScore: 70,
          label: "검토권장",
          summary: null,
          evidenceSources: [
            {
              title: "직접 근거 없음 (확실한 정보 없음)",
              country: "독일",
              summary: null,
              evidenceType: "direct",
            },
          ],
        },
      ],
    });

    expect(draft.countryStrategies[0].evidenceRefs).toEqual([]);
    expect(draft.countryStrategies[0].evidenceLimits).toEqual(
      expect.arrayContaining(["대상국 일치 직접 뉴스 근거 없음"]),
    );
  });

  it("does not list selected-country background news in the rule-based report news impact analysis", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      topCountries: [
        {
          countryCode: "DE",
          countryName: "독일연방공화국(The Federal Republic of Germany)",
          totalScore: 82,
          label: "우선검토",
          summary: null,
          evidenceSources: [
            {
              title: "드론이 바꾸는 안보 환경 - 독일 안티드론 전략과 진출 기회",
              country: "독일",
              summary: "독일의 안티드론 기술 수요가 커지면서 관련 부품 공급 기회가 확대되고 있다.",
              sourceType: "country_background",
              evidenceType: "background",
              articleBody: "독일 정부는 안티드론 대응 체계를 강화하고 있으며 공항과 주요 시설 방호 수요가 커지고 있다.",
            },
          ],
        },
      ],
    });

    expect(draft.countryStrategies[0].evidenceRefs).toEqual([]);
    expect(draft.countryStrategies[0].newsImpactAnalysis).toContain("Gemini 뉴스 본문 분석 미생성");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("관련 뉴스·이슈");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("드론이 바꾸는 안보 환경");
  });

  it("does not use non-news country metadata as report news impact evidence", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      topCountries: [
        {
          countryCode: "CN",
          countryName: "중화인민공화국(The People's Republic of China)",
          totalScore: 82,
          label: "우선검토",
          summary: null,
          evidenceSources: [
            {
              title: "중화인민공화국(The People's Republic of China) country and market profile",
              country: "중화인민공화국(The People's Republic of China)",
              summary: "Country-level news and K-SURE detail deferred to Step 4",
              sourceType: "market_profile",
              evidenceType: "background",
            },
            {
              title: "Country-level news and K-SURE detail deferred to Step 4",
              country: "중화인민공화국(The People's Republic of China)",
              summary: "Run country-detail from the country detail screen to collect detailed evidence.",
              sourceType: "detail_deferred",
              evidenceType: "background",
            },
            {
              title: "2026년 1분기 중국 경제동향 및 전망",
              country: "중국",
              summary: "중국 정부 주도 투자와 수출 호조가 경기 회복세를 견인하고 있다.",
              sourceType: "country_background",
              evidenceType: "background",
            },
          ],
        },
      ],
    });

    expect(draft.countryStrategies[0].newsImpactAnalysis).toContain("Gemini 뉴스 본문 분석 미생성");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("관련 뉴스·이슈");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("2026년 1분기 중국 경제동향");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("country and market profile");
    expect(draft.countryStrategies[0].newsImpactAnalysis).not.toContain("Step 4");
  });

  it("preserves structured news impact analysis text when normalizing stored reports", () => {
    const structuredImpact =
      "핵심 판단: 디지털 채널 중심 진입이 적합합니다. 영향 근거: 온라인 구매 확대와 MZ 부모층 부상이 확인됩니다. 실행 대응: 인플루언서 마케팅, 견고한 패키징, 초기 리뷰 CS를 우선 구축하세요.";

    const draft = normalizeReportDraft({
      countryStrategies: [
        {
          countryCode: "US",
          countryName: "미국",
          feasibilityGrade: "conditional",
          position: "미국은 Top 2 검토 후보국입니다.",
          entryMode: "온라인 채널 테스트",
          entryStrategy: "아마존 중심 테스트",
          requiredChecks: ["HS/HSK 품목 분류 재확인"],
          certRegChecklist: ["인증 요구사항 확인"],
          paymentRiskAssessment: "결제조건 확인",
          riskResponse: "보수 조건 검토",
          evidenceLimits: ["인증·규제 최종 판정 아님"],
          evidenceRefs: [],
          newsImpactAnalysis: structuredImpact,
          marketOpportunity: "온라인 유통 검증 필요",
        },
      ],
    }, baseEvidence);

    expect(draft.countryStrategies[0].newsImpactAnalysis).toBe(structuredImpact);
  });

  it("uses recent customs export amount as market evidence in the country strategy", () => {
    const draft = buildReportDraftFallback({
      ...baseEvidence,
      topCountries: [
        {
          ...baseEvidence.topCountries[0],
          customsExport12mUsd: 15_300_000,
          customsExportStatus: "available",
        },
      ],
    });

    expect(draft.countryStrategies[0].position).toContain("최근 12개월");
    expect(draft.countryStrategies[0].marketOpportunity).toContain("$15.3M");
    expect(draft.countryStrategies[0].entryStrategy).toContain("수출 실적");
  });

  it("removes AI-invented cert/reg names when the evidence bundle has no confirmed rows", () => {
    const draft = normalizeReportDraft(
      {
        countryStrategies: [
          {
            countryCode: "US",
            countryName: "미합중국",
            feasibilityGrade: "go",
            position: "진입 가능",
            entryMode: "샘플 수출",
            entryStrategy: "샘플 수출 후 검증",
            requiredChecks: ["CE 인증 확인"],
            certRegChecklist: ["CE, OEKO-TEX 인증 필요", "CCC 규제 확인"],
            paymentRiskAssessment: "결제 조건 확인",
            riskResponse: "선금 조건",
            evidenceLimits: [],
            evidenceRefs: [],
            newsImpactAnalysis: "직접 뉴스 근거 없음",
            marketOpportunity: "추가 검증 필요",
          },
        ],
        countryCautionAnalyses: [
          {
            countryCode: "US",
            countryName: "미합중국",
            coreSummary: "인증과 규제 추가 검증 필요",
            sections: [
              {
                kind: "certification",
                title: "인증",
                facts: [{ label: "인증명", value: "CE, OEKO-TEX", meaning: "AI가 임의 작성한 인증명" }],
                interpretation: "CE 인증이 필요합니다.",
              },
              {
                kind: "regulation",
                title: "규제",
                facts: [{ label: "규제명", value: "CCC", meaning: "AI가 임의 작성한 규제명" }],
                interpretation: "CCC 규제가 필요합니다.",
              },
              ...fullCountryCautionSections.slice(2),
            ],
          },
        ],
      },
      {
        ...baseEvidence,
        topCountries: [
          {
            countryCode: "US",
            countryName: "미합중국",
            totalScore: 74,
            label: "검토권고",
            summary: null,
          },
        ],
        certs: [],
        regs: [],
      },
    );

    const certRegSections = draft.countryCautionAnalyses[0].sections.slice(0, 2);
    const certRegText = JSON.stringify(certRegSections);
    expect(certRegSections[0].facts[0].value).toBe("0건");
    expect(certRegSections[1].facts[0].value).toBe("0건");
    expect(certRegText).not.toContain("CE");
    expect(certRegText).not.toContain("OEKO");
    expect(certRegText).not.toContain("CCC");
    expect(draft.countryStrategies[0].certRegChecklist.join(" ")).not.toContain("CE");
  });

  it("builds a stable evidence hash and changes it when strategic evidence changes", () => {
    const first = buildReportEvidenceHash(baseEvidence);
    const same = buildReportEvidenceHash(JSON.parse(JSON.stringify(baseEvidence)));
    const changed = buildReportEvidenceHash({
      ...baseEvidence,
      topCountries: [
        {
          ...baseEvidence.topCountries[0],
          customsExport12mUsd: 32_800_000,
          customsExportStatus: "available",
        },
        ...baseEvidence.topCountries.slice(1),
      ],
    });

    expect(first).toBe(same);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^ev_[a-f0-9]{8}$/);
  });
});
