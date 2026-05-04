require('dotenv').config();

async function run() {
  // Step 1: Fetch SME certs for India
  const smeUrl = "https://api.odcloud.kr/api/15071380/v1/uddi:3735adc6-dbd9-4809-9836-f91f93010e63?page=1&perPage=1000&serviceKey=" + process.env.PUBLIC_DATA_API_KEY;
  const smeRes = await fetch(smeUrl);
  const smeJson = await smeRes.json();
  const inItems = smeJson.data.filter(i => (i['국가'] || '').includes('인도'));
  console.log("=== Step 1: India SME certs found:", inItems.length);
  console.log(inItems.map(c => `  - ${c['인증명']}: ${c['설명']}`).join("\n"));

  // Step 2: Call Gemini AI with CORRECT model
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  console.log("\n=== Step 2: Using model:", geminiModel);
  console.log("API Key prefix:", geminiApiKey?.slice(0, 15) + "...");

  const systemPrompt = `You are a Korean expert in international trade compliance and product certifications.
Your task is to evaluate a list of certifications for a specific country and determine which ones are likely required or applicable for the user's product.
Return ONLY a valid JSON array of objects. Do not use markdown blocks.
Schema: [ { "certName": "name", "rationale": "reasoning in Korean", "confidence": "high|medium|low" } ]
If no certifications match, return an empty array [].`;

  const certListText = inItems.map(c => `- ${c['인증명']}: ${c['설명']}`).join("\n");
  const userPrompt = `Product Details:
- Name: 승용차, 상용차 등
- Description: 자동차 부품 및 완성차
- HS Code: 870350
- Target Country: 인도(The Republic of India)

Available Certifications for 인도:
${certListText}

Analyze the product details and select the certifications from the list above that are highly likely or moderately likely to be required. Provide a clear reasoning in Korean for each matched certification.`;

  const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
  console.log("Calling:", fetchUrl.replace(geminiApiKey, "***"));

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  console.log("HTTP Status:", response.status);
  const aiData = await response.json();

  if (aiData.error) {
    console.log("❌ AI ERROR:", JSON.stringify(aiData.error, null, 2));
    return;
  }

  const textContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (textContent) {
    console.log("\n=== Step 3: AI Result (raw text):");
    console.log(textContent);
    try {
      const parsed = JSON.parse(textContent);
      console.log("\n✅ Parsed successfully:", parsed.length, "recommendations");
      parsed.forEach((r, i) => {
        console.log(`  ${i+1}. ${r.certName} [${r.confidence}] - ${r.rationale}`);
      });
    } catch (e) {
      console.log("❌ JSON Parse error:", e.message);
    }
  } else {
    console.log("❌ No text content in response:", JSON.stringify(aiData, null, 2));
  }
}

run().catch(console.error);
