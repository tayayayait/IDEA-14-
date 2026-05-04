require('dotenv').config();

async function run() {
  const url = "https://api.odcloud.kr/api/15071380/v1/uddi:3735adc6-dbd9-4809-9836-f91f93010e63?page=1&perPage=1000&serviceKey=" + process.env.PUBLIC_DATA_API_KEY;
  const res = await fetch(url);
  const json = await res.json();
  const items = json.data;
  const usItems = items.filter(i => i['국가'].includes('미국'));

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const systemPrompt = `You are a Korean expert in international trade compliance and product certifications.
Your task is to evaluate a list of certifications for a specific country and determine which ones are likely required or applicable for the user's product.
Return ONLY a valid JSON array of objects. Do not use markdown blocks.
Schema: [ { "certName": "name", "rationale": "reasoning in Korean", "confidence": "high|medium|low" } ]
If no certifications match, return an empty array [].`;

  const certListText = usItems.map(c => `- ${c['인증명']}: ${c['설명']}`).join("\n");

  const userPrompt = `Product Details:
- Name: 승용차, 상용차 등
- Description: 자동차 부품 및 완성차
- HS Code: 870350
- Target Country: 미국

Available Certifications for 미국:
${certListText}

Analyze the product details and select the certifications from the list above that are highly likely or moderately likely to be required. Provide a clear reasoning in Korean for each matched certification.`;

  const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
  const response = await fetch(fetchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const aiData = await response.json();
  console.log("AI Response:", JSON.stringify(aiData, null, 2));
}

run();
