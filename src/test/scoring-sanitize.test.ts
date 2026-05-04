import { describe, expect, it } from "vitest";
import { sanitize } from "@/lib/scoring";

const PHRASE_EXPORTABLE = "\uC218\uCD9C \uAC00\uB2A5";
const PHRASE_LEGAL_OK = "\uBC95\uC801\uC73C\uB85C \uC801\uD569";
const PHRASE_NO_ISSUE = "\uBB38\uC81C \uC5C6\uC74C";
const PHRASE_CERT_READY = "\uC778\uC99D \uC644\uB8CC \uAC00\uB2A5";
const PHRASE_NOT_STRATEGIC = "\uC804\uB7B5\uBB3C\uC790 \uC544\uB2D8";
const REPLACEMENT = "\uAC80\uD1A0 \uD544\uC694";

describe("sanitize", () => {
  it("replaces banned certainty phrases", () => {
    const text = `\uD574\uB2F9 \uD56D\uBAA9\uC740 ${PHRASE_EXPORTABLE}\uD558\uBA70 ${PHRASE_LEGAL_OK}\uD558\uACE0 ${PHRASE_NO_ISSUE}.`;
    const sanitized = sanitize(text);

    expect(sanitized).toContain(REPLACEMENT);
    expect(sanitized).not.toContain(PHRASE_EXPORTABLE);
    expect(sanitized).not.toContain(PHRASE_LEGAL_OK);
    expect(sanitized).not.toContain(PHRASE_NO_ISSUE);
  });

  it("handles spacing variants", () => {
    const text = `\uACB0\uB860: \uC218\uCD9C   \uBD88\uAC00 / \uC778\uC99D  \uC644\uB8CC  \uAC00\uB2A5 / \uC804\uB7B5\uBB3C\uC790  \uC544\uB2D8`;
    const sanitized = sanitize(text);

    expect(sanitized).toContain(REPLACEMENT);
    expect(sanitized).not.toContain(PHRASE_CERT_READY);
    expect(sanitized).not.toContain(PHRASE_NOT_STRATEGIC);
  });

  it("keeps neutral narrative unchanged", () => {
    const text = "Need additional verification before any decision.";
    expect(sanitize(text)).toBe(text);
  });

  it("normalizes known Korean mojibake fragments", () => {
    expect(sanitize("怨쇱젣 ?앹꽦 ?ㅽ뙣")).toBe("과제 생성 실패");
    expect(sanitize("異쒖쿂 / ?먮Ц 留곹겕 ?놁쓬")).toBe("출처 / 원문 링크 없음");
    expect(sanitize("정떎???뺣낫 ?놁쓬")).toBe("정확한 정보 없음");
  });

  it("normalizes stored recommendation mojibake fragments", () => {
    const text =
      "?꾨낫 ?좏샇: HS 6?먮━ ?쇱튂. ?쒖옣???먯닔 29/30. ?섏텧?뺣웾 洹쇨굅 Rank 1, ?먯쑀??5%, HS 留ㅼ묶.   吏곸젒 洹쇨굅 2 ? 援?? ?쇰컲 諛곌꼍 1 ? K-SURE  곗젣/援???꾪뿕 ?먯닔 ?놁쓬.";

    expect(sanitize(text)).toBe(
      "후보 신호: HS 6자리 일치. 시장성 점수 29/30. 수출물량 근거 Rank 1, 점유율 5%, HS 매칭.   직접 근거 2건, 국가 일반 배경 1건 K-SURE  결제/국가위험 점수 없음.",
    );
  });

  it("returns empty string for nullish input", () => {
    expect(sanitize(undefined)).toBe("");
    expect(sanitize(null)).toBe("");
  });
});
