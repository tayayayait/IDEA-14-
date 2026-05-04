export type RiskLabel = "priority" | "reviewable" | "caution" | "high_risk" | "unknown" | "critical";

export interface CountryScores {
  market?: number | null;
  cert?: number | null;
  regulation?: number | null;
  payment?: number | null;
  safety?: number | null;
}

export const WEIGHTS = {
  market: 30,
  cert: 20,
  regulation: 20,
  payment: 20,
  safety: 10,
} as const;

export function totalScore(scores: CountryScores): { total: number; partial: boolean } {
  const parts: Array<[keyof typeof WEIGHTS, number | null | undefined]> = [
    ["market", scores.market],
    ["cert", scores.cert],
    ["regulation", scores.regulation],
    ["payment", scores.payment],
    ["safety", scores.safety],
  ];

  let total = 0;
  let partial = false;
  for (const [key, value] of parts) {
    if (value == null || Number.isNaN(value)) {
      partial = true;
      continue;
    }
    total += Math.min(WEIGHTS[key], Math.max(0, value));
  }

  return { total: Math.round(total), partial };
}

export function labelFromScore(total: number, partial: boolean): RiskLabel {
  if (!Number.isFinite(total)) return "critical";
  if (partial && total < 40) return "unknown";
  if (total >= 80) return "priority";
  if (total >= 60) return "reviewable";
  if (total >= 40) return "caution";
  if (total >= 0) return "high_risk";
  return "critical";
}

export const LABEL_KO: Record<RiskLabel, string> = {
  priority: "\uC6B0\uC120\uAC80\uD1A0",
  reviewable: "\uAC80\uD1A0\uAD8C\uC7A5",
  caution: "\uC8FC\uC758\uD544\uC694",
  high_risk: "\uACE0\uC704\uD5D8",
  unknown: "\uD655\uC2E4\uD55C \uC815\uBCF4 \uC5C6\uC74C",
  critical: "\uAE30\uAD00 \uD655\uC778 \uD544\uC694",
};

export const BANNED_PHRASES = [
  "\uC218\uCD9C \uAC00\uB2A5",
  "\uC218\uCD9C\uAC00\uB2A5",
  "\uC218\uCD9C \uBD88\uAC00",
  "\uC218\uCD9C\uBD88\uAC00",
  "\uC804\uB7B5\uBB3C\uC790 \uC544\uB2D8",
  "\uC778\uC99D \uC644\uB8CC \uAC00\uB2A5",
  "\uC548\uC804\uD568",
  "\uC548\uC804\uD569\uB2C8\uB2E4",
  "\uBB38\uC81C \uC5C6\uC74C",
  "\uBC95\uC801\uC73C\uB85C \uC801\uD569",
] as const;

