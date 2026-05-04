import { corsHeaders } from "../_shared/cors.ts";
import { fetchCustomsTradeSummary, type FetchCustomsTradeSummaryOptions } from "../_shared/customs-trade.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { hsCode, countryCodes } = await req.json();

    if (!countryCodes || !Array.isArray(countryCodes)) {
      return new Response(JSON.stringify({ error: "Missing or invalid countryCodes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customsApiKey = Deno.env.get("PUBLIC_DATA_API_KEY");
    if (!customsApiKey) {
      return new Response(JSON.stringify({ error: "API Key missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call the shared function
    const customsTradeMap = await fetchCustomsTradeSummary(
      hsCode,
      countryCodes,
      customsApiKey,
      { concurrency: 5 } // Concurrency limit for customs API
    );

    // Convert map to plain object
    const resultObj: Record<string, any> = {};
    for (const [code, tradeResult] of customsTradeMap.entries()) {
      resultObj[code] = tradeResult;
    }

    return new Response(JSON.stringify({ data: resultObj }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
