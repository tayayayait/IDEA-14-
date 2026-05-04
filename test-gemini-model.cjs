async function run() {
  const geminiApiKey = "AIzaSyDAd5FsWkn71ruNDlYDxj8CSBIij3aLzrQ";
  const models = ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-3.0-flash"];
  for (const geminiModel of models) {
    try {
      const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        }),
      });
      const data = await response.json();
      console.log(`Model ${geminiModel}:`, data.error ? data.error.message : "Success");
    } catch(e) {
      console.log(`Model ${geminiModel}:`, e.message);
    }
  }
}
run();
