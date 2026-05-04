import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("step4 source cards UI", () => {
  it("renders certification and regulation results as three source-specific cards", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).toContain('title: "KOTRA 해외인증·규격"');
    expect(source).not.toContain('title: "중소벤처기업부 해외규격인증"');
    expect(source).toContain('title: "KOTRA 수입규제·무역구제"');
    expect(source).toContain('title: "WTO ePing SPS/TBT"');
    expect(source).toContain("getCertificationSourceKind(row) === \"kotra_overseas_cert\"");
    expect(source).toContain("getRegulationSourceKind(row) === \"kotra_import_regulation\"");
    expect(source).toContain("getRegulationSourceKind(row) === \"wto_eping\"");
  });

  it("shows source-specific zero and API status copy", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Step4CountryDetail.tsx"), "utf8");

    expect(source).toContain("KOTRA 해외인증 API에서 국가·HS·제품 기준 인증 정보 없음");
    expect(source).not.toContain("중소벤처기업부 해외규격인증정보에서 제품 관련 인증 후보 없음");
    expect(source).toContain("KOTRA 수입규제·무역구제 매칭 0건");
    expect(source).toContain("직접 연관된 WTO ePing 규제 없음");
    expect(source).toContain("직접 연관");
    expect(source).toContain("연관 참고");
    expect(source).toContain("제외");
    expect(source).toContain("직접적인 규제 대상이 아닐 수 있으나");
    expect(source).toContain("WTO API 정상 조회, 연관 통보문 없음");
    expect(source).toContain("KOTRA DS00000128 API/cache와 국별 대세계 수입규제 CSV를 함께 확인했습니다");
    expect(source).toContain("키 없음");
    expect(source).toContain("API 실패");
    expect(source).toContain("API/cache 정상 조회, 매칭 0건");
  });
});