const BANNED_PATTERNS: RegExp[] = [
  /\uC218\uCD9C\s*\uAC00\uB2A5/g,
  /\uC218\uCD9C\s*\uBD88\uAC00/g,
  /\uC804\uB7B5\uBB3C\uC790\s*\uC544\uB2D8/g,
  /\uC778\uC99D\s*\uC644\uB8CC\s*\uAC00\uB2A5/g,
  /\uC548\uC804\uD568/g,
  /\uC548\uC804\uD569\uB2C8\uB2E4/g,
  /\uBB38\uC81C\s*\uC5C6\uC74C/g,
  /\uBC95\uC801\uC73C\uB85C\s*\uC801\uD569/g,
];

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/정떎\?{3}뺣낫 \?놁쓬/g, "정확한 정보 없음"],
  [/확떎\?{3}뺣낫 \?놁쓬/g, "확실한 정보 없음"],
  [/\?몄쬆/g, "인증"],
  [/규제젣/g, "규제"],
  [/\?섏엯/g, "수입"],
  [/怨쇱젣/g, "과제"],
  [/異쒖쿂/g, "출처"],
  [/異붿쿇/g, "추천"],
  [/遺꾩꽍/g, "분석"],
  [/湲곕컲/g, "기반"],
  [/紐⑺몴\?쒖옣/g, "목표시장"],
  [/\?꾨낫援\?/g, "후보군"],
  [/\?쒗뭹/g, "제품"],
  [/\?덉쟾/g, "안전"],
  [/\?꾨왂臾쇱옄/g, "전략물자"],
  [/由ъ퐳/g, "리콜"],
  [/결곗젣/g, "결제"],
  [/\?곗씠\?\?/g, "데이터"],
  [/\?ㅽ뻾/g, "실행"],
  [/\?앹꽦/g, "생성"],
  [/\?곸꽭/g, "상세"],
  [/\?곹깭/g, "상태"],
  [/\?쒗뻾/g, "시행"],
  [/\?됯\?/g, "평가"],
  [/\?낆쥌/g, "업종"],
  [/\?꾪뿕/g, "위험"],
  [/\?ㅼ썙\?\?/g, "키워드"],
  [/\?먮Ц/g, "원문"],
  [/留곹겕/g, "링크"],
  [/\?놁쓬/g, "없음"],
  [/議고쉶/g, "조회"],
  [/결곌낵/g, "결과"],
  [/\?ㅽ뙣/g, "실패"],
  [/\?꾩슂/g, "필요"],
  [/\?꾩닔/g, "필수"],
  [/\?꾩쭅/g, "아직"],
  [/二쇱슂/g, "주요"],
  [/珥앹젏/g, "총점"],
  [/理쒖쥌/g, "최종"],
  [/\?섏쭛/g, "수집"],
  [/\?쒖옣\?{3}먯닔/g, "시장성 점수"],
  [/\?꾨낫 \?좏샇/g, "후보 신호"],
  [/\?꾨낫 \?몄엯 \?좏샇/g, "후보 편입 신호"],
  [/\?몄엯 \?ъ쑀/g, "편입 사유"],
  [/HS 6\?먮━ \?쇱튂/g, "HS 6자리 일치"],
  [/HS 4\?먮━ \?묐몢 \?쇱튂/g, "HS 4자리 접두 일치"],
  [/\?ㅼ썙\?{3}쇱튂/g, "키워드 일치"],
  [/\?낅젰/g, "입력"],
  [/\?좏샇/g, "신호"],
  [/\?먯닔/g, "점수"],
  [/\?쒖쐞/g, "순위"],
  [/\?쒖옣/g, "시장"],
  [/\?섏텧\?뺣웾/g, "수출물량"],
  [/\?먯쑀\?\?/g, "점유율 "],
  [/留ㅼ묶/g, "매칭"],
  [/\?꾩껜 \?덈ぉ/g, "전체 항목"],
  [/援\?\?/g, "국가"],
  [/\?쇰컲 諛곌꼍/g, "일반 배경"],
  [/諛곌꼍/g, "배경"],
  [/洹쇨굅/g, "근거"],
  [/吏곸젒/g, "직접"],
  [/곗젣/g, "결제"],
  [/\?섏텧 결제/g, "수출 결제"],
  [/\?덈ぉ/g, "품목"],
  [/\?쒕ぉ/g, "제목"],
  [/\?뺣낫/g, "정보"],
  [/떎\?{3}정보/g, "확실한 정보"],
  [/\?좎쭨/g, "날짜"],
  [/遺議깊/g, "부족"],
  [/\?ы븿/g, "포함"],
  [/\?섏뿀/g, "하였"],
  [/\?ъ슜/g, "사용"],
  [/硫붾え/g, "메모"],
  [/媛먯\?\?/g, "감지"],
  [/鍮꾧탳/g, "비교"],
  [/\?\?곸쑝濡/g, "대상으로"],
];

export function sanitize(text: string | null | undefined): string {
  let output = text == null ? "" : String(text);
  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  output = output.replace(/(직접 근거 \d+)\s\?\s/g, "$1건, ");
  output = output.replace(/(일반 배경 \d+)\s\?/g, "$1건");
  for (const pattern of BANNED_PATTERNS) {
    output = output.replace(pattern, "\uAC80\uD1A0 \uD544\uC694");
  }
  return output;
}

export function sanitizeNullable(text: string | null | undefined): string | null {
  if (text == null) return null;
  return sanitize(text);
}
