require('dotenv').config();

async function testEdgeFunction() {
  const url = process.env.VITE_SUPABASE_URL + "/functions/v1/country-detail";
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // or ANON key
  
  const payload = {
    project_id: "test_project",
    country_code: "IN",
    country_name: "인도(The Republic of India)",
    product_name: "승용차, 상용차 등",
    product_description: "자동차 부품 및 완성차",
    hs_code: "870350",
    hsk_code: "8703501000"
  };

  console.log("Calling Edge Function:", url);
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key
    },
    body: JSON.stringify(payload)
  });

  console.log("HTTP Status:", response.status);
  
  if (!response.ok) {
    const err = await response.text();
    console.log("Error body:", err);
    return;
  }

  const data = await response.json();
  console.log("Response data:", JSON.stringify(data, null, 2));
}

testEdgeFunction();
