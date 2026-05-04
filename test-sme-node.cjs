require('dotenv').config();

async function run() {
  const url = "https://api.odcloud.kr/api/15071380/v1/uddi:3735adc6-dbd9-4809-9836-f91f93010e63?page=1&perPage=1000&serviceKey=" + process.env.PUBLIC_DATA_API_KEY;
  const res = await fetch(url);
  const json = await res.json();
  const items = json.data;
  
  const usItems = items.filter(i => i['국가'].includes('미국'));
  console.log("Total US Certs:", usItems.length);
  
  // Any car related?
  const carItems = usItems.filter(i => 
    i['인증명'].includes('차') || i['설명'].includes('차') || 
    i['인증명'].toLowerCase().includes('car') || i['설명'].toLowerCase().includes('car') ||
    i['인증명'].includes('교통') || i['설명'].includes('교통') ||
    i['설명'].includes('DOT') || i['인증명'].includes('DOT')
  );
  
  console.log("Car related in US:", carItems);
}

run();
