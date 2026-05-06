import { describe, expect, it } from "vitest";
import {
  assessBackgroundNewsRelevance,
  assessCountryNewsMatch,
  assessNewsRelevance,
  buildExportImpactSummary,
  buildNewsRelevanceText,
  buildNewsSelectionReason,
  buildRepresentativeProductSearchTerms,
  classifyNewsForProductContext,
  buildProductRelevanceTokens,
  classifyNewsCategory,
  classifyNewsRecency,
  detectCountryCodesFromText,
  extractProductTokens,
  hasDefensibleProductExportFit,
  isWeakProductRelevanceToken,
  isCountryMentionedInText,
  marketNewsSearchParam,
  selectNewsEvidence,
  scoreNewsRelevance,
} from "../../supabase/functions/_shared/recommendation";

describe("recommendation news relevance", () => {
  it("collapses mixed vehicle model names into representative product search terms", () => {
    const rawName = "승용자동차(IG그랜저, DN8소나타, CE아이오닉6, ME아이오닉9)";
    const terms = buildRepresentativeProductSearchTerms({
      productName: rawName,
      hsCode: "870340",
      hsDescription:
        "하이브리드 자동차[불꽃점화식 내연기관과 전기모터를 모두 동력원으로 갖춘 것(승용자동차)] · 표준품명: 하이브리드 승용자동차",
    });

    expect(terms[0]).toBe("하이브리드 승용자동차");
    expect(terms).toContain("승용자동차");
    expect(terms).toContain("하이브리드 자동차");
    expect(terms).toContain("hybrid vehicle");
    expect(terms).not.toContain(rawName);
  });

  it("drops unpunctuated model and SKU lists from representative product queries", () => {
    const rawName = "IG Grandeur DN8 Sonata CE Ioniq6 ME Ioniq9 passenger car";
    const terms = buildRepresentativeProductSearchTerms({
      productName: rawName,
      hsCode: "870340",
      hsDescription: "Standard product name: hybrid passenger car",
    });

    expect(terms).toContain("hybrid vehicle");
    expect(terms).toContain("passenger car");
    expect(terms).not.toContain(rawName);
  });

  it("keeps HS signals but does not inject hardcoded product synonyms", () => {
    const tokens = buildProductRelevanceTokens("automotive brake pad", "870830", ["brake", "pad"]);

    expect(tokens).toContain("870830");
    expect(tokens).toContain("8708");
    expect(tokens).not.toContain("braking system");
  });

  it("classifies HS6 and product-keyword matched article as direct evidence", () => {
    const tokens = buildProductRelevanceTokens("industrial air filter", "842139", ["filter", "filtration", "hvac"]);
    const text = buildNewsRelevanceText({
      title: "UAE industrial filter demand rises under HS 842139",
      summary: "HVAC and air filtration suppliers expand local contracts",
    });
    const result = assessNewsRelevance({
      text,
      tokens,
      hsCode: "842139",
      productName: "industrial air filter",
    });

    expect(result.isDirectEvidence).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("does not promote semiconductor or AI trend article as direct product evidence", () => {
    const tokens = buildProductRelevanceTokens("industrial air filter", "842139", ["filter", "filtration", "hvac"]);
    const text = buildNewsRelevanceText({
      title: "US semiconductor meeting and silicon valley agentic AI trend",
      summary: "chip supply chain and AI workforce restructuring update",
    });
    const result = assessNewsRelevance({
      text,
      tokens,
      hsCode: "842139",
      productName: "industrial air filter",
    });

    expect(result.isDirectEvidence).toBe(false);
    expect(result.score).toBeLessThan(4);
  });

  it("does not classify K-Drama or K-Food article as DRAM direct evidence", () => {
    const tokens = buildProductRelevanceTokens("DRAM memory module", "854232", ["dram", "memory", "module"]);
    const text = buildNewsRelevanceText({
      title: "Germany K-Drama and K-Food showcase week opens in Berlin",
      summary: "K-culture promotion events expand tourism and retail traffic",
    });
    const result = assessNewsRelevance({
      text,
      tokens,
      hsCode: "854232",
      productName: "DRAM memory module",
    });

    expect(result.isDirectEvidence).toBe(false);
    expect(result.anchorMatchCount).toBe(0);
  });

  it("uses search2 for product-news queries and search1 for country-news queries", () => {
    expect(marketNewsSearchParam("product")).toBe("search2");
    expect(marketNewsSearchParam("country")).toBe("search1");
  });

  it("includes summary/keywords/body fields when building news relevance text", () => {
    const text = buildNewsRelevanceText({
      title: "Vietnam market watch",
      summary: "Automotive suppliers focus on braking safety",
      keywords: "brake, 870830",
      body: "<p>HS 870830 demand is growing in ASEAN.</p>",
    });

    const score = scoreNewsRelevance(text, ["brake", "automotive"], "870830");
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("does not promote broad textile-only article as direct evidence", () => {
    const tokens = buildProductRelevanceTokens("textile filter", "591190", ["textile", "filter"]);
    const text = buildNewsRelevanceText({
      title: "US apparel firms textile sourcing outlook",
      summary: "fabric procurement trend focused on garment materials",
    });
    const result = assessNewsRelevance({
      text,
      tokens,
      hsCode: "591190",
      productName: "textile filter",
    });

    expect(result.isDirectEvidence).toBe(false);
  });

  it("keeps policy and tariff article as non-direct evidence", () => {
    const tokens = buildProductRelevanceTokens("textile filter", "591190", ["textile", "filter"]);
    const text = buildNewsRelevanceText({
      title: "US tariff refund procedure after legal ruling",
      summary: "IEEPA tariff refund and compliance response guidance",
    });
    const result = assessNewsRelevance({
      text,
      tokens,
      hsCode: "591190",
      productName: "textile filter",
    });

    expect(result.isDirectEvidence).toBe(false);
  });

  it("detects country relevance from title and summary text", () => {
    const text = buildNewsRelevanceText({
      title: "Vietnam automotive demand outlook",
      summary: "KOTRA reports supplier expansion in Ho Chi Minh City",
    });

    expect(isCountryMentionedInText("VN", text)).toBe(true);
    expect(isCountryMentionedInText("DE", text)).toBe(false);
  });

  it("classifies a selected country as direct when the article source country matches", () => {
    const result = assessCountryNewsMatch({
      countryCode: "VN",
      title: "Vietnam semiconductor strategy accelerates",
      summary: "The plan expands chip cluster investment.",
      natn: "Vietnam",
      regn: "Asia",
    });

    expect(result.type).toBe("direct_country");
  });

  it("classifies a body-only selected country mention as direct when no other country is present", () => {
    const result = assessCountryNewsMatch({
      countryCode: "US",
      title: "Semiconductor equipment procurement expands",
      summary: "Chip suppliers increase local contracts.",
      body: "United States fab operators are increasing procurement of memory and semiconductor equipment.",
      natn: "",
      regn: "",
    });

    expect(result.type).toBe("direct_country");
    expect(result.reason).toBe("country:body");
  });

  it("does not promote third-country source articles to direct when only the body mentions the selected country", () => {
    const result = assessCountryNewsMatch({
      countryCode: "US",
      title: "Russia gasoline export restrictions continue",
      summary: "The government keeps fuel-market stabilization measures in place.",
      body: "The policy may affect United States fuel prices and diesel import conditions.",
      natn: "\uB7EC\uC2DC\uC544",
      regn: "Europe",
    });

    expect(result.type).toBe("background_country");
    expect(result.reason).toBe("country:source_metadata_mismatch");
  });

  it("classifies another-country article that only impacts the selected country as background", () => {
    const result = assessCountryNewsMatch({
      countryCode: "US",
      title: "Vietnam semiconductor strategy accelerates",
      summary: "Vietnam expands chip cluster investment.",
      body: "US fabless companies and AMD partnerships may affect supply chain cooperation.",
      natn: "Vietnam",
      regn: "Asia",
    });

    expect(result.type).toBe("background_country");
  });

  it("does not match another-country article when the selected country is absent", () => {
    const result = assessCountryNewsMatch({
      countryCode: "US",
      title: "Vietnam semiconductor strategy accelerates",
      summary: "Vietnam expands chip cluster investment.",
      body: "Regional suppliers are building local production capacity.",
      natn: "Vietnam",
      regn: "Asia",
    });

    expect(result.type).toBe("mismatch");
  });

  it("drops country background news when product relevance threshold is not met", () => {
    const tokens = buildProductRelevanceTokens("automotive brake pad", "870830", ["brake", "pad", "automotive"]);
    const text = buildNewsRelevanceText({
      title: "Germany labor market wage report",
      summary: "Berlin service sector confidence improved this quarter",
    });
    const result = assessBackgroundNewsRelevance({
      countryCode: "DE",
      text,
      tokens,
      hsCode: "870830",
      productName: "automotive brake pad",
    });

    expect(result.include).toBe(false);
    expect(result.scoreRelevant).toBe(false);
  });

  it("drops country background news without product anchor token match", () => {
    const tokens = buildProductRelevanceTokens("DRAM memory module", "854232", ["dram", "memory", "module"]);
    const text = buildNewsRelevanceText({
      title: "Germany labor and cultural event update",
      summary: "Berlin K-Drama and K-Food events expanded this month",
    });
    const result = assessBackgroundNewsRelevance({
      countryCode: "DE",
      text,
      tokens,
      hsCode: "854232",
      productName: "DRAM memory module",
    });

    expect(result.include).toBe(false);
    expect(result.scoreRelevant).toBe(false);
  });

  it("does not infer US country code from generic pronoun usage", () => {
    const codes = detectCountryCodesFromText("Contact us for supplier onboarding and support");
    expect(codes).not.toContain("US");
  });

  it("does not include country-background evidence when country mention mismatches", () => {
    const tokens = buildProductRelevanceTokens("industrial air filter", "842139", ["filter", "filtration"]);
    const text = buildNewsRelevanceText({
      title: "India industrial filter HS 842139 demand surge",
      summary: "Mumbai and Delhi procurement volumes expand",
    });
    const result = assessBackgroundNewsRelevance({
      countryCode: "JP",
      text,
      tokens,
      hsCode: "842139",
      productName: "industrial air filter",
    });

    expect(result.include).toBe(false);
    expect(result.countryMatched).toBe(false);
  });

  it("includes recent macro export-environment news without product anchors as background evidence", () => {
    const tokens = buildProductRelevanceTokens("industrial air filter", "842139", ["filter", "filtration"]);
    const text = buildNewsRelevanceText({
      title: "Germany exchange rate and inflation pressure import demand",
      summary: "Interest rate policy and logistics cost changes affect overseas purchasing conditions",
      keywords: "환율, 물가, 금리, 수입 수요",
    });
    const result = assessBackgroundNewsRelevance({
      countryCode: "DE",
      text,
      tokens,
      hsCode: "842139",
      productName: "industrial air filter",
      recencyTier: "recent",
    });

    expect(result.include).toBe(true);
    expect(result.scoreRelevant).toBe(false);
  });

  it("does not include non-macro culture news without product anchors", () => {
    const tokens = buildProductRelevanceTokens("industrial air filter", "842139", ["filter", "filtration"]);
    const text = buildNewsRelevanceText({
      title: "Germany K-Drama festival opens in Berlin",
      summary: "Culture events increased tourism traffic and local retail visits",
    });
    const result = assessBackgroundNewsRelevance({
      countryCode: "DE",
      text,
      tokens,
      hsCode: "842139",
      productName: "industrial air filter",
      recencyTier: "recent",
    });

    expect(result.include).toBe(false);
    expect(result.scoreRelevant).toBe(false);
  });

  it("classifies interest-rate and inflation news as macro export-environment news", () => {
    const relevance = assessNewsRelevance({
      text: "Germany interest rate inflation import demand purchasing power",
      tokens: ["filter", "filtration"],
      hsCode: "842139",
      productName: "industrial air filter",
    });
    const category = classifyNewsCategory({
      title: "Germany interest rate and inflation outlook",
      summary: "Import demand and purchasing power changed under tight monetary policy",
      keywords: "금리, 물가, 수입 수요",
      recencyTier: "recent",
      isProductDirect: false,
      relevance,
    });

    expect(category).toBe("geopolitical_risk");
  });

  it("classifies food and textile exhibition news as unrelated for DRAM", () => {
    const food = classifyNewsForProductContext({
      productName: "DRAM memory module",
      hsCode: "854232",
      title: "Vietnam HCMC food exhibition participation",
      summary: "Food supply chain, raw materials, and domestic demand trends are discussed.",
      keywords: "food, supply chain, domestic demand",
    });
    const textile = classifyNewsForProductContext({
      productName: "DRAM memory module",
      hsCode: "854232",
      title: "Vietnam textile and apparel exhibition participation",
      summary: "Textile raw material sourcing and fashion supply chain changes are highlighted.",
      keywords: "textile, apparel, raw materials, supply chain",
    });

    expect(food.category).toBe("unrelated");
    expect(textile.category).toBe("unrelated");
    expect(food.productRelevanceScore).toBeLessThan(30);
    expect(textile.productRelevanceScore).toBeLessThan(30);
  });

  it("keeps semiconductor and data-center memory news for DRAM even without exact DRAM wording", () => {
    const semiconductor = classifyNewsForProductContext({
      productName: "DRAM memory module",
      hsCode: "854232",
      title: "Vietnam semiconductor national strategy accelerates",
      summary: "Chip cluster investment and AI data center infrastructure plans expand memory demand.",
      keywords: "semiconductor, chip, AI, data center",
    });

    expect(semiconductor.category).toBe("adjacent_value_chain");
    expect(semiconductor.basis).toContain("demand_channel");
    expect(semiconductor.productRelevanceScore).toBeGreaterThanOrEqual(60);
  });

  it("keeps tariff and interest-rate news as macro export environment, not direct DRAM news", () => {
    const macro = classifyNewsForProductContext({
      productName: "DRAM memory module",
      hsCode: "854232",
      title: "Germany interest rate and tariff outlook changes import demand",
      summary: "Exchange rate pressure and logistics cost changes affect overseas purchasing conditions.",
      keywords: "interest rate, tariff, exchange rate, logistics",
    });

    expect(macro.category).toBe("broad_macro_export_env");
    expect(macro.productRelevanceScore).toBeLessThan(60);
    expect(macro.exportImpactScore).toBeGreaterThanOrEqual(60);
  });

  it("removes sentence-fragment tokens from product context extraction", () => {
    const tokens = extractProductTokens(
      "stroller",
      "구동 구조와 주요 특징을 기반으로 유통 배경을 설명",
      ["유모차", "등의", "위해"],
    );

    expect(tokens).toContain("stroller");
    expect(tokens).toContain("유모차");
    expect(tokens).not.toContain("구동");
    expect(tokens).not.toContain("구조");
    expect(tokens).not.toContain("주요");
    expect(tokens).not.toContain("특징");
    expect(tokens).not.toContain("기반");
    expect(tokens).not.toContain("유통");
    expect(tokens).not.toContain("배경");
    expect(tokens).not.toContain("등의");
    expect(tokens).not.toContain("위해");
  });

  it("keeps generic product-name words as weak tokens without using them in selection reasons", () => {
    const tokens = extractProductTokens("data storage device");

    expect(tokens).toContain("data");
    expect(isWeakProductRelevanceToken("data")).toBe(true);
    expect(isWeakProductRelevanceToken("에서")).toBe(true);
    expect(isWeakProductRelevanceToken("주요")).toBe(true);

    const reason = buildNewsSelectionReason("recent", "product_direct", {
      hs6Matched: false,
      hs4Matched: false,
      matchedStrongTokens: ["data", "storage"],
    });

    expect(reason).not.toContain("token:data");
    expect(reason).toContain("token:storage");
  });

  it("rejects food snack chip context for electronic chip products", () => {
    const result = classifyNewsForProductContext({
      productName: "memory chip",
      hsCode: "854232",
      title: "China snack market focuses on healthy potato chips and SNS",
      summary: "Healthy chips brands expand retail channels and consumer promotions.",
      keywords: "snack, potato chips, SNS",
    });

    expect(result.category).toBe("unrelated");
    expect(result.rejectReason).toMatch(/food|snack/);
  });

  it("keeps broad consumer and tariff news for strollers as defensible macro evidence", () => {
    const productName = "stroller";
    const hsCode = "871500";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["stroller", "baby", "infant"]);
    const text = buildNewsRelevanceText({
      title: "US consumers cut household spending as gasoline prices rise",
      summary: "Consumer spending, import demand, dollar pressure, and interest-rate uncertainty affect retail purchasing power.",
      keywords: "consumer spending, import demand, dollar, interest rate",
    });
    const relevance = assessNewsRelevance({ text, tokens, hsCode, productName });
    const aiAssessment = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "US consumers cut household spending as gasoline prices rise",
      summary: "Consumer spending, import demand, dollar pressure, and interest-rate uncertainty affect retail purchasing power.",
      keywords: "consumer spending, import demand, dollar, interest rate",
      tokens,
    });

    expect(aiAssessment.category).toBe("broad_macro_export_env");
    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text,
      relevance,
      aiAssessment,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(true);
  });

  it("rejects narrow unrelated industry supply-chain news for strollers", () => {
    const productName = "stroller";
    const hsCode = "871500";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["stroller", "baby", "infant"]);
    const text = buildNewsRelevanceText({
      title: "US AI data centers may move to space",
      summary: "Orbital data center plans start component supply chains for power semiconductors and satellite substrates.",
      keywords: "AI data center, supply chain, semiconductor, satellite",
    });
    const relevance = assessNewsRelevance({ text, tokens, hsCode, productName });
    const aiAssessment = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "US AI data centers may move to space",
      summary: "Orbital data center plans start component supply chains for power semiconductors and satellite substrates.",
      keywords: "AI data center, supply chain, semiconductor, satellite",
      tokens,
    });

    expect(aiAssessment.category).toBe("unrelated");
    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text,
      relevance,
      aiAssessment,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(false);
  });

  it("lets the AI final relevance decision override deterministic industry vetoes", () => {
    const productName = "industrial air filter";
    const hsCode = "842139";
    const text = buildNewsRelevanceText({
      title: "US semiconductor fab clean-room procurement expands",
      summary: "Chip manufacturers increase purchases for clean-room safety.",
      keywords: "semiconductor, clean room, procurement",
    });
    const relevance = assessNewsRelevance({
      text,
      tokens: buildProductRelevanceTokens(productName, hsCode, ["industrial", "air", "filter"]),
      hsCode,
      productName,
    });

    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text,
      relevance,
      aiAssessment: {
        category: "direct_product",
        productRelevanceScore: 90,
        countryRelevanceScore: 70,
        exportImpactScore: 60,
        basis: "product_anchor",
        rejectReason: "",
        reason: "AI final direct product decision",
      },
      recencyTier: "supplementary",
      newsCategory: "industry_trend",
    })).toBe(true);
  });

  it("uses AI macro relevance as the final export-environment gate", () => {
    const productName = "industrial air filter";
    const hsCode = "842139";
    const text = buildNewsRelevanceText({
      title: "Germany import logistics and tariff costs rise",
      summary: "Customs processing, freight cost, and exchange-rate pressure affect import purchasing conditions.",
      keywords: "customs, logistics, tariff, exchange rate",
    });
    const relevance = assessNewsRelevance({
      text,
      tokens: buildProductRelevanceTokens(productName, hsCode, ["industrial", "air", "filter"]),
      hsCode,
      productName,
    });

    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text,
      relevance,
      aiAssessment: {
        category: "broad_macro_export_env",
        productRelevanceScore: 20,
        countryRelevanceScore: 80,
        exportImpactScore: 85,
        basis: "macro",
        rejectReason: "",
        reason: "AI final macro export-environment decision",
      },
      recencyTier: "supplementary",
      newsCategory: "industry_trend",
    })).toBe(true);
  });

  it("rejects generic chemical and plastic industry news for strollers without a concrete value-chain basis", () => {
    const productName = "stroller";
    const hsCode = "871500";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["stroller", "baby", "infant"]);
    const text = buildNewsRelevanceText({
      title: "Turkey chemical industry information 2026",
      summary: "The petrochemical and plastic industries are linked to manufacturing and consumer goods broadly.",
      keywords: "chemical, plastic, manufacturing, consumer goods",
    });
    const relevance = assessNewsRelevance({ text, tokens, hsCode, productName });
    const aiAssessment = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "Turkey chemical industry information 2026",
      summary: "The petrochemical and plastic industries are linked to manufacturing and consumer goods broadly.",
      keywords: "chemical, plastic, manufacturing, consumer goods",
      tokens,
    });

    expect(aiAssessment.category).toBe("unrelated");
    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text,
      relevance,
      aiAssessment,
      recencyTier: "recent",
      newsCategory: "industry_trend",
    })).toBe(false);
  });

  it("keeps China GDP and instant-retail news as broad export-environment evidence for strollers", () => {
    const productName = "stroller";
    const hsCode = "871500";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["stroller", "baby", "infant"]);
    const gdpText = buildNewsRelevanceText({
      title: "China Q1 economic trend and outlook",
      summary: "GDP, economic growth, consumer sentiment, and domestic demand remain key market conditions.",
      keywords: "gdp, economic growth, consumer demand",
    });
    const retailText = buildNewsRelevanceText({
      title: "Instant retail becomes a new growth engine in China's retail market",
      summary: "Retail digital transformation, logistics, and consumer behavior are reshaping import demand channels.",
      keywords: "retail, consumer, logistics, import demand",
    });
    const gdpRelevance = assessNewsRelevance({ text: gdpText, tokens, hsCode, productName });
    const retailRelevance = assessNewsRelevance({ text: retailText, tokens, hsCode, productName });
    const gdpAi = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "China Q1 economic trend and outlook",
      summary: "GDP, economic growth, consumer sentiment, and domestic demand remain key market conditions.",
      keywords: "gdp, economic growth, consumer demand",
      tokens,
    });
    const retailAi = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "Instant retail becomes a new growth engine in China's retail market",
      summary: "Retail digital transformation, logistics, and consumer behavior are reshaping import demand channels.",
      keywords: "retail, consumer, logistics, import demand",
      tokens,
    });

    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text: gdpText,
      relevance: gdpRelevance,
      aiAssessment: gdpAi,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(true);
    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text: retailText,
      relevance: retailRelevance,
      aiAssessment: retailAi,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(true);
  });

  it("rejects biotech and generic export-hub news for strollers without product anchors", () => {
    const productName = "stroller";
    const hsCode = "871500";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["stroller", "baby", "infant"]);
    const biotechText = buildNewsRelevanceText({
      title: "China biopharmaceutical industry becomes a growth leader",
      summary: "Innovative drug license-out deals reached 135.7 billion dollars.",
      keywords: "biopharmaceutical, drug, license-out, dollar",
    });
    const hubText = buildNewsRelevanceText({
      title: "Tianjin port and bonded zone create new opportunities for K-consumer goods exports",
      summary: "The cross-border e-commerce hub and bonded zone support generic consumer goods entry into China.",
      keywords: "Tianjin port, bonded zone, cross-border e-commerce, logistics",
    });
    const biotechRelevance = assessNewsRelevance({ text: biotechText, tokens, hsCode, productName });
    const hubRelevance = assessNewsRelevance({ text: hubText, tokens, hsCode, productName });
    const biotechAi = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "China biopharmaceutical industry becomes a growth leader",
      summary: "Innovative drug license-out deals reached 135.7 billion dollars.",
      keywords: "biopharmaceutical, drug, license-out, dollar",
      tokens,
    });
    const hubAi = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "Tianjin port and bonded zone create new opportunities for K-consumer goods exports",
      summary: "The cross-border e-commerce hub and bonded zone support generic consumer goods entry into China.",
      keywords: "Tianjin port, bonded zone, cross-border e-commerce, logistics",
      tokens,
    });

    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text: biotechText,
      relevance: biotechRelevance,
      aiAssessment: biotechAi,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(false);
    expect(hasDefensibleProductExportFit({
      productName,
      hsCode,
      text: hubText,
      relevance: hubRelevance,
      aiAssessment: hubAi,
      recencyTier: "recent",
      newsCategory: "geopolitical_risk",
    })).toBe(false);
  });

  it("keeps cosmetics regulation and beauty-channel news but rejects biotech and data-center news", () => {
    const productName = "skin care cosmetics";
    const hsCode = "330499";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["cosmetics", "beauty", "skin care"]);
    const cosmetics = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "EU cosmetics regulation changes skin-care labeling requirements",
      summary: "Beauty retailers and cosmetics brands adjust ingredients, certification, and online channels.",
      keywords: "cosmetics, beauty, skin care, regulation, certification",
      tokens,
    });
    const biotech = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "China biopharmaceutical license-out deals expand",
      summary: "Innovative drug developers and pharma licensing transactions grew rapidly.",
      keywords: "biopharmaceutical, drug, pharma",
      tokens,
    });
    const dataCenter = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "AI data center power semiconductors draw new investment",
      summary: "Server, chip, and satellite substrate supply chains are being formed.",
      keywords: "data center, semiconductor, server",
      tokens,
    });

    expect(["direct_product", "adjacent_value_chain"]).toContain(cosmetics.category);
    expect(cosmetics.basis).toMatch(/product_family|regulation_certification|distribution_channel/);
    expect(biotech.category).toBe("unrelated");
    expect(dataCenter.category).toBe("unrelated");
  });

  it("classifies finished-product family market news as direct product evidence", () => {
    const passengerCars = classifyNewsForProductContext({
      productName: "passenger cars (IG Grandeur, DN8 Sonata, IONIQ 6, IONIQ 9)",
      hsCode: "870323",
      title: "Japan automotive market import demand rebounds",
      summary: "Vehicle sales, passenger-car consumer demand, and import certification rules are changing.",
      keywords: "automotive market, vehicle sales, import certification",
    });
    const stroller = classifyNewsForProductContext({
      productName: "stroller",
      hsCode: "871500",
      title: "Australia baby products market expands through online retail",
      summary: "Infant-care brands see stronger consumer demand and product-safety certification requirements.",
      keywords: "baby products, infant care, product safety, online retail",
    });
    const cosmetics = classifyNewsForProductContext({
      productName: "skin care cosmetics",
      hsCode: "330499",
      title: "EU cosmetics market updates beauty labeling requirements",
      summary: "Skin-care brands face new ingredient disclosure and certification expectations.",
      keywords: "cosmetics market, beauty, skin care, labeling",
    });

    expect(passengerCars.category).toBe("direct_product");
    expect(passengerCars.basis).toMatch(/product_family|hs_family/);
    expect(stroller.category).toBe("direct_product");
    expect(stroller.basis).toMatch(/product_family|hs_family/);
    expect(cosmetics.category).toBe("direct_product");
    expect(cosmetics.basis).toMatch(/product_family|hs_family/);
  });

  it("keeps broad sector news as adjacent for specific component products", () => {
    const brakePad = classifyNewsForProductContext({
      productName: "automotive brake pad",
      hsCode: "870830",
      title: "Germany automotive market shifts toward electric vehicles",
      summary: "Vehicle sales and mobility investment are changing the passenger-car supply chain.",
      keywords: "automotive market, vehicle sales, mobility",
    });
    const servoController = classifyNewsForProductContext({
      productName: "servo motor controller",
      hsCode: "853710",
      title: "Turkey industrial machinery investment expands",
      summary: "Factories increase automation equipment purchases and manufacturing-line upgrades.",
      keywords: "industrial machinery, automation equipment, facility investment",
    });

    expect(brakePad.category).toBe("adjacent_value_chain");
    expect(brakePad.basis).toContain("component");
    expect(servoController.category).toBe("adjacent_value_chain");
    expect(servoController.basis).toMatch(/component|demand_channel/);
  });

  it("keeps other narrow industries unrelated and macro news in export environment", () => {
    const strollerMedical = classifyNewsForProductContext({
      productName: "stroller",
      hsCode: "871500",
      title: "Shanghai medical device exhibition highlights hospital equipment",
      summary: "Clinical device makers discuss imaging systems, diagnostic tools, and hospital procurement.",
      keywords: "medical device, hospital equipment, clinical",
    });
    const autoTariff = classifyNewsForProductContext({
      productName: "passenger cars",
      hsCode: "870323",
      title: "US tariff and exchange-rate changes affect import demand",
      summary: "Customs policy, dollar volatility, and freight costs alter exporter payment conditions.",
      keywords: "tariff, exchange rate, customs, freight cost",
    });

    expect(strollerMedical.category).toBe("unrelated");
    expect(autoTariff.category).toBe("broad_macro_export_env");
    expect(autoTariff.basis).toBe("macro");
  });

  it("keeps machinery component signals for machinery products and rejects administrative guide news", () => {
    const productName = "servo motor controller";
    const hsCode = "853710";
    const tokens = buildProductRelevanceTokens(productName, hsCode, ["servo", "motor", "controller", "automation"]);
    const automation = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "Turkey industrial automation demand expands for servo controllers",
      summary: "Factory automation projects increase demand for motor controllers, drives, and industrial equipment.",
      keywords: "servo, motor controller, automation, industrial equipment",
      tokens,
    });
    const immigration = classifyNewsForProductContext({
      productName,
      hsCode,
      title: "Residency and immigration guide for Korean companies in Turkey",
      summary: "The consulate explains residence permits, labor permits, and visa procedures.",
      keywords: "residency, immigration, labor permit, visa",
      tokens,
    });

    expect(["direct_product", "adjacent_value_chain"]).toContain(automation.category);
    expect(immigration.category).toBe("unrelated");
  });

  it("detects metadata-style country aliases without adding unrelated countries", () => {
    const codes = detectCountryCodesFromText("natn: Japan / regn: East Asia");
    expect(codes).toContain("JP");
    expect(codes).not.toContain("CN");
    expect(codes).not.toContain("US");
  });

  it("classifies recency into recent/supplementary/archive tiers", () => {
    expect(classifyNewsRecency("2026-04-01")).toBe("recent");
    expect(classifyNewsRecency("2023-04-01")).toBe("supplementary");
    expect(classifyNewsRecency("2019-04-01")).toBe("archive");
  });

  it("keeps archive items in archive_reference category", () => {
    const relevance = assessNewsRelevance({
      text: "tariff impact on industrial filter 842139",
      tokens: ["industrial", "filter"],
      hsCode: "842139",
      productName: "industrial filter",
    });

    const category = classifyNewsCategory({
      title: "Tariff watch",
      summary: "Import tariff update",
      keywords: "tariff,customs",
      recencyTier: "archive",
      isProductDirect: false,
      relevance,
    });

    expect(category).toBe("archive_reference");
  });

  it("builds geopolitical export impact summary", () => {
    const summary = buildExportImpactSummary({
      title: "Tariff and sanction update",
      summary: "Freight cost rose after trade dispute",
      productName: "industrial filter",
      category: "geopolitical_risk",
    });
    expect(summary).toContain("Export impact");
  });

  it("selects recent first and fills with supplementary per category", () => {
    const rows = selectNewsEvidence({
      perCategoryLimit: 3,
      items: [
        { id: "r1", newsCategory: "product_direct", recencyTier: "recent", publishedAt: "2026-04-25" },
        { id: "r2", newsCategory: "product_direct", recencyTier: "recent", publishedAt: "2026-04-20" },
        { id: "s1", newsCategory: "product_direct", recencyTier: "supplementary", publishedAt: "2024-04-20" },
        { id: "a1", newsCategory: "archive_reference", recencyTier: "archive", publishedAt: "2019-04-20" },
      ],
    });

    expect(rows.productDirect.map((row) => row.id)).toEqual(["r1", "r2", "s1"]);
    expect(rows.archiveReference.map((row) => row.id)).toEqual(["a1"]);
  });

  it("builds selection reason string with recency/category", () => {
    const reason = buildNewsSelectionReason("recent", "product_direct", {
      hs6Matched: true,
      hs4Matched: false,
      matchedStrongTokens: ["filter"],
    });
    expect(reason).toContain("recent<=1y");
    expect(reason).toContain("category:product_direct");
  });
});
