function buildProductTokens(value) {
  const normalized = normalizeComparableText(value);
  const splitTokens = value
    .toLowerCase()
    .split(/[\s,/()|+_\-]+/g)
    .map((token) => normalizeComparableText(token))
    .filter((token) => token.length >= 2);
  return dedupeStrings([normalized, ...splitTokens]).filter((token) => token.length >= 2);
}

function normalizeComparableText(value) {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function dedupeStrings(values) {
  return [...new Set(values.filter(v => v))];
}

const raw = {
  detail_state: "success",
  ai_recommended: true,
  match_confidence: "high",
  input_country_code: "IN",
  input_country_name: "인도(The Republic of India)",
  input_product_name: "승용차, 상용차 등",
  input_hs_code: "870350",
  procedure: "테스트",
  applicable_items: "승용차, 상용차 등",
  hs_code: "870350",
  match_strategy: "ai_inference",
};

const currentProduct = "승용차, 상용차 등";
const haystack = normalizeComparableText([
  raw.product_name || "",
  raw.applicable_items || "",
  raw.subject || "",
  raw.basis_regulation || "",
  raw.raw_system_desc || "",
  raw.raw_extra || "",
].join(" "));

console.log("Tokens:", buildProductTokens(currentProduct));
console.log("Haystack:", haystack);
console.log("Match:", buildProductTokens(currentProduct).some(t => haystack.includes(t)));
