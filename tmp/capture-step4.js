const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://localhost:8080';
const PROJECT_ID = '0f1315ff-4e06-4140-bad1-b154bc03ed93';
const OUT_DIR = 'C:\\Users\\dbcdk\\.gemini\\antigravity\\brain\\f8035f8b-8d16-4f97-ba16-008a30fd9a4e';
const EMAIL = 'dbcdkwo629@naver.com';
const PASSWORD = '12341234';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
  const page = await context.newPage();

  // Login
  console.log('🔐 로그인...');
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/projects**', { timeout: 15000 });
  console.log('✅ 로그인 성공');

  // Step 4 - correct URL with country code US
  const url = `${BASE}/projects/${PROJECT_ID}/countries/US`;
  console.log(`\n📸 Step 4 - 국가 상세 (미합중국)`);
  console.log(`🔗 ${url}`);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('현재 URL:', page.url());

  // Full page screenshot
  await page.screenshot({ path: path.join(OUT_DIR, 'step4_real.png'), fullPage: true });
  console.log('✅ 풀페이지 스크린샷 저장');

  // Extract ALL data
  const data = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    
    // Get ALL text
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const s = window.getComputedStyle(p);
        if (s.display === 'none' || s.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
        if (['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode.textContent.trim());

    // Headings
    const headings = [];
    main.querySelectorAll('h1,h2,h3,h4,h5').forEach(h => {
      const t = h.textContent.trim();
      if (t) headings.push(`[${h.tagName}] ${t}`);
    });

    return {
      url: window.location.href,
      headings,
      fullText: texts.join('\n').substring(0, 8000),
      totalLen: texts.join(' ').length
    };
  });

  console.log('\n📑 제목 구조:');
  data.headings.forEach(h => console.log(`  ${h}`));
  
  console.log(`\n📏 총 텍스트: ${data.totalLen} chars`);
  console.log('\n═══ 페이지 전체 텍스트 ═══');
  console.log(data.fullText);
  console.log('═══ 끝 ═══');

  // Scroll screenshots
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  if (pageHeight > 1800) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.33));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'step4_real_mid1.png') });
    
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.66));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'step4_real_mid2.png') });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT_DIR, 'step4_real_bottom.png') });
    console.log('✅ 스크롤 스크린샷 저장');
  }

  await browser.close();
  console.log('\n🎉 Step 4 캡처 완료!');
})();
