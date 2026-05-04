require('dotenv').config();

async function run() {
  const url = "https://api.odcloud.kr/api/15071380/v1/uddi:3735adc6-dbd9-4809-9836-f91f93010e63?page=1&perPage=1000&serviceKey=" + process.env.PUBLIC_DATA_API_KEY;
  const res = await fetch(url);
  const json = await res.json();
  const items = json.data;
  
  const inItems = items.filter(i => i['국가'].includes('인도'));
  console.log("Total India Certs:", inItems.length);
  
  const carItems = inItems.filter(i => 
    i['인증명'].includes('차') || i['설명'].includes('차') || 
    i['인증명'].toLowerCase().includes('car') || i['설명'].toLowerCase().includes('car') ||
    i['인증명'].includes('교통') || i['설명'].includes('교통') ||
    i['인증명'].includes('ARAI') || i['설명'].includes('ARAI')
  );
  
  console.log("Car related in India:", carItems);
  console.log("All India certs:", inItems.map(c => c['인증명']).join(", "));
}

run();
