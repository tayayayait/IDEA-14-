const k = 'AIzaSyDAd5FsWkn71ruNDlYDxj8CSBIij3aLzrQ';
const models = ['gemini-3-flash-preview', 'gemini-1.5-flash'];

async function test() {
  for (const model of models) {
    console.log(`Testing ${model}...`);
    const p = {contents:[{role:'user',parts:[{text:'Hello'}]}]};
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(p)
      });
      const data = await r.json();
      if (data.error) {
        console.log(`❌ ${model} ERROR:`, data.error.message);
      } else {
        console.log(`✅ ${model} SUCCESS`);
      }
    } catch (err) {
      console.log(`💥 ${model} FETCH FAILED:`, err.message);
    }
  }
}
test();
