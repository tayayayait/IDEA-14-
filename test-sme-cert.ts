import "npm:dotenv/config";
import { fetchSmeCertifications, evaluateSmeCertificationsWithAI } from "./supabase/functions/_shared/sme-cert.ts";

async function run() {
  console.log("Fetching SME certifications for USA...");
  const list = await fetchSmeCertifications("US", "미국");
  console.log(`Found ${list.length} certifications for USA`);

  if (list.length > 0) {
    console.log("Evaluating with AI for 'Automotive Parts'...");
    const aiResults = await evaluateSmeCertificationsWithAI(
      "자동차 부품",
      "내연기관 및 전기차용 브레이크 패드, 서스펜션 등 안전 부품",
      "870830",
      "미국",
      list
    );
    console.log("AI Recommendations:", JSON.stringify(aiResults, null, 2));
  }
}

run();
