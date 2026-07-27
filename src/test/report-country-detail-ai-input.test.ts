import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReportEvidenceHash,
  buildReportProgramEvidenceCatalog,
  type ReportEvidenceBundle,
} from "@/lib/report-draft";

const baseEvidence = (): ReportEvidenceBundle => ({
  company: null,
  product: {
    name: "타이어",
    hsCode: "401110",
    hskCode: "4011100000",
    hsReviewRequired: false,
  },
  topCountries: [{
    countryCode: "US",
    countryName: "미국",
    totalScore: 100,
    label: "조건부 검토",
    summary: "미국 타이어 시장을 우선 검토합니다.",
  }],
  certs: [],
  regs: [],
  risks: [],
  decisionFacts: [],
  decisionActions: [],
  safetyFlags: [],
  apiLogs: [],
  missingEvidence: [],
});

describe("report country-detail evidence for AI", () => {
  it("keeps structured market and tariff values with caveats and next actions", () => {
    const evidence = baseEvidence();
    evidence.decisionFacts = [
      {
        countryCode: "US",
        factKey: "market:un_comtrade",
        category: "market",
        status: "confirmed",
        severity: "info",
        summary: "2025년 미국의 HS 401110 수입시장과 한국산 실적을 확인했습니다.",
        value: {
          period: "2025",
          importMarketUsd: 10_512_197_922,
          importsFromKoreaUsd: 585_350_022,
          koreaSharePct: 5.57,
        },
        sourceName: "UN Comtrade",
        referenceDate: "2025",
        caveat: "단일 연도 통계입니다.",
        nextAction: "경쟁국 구성과 연도별 추이를 추가 확인하세요.",
      },
      {
        countryCode: "US",
        factKey: "tariff_fta:usitc_hts_candidates",
        category: "tariff_fta",
        status: "needs_verification",
        severity: "caution",
        summary: "미국 HTS 후보와 추가 관세 조치를 확인했습니다.",
        value: {
          candidates: [{
            htsCode: "4011.10.10.10",
            generalRate: "4%",
            specialRate: "Free (KR)",
            otherRate: "10%",
          }],
          additionalMeasures: [{ htsCode: "9903.40.05", generalRate: "25%" }],
          specificationHint: "타이어 구조와 림 직경을 확정해야 합니다.",
        },
        sourceName: "USITC Harmonized Tariff Schedule",
        referenceDate: "2026",
        caveat: "한국 HSK와 미국 HTS는 1:1로 확정되지 않습니다.",
        nextAction: "미국 현지 관세사와 최종 세번을 확인하세요.",
      },
    ];

    const catalog = buildReportProgramEvidenceCatalog(evidence);
    const market = catalog.find((item) => item.evidenceId === "P-FACT-001");
    const tariff = catalog.find((item) => item.evidenceId === "P-FACT-002");

    expect(market?.value).toContain("10512197922");
    expect(market?.value).toContain("585350022");
    expect(market?.value).toContain("5.57");
    expect(market?.value).toContain("단일 연도 통계입니다.");
    expect(market?.value).toContain("경쟁국 구성과 연도별 추이를 추가 확인하세요.");
    expect(tariff?.value).toContain("4011.10.10.10");
    expect(tariff?.value).toContain("Free (KR)");
    expect(tariff?.value).toContain("9903.40.05");
    expect(tariff?.value).toContain("미국 현지 관세사와 최종 세번을 확인하세요.");
  });

  it("adds decision-relevant certification raw fields without matching diagnostics", () => {
    const evidence = baseEvidence();
    evidence.certs = [{
      countryCode: "US",
      summary: "고무타이어 및 타이어튜브",
      sourceOrg: "KOTRA",
      raw: {
        required_docs: "FMVSS 준수 신청서",
        procedure: "OVSC 계약 시험실에서 내구성·고속성능 시험",
        validity_period: "별도 유효기간 없음",
        test_standard: "FMVSS No. 109, 119, 139",
        final_score: 98,
        input_hsk_code: "4011100000",
      },
    }];

    const cert = buildReportProgramEvidenceCatalog(evidence)
      .find((item) => item.evidenceId === "P-CERT-001");

    expect(cert?.value).toContain("FMVSS 준수 신청서");
    expect(cert?.value).toContain("OVSC 계약 시험실");
    expect(cert?.value).toContain("별도 유효기간 없음");
    expect(cert?.value).toContain("FMVSS No. 109, 119, 139");
    expect(cert?.value).not.toContain("final_score");
    expect(cert?.value).not.toContain("input_hsk_code");
  });

  it("uses the same detail serializer in the report Edge Function", () => {
    const source = readFileSync(
      join(process.cwd(), "supabase/functions/ai-report-summary/index.ts"),
      "utf8",
    );

    expect(source).toContain('from "../_shared/report-evidence-detail.ts"');
    expect(source).toContain("buildProgramEvidenceValue(row)");
  });

  it("versions the evidence hash so saved reports are regenerated with detailed evidence", () => {
    expect(buildReportEvidenceHash(baseEvidence())).toMatch(/^ev_cd2_[a-f0-9]{8}$/);
  });
});
