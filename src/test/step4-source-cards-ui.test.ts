import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("step4 source cards UI", () => {
  it("renders certification and KOTRA regulation source cards without the WTO ePing card", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).toContain('title: "KOTRA 해외인증·규격"');
    expect(source).not.toContain('title: "중소벤처기업부 해외규격인증"');
    expect(source).toContain('title: "KOTRA 수입규제·무역구제"');
    expect(source).not.toContain('title: "WTO ePing SPS/TBT"');
    expect(source).toContain("getCertificationSourceKind(row) === \"kotra_overseas_cert\"");
    expect(source).toContain("getRegulationSourceKind(row) === \"kotra_import_regulation\"");
    expect(source).not.toContain("getRegulationSourceKind(row) === \"wto_eping\"");
  });

  it("shows source-specific zero and API status copy", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).toContain("KOTRA 해외인증정보 API에서 현재 입력한 국가·HS Code·제품명 기준으로 직접 관련된 해외인증 정보가 확인되지 않았습니다");
    expect(source).not.toContain("중소벤처기업부 해외규격인증정보에서 제품 관련 인증 후보 없음");
    expect(source).toContain("KOTRA 수입규제·무역구제 매칭 0건");
    expect(source).not.toContain("직접 연관된 WTO ePing 규제 없음");
    expect(source).not.toContain("연관 규제 동향 참고");
    expect(source).not.toContain("직접적인 규제 대상이 아닐 수 있으나");
    expect(source).toContain("KOTRA DS00000128 API/cache와 국별 대세계 수입규제 CSV를 함께 확인했습니다");
    expect(source).toContain("키 없음");
    expect(source).toContain("API 실패");
    expect(source).toContain("API/cache 정상 조회, 매칭 0건");
  });

  it("renders KOTRA certification results as verified confirmed/review groups only", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).not.toContain("HS 미검증 대체 후보");
    expect(source).toContain("확정 인증정보");
    expect(source).toContain("검토 필요 인증정보");
    expect(source).toContain("직접 관련된 해외인증 정보가 확인되지 않았습니다");
    expect(source).not.toContain("API 원본 ");
  });

  it("renders KOTRA national info through categorized summaries and details-only raw text", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).toContain("buildNationalInfoPresentation");
    expect(source).toContain("제품 관련성 요약");
    expect(source).toContain("productContext={currentDetailContext}");
    expect(source).toContain("presentation.rawText");
    expect(source).toContain("자세히 보기");
    expect(source).not.toContain("buildNationalInfoSummary(label, text)");
    expect(source).not.toContain("<NationalInfoSection key={label} label={label} value={text} summary={summary} />");
  });
});
