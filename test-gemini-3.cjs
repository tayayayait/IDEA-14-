async function run() {
  const geminiApiKey = "AIzaSyDAd5FsWkn71ruNDlYDxj8CSBIij3aLzrQ";
  const geminiModel = "gemini-3-flash-preview";
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
    console.log(`Model ${geminiModel}:`, JSON.stringify(data, null, 2));
  } catch(e) {
    console.log(`Model ${geminiModel}:`, e.message);
  }
}
run();
