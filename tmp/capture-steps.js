const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const PROJECT_ID = '0f1315ff-4e06-4140-bad1-b154bc03ed93';
const OUT_DIR = 'C:\\Users\\dbcdk\\.gemini\\antigravity\\brain\\f8035f8b-8d16-4f97-ba16-008a30fd9a4e';

const EMAIL = 'dbcdkwo629@naver.com';
const PASSWORD = '12341234';

const STEPS = [
  { name: 'step1_real', path: '/company', label: 'Step 1 - 기업·공장 검색' },
  { name: 'step2_real', path: '/product', label: 'Step 2 - 제품·HS 코드' },
  { name: 'step3_real', path: '/countries', label: 'Step 3 - 후보국 추천 Top 3' },
  { name: 'step4_real', path: '/country-detail', label: 'Step 4 - 국가 상세' },
  { name: 'step5_real', path: '/report', label: 'Step 5 - 리포트' },
];

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // ─── 1. 로그인 ───
  console.log('🔐 로그인 시작...');
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('  Auth page URL:', page.url());

  // Fill login form
  await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="이메일"], input[placeholder*="email"]', { timeout: 10000 });
  
  // Clear and fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.fill(EMAIL);
  
  // Clear and fill password
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(PASSWORD);
  
  // Click login button
  const loginBtn = page.locator('button[type="submit"]').first();
  await loginBtn.click();
  
  // Wait for redirect
  try {
    await page.waitForURL('**/projects**', { timeout: 15000 });
    console.log('✅ 로그인 성공! URL:', page.url());
  } catch (e) {
    console.log('⚠️ 로그인 후 현재 URL:', page.url());
    // Take screenshot of current state
    await page.screenshot({ path: path.join(OUT_DIR, 'login_state.png') });
  }

  // ─── 2. 각 단계별 페이지 캡처 ───
  for (const step of STEPS) {
    const url = `${BASE}/projects/${PROJECT_ID}${step.path}`;
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📸 ${step.label}`);
    console.log(`🔗 ${url}`);
    console.log('═'.repeat(70));

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for content to render
      await page.waitForTimeout(4000);
      
      console.log('  현재 URL:', page.url());

      // Check if redirected to auth
      if (page.url().includes('/auth')) {
        console.log('  ❌ 인증 페이지로 리디렉트됨');
        continue;
      }

      // Take full page screenshot
      const screenshotPath = path.join(OUT_DIR, `${step.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ✅ 풀페이지 스크린샷 저장: ${step.name}.png`);

      // Extract ALL visible data
      const data = await page.evaluate(() => {
        // ── 모든 텍스트 노드에서 실제 데이터 추출 ──
        const getAllVisibleText = (root) => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return NodeFilter.FILTER_REJECT;
              if (['SCRIPT','STYLE','NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
              return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          });
          const texts = [];
          while (walker.nextNode()) texts.push(walker.currentNode.textContent.trim());
          return texts;
        };

        const main = document.querySelector('main') || document.body;
        const allTexts = getAllVisibleText(main);

        // 제목 추출
        const headings = [];
        main.querySelectorAll('h1,h2,h3,h4,h5').forEach(h => {
          const t = h.textContent.trim();
          if (t) headings.push(`[${h.tagName}] ${t}`);
        });

        // 입력 필드의 실제 값
        const inputValues = [];
        main.querySelectorAll('input, textarea, select').forEach(el => {
          const val = el.value || '';
          if (!val) return;
          let label = '';
          // Try aria-label
          label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
          // Try closest label
          if (!label) {
            const labelEl = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
            if (labelEl) label = labelEl.textContent.trim().split('\n')[0];
          }
          // Try preceding sibling or parent label
          if (!label) {
            const prev = el.previousElementSibling;
            if (prev && prev.tagName === 'LABEL') label = prev.textContent.trim();
          }
          inputValues.push({ label: label.substring(0, 80), value: val.substring(0, 500) });
        });

        // 배지/태그
        const badges = new Set();
        main.querySelectorAll('[class*="badge"],[class*="Badge"],[class*="chip"],[class*="tag"],[class*="pill"]').forEach(el => {
          const t = el.textContent.trim();
          if (t && t.length < 80) badges.add(t);
        });

        // 테이블 데이터
        const tables = [];
        main.querySelectorAll('table').forEach(table => {
          const headers = [];
          table.querySelectorAll('thead th, thead td').forEach(th => headers.push(th.textContent.trim()));
          const rows = [];
          table.querySelectorAll('tbody tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td').forEach(td => cells.push(td.textContent.trim().substring(0, 200)));
            if (cells.length && cells.some(c => c)) rows.push(cells);
          });
          if (headers.length || rows.length) tables.push({ headers, rows: rows.slice(0, 15) });
        });

        // 카드 제목과 내용
        const cards = [];
        main.querySelectorAll('[class*="Card"],[class*="card"]').forEach(card => {
          const title = card.querySelector('[class*="Title"],[class*="title"],h2,h3,h4');
          if (!title) return;
          const titleText = title.textContent.trim();
          if (!titleText || titleText.length > 200) return;
          // Get the direct text content of the card (not nested cards)
          let contentText = '';
          const contentEl = card.querySelector('[class*="Content"],[class*="content"]');
          if (contentEl) {
            contentText = contentEl.textContent.trim().substring(0, 600);
          }
          cards.push({ title: titleText, content: contentText });
        });

        // 버튼 텍스트
        const buttons = [];
        main.querySelectorAll('button').forEach(btn => {
          const t = btn.textContent.trim();
          if (t && t.length < 60) buttons.push(t);
        });

        return {
          url: window.location.href,
          title: document.title,
          headings,
          inputValues,
          badges: [...badges],
          tables,
          cards: cards.slice(0, 30),
          buttons: [...new Set(buttons)].slice(0, 20),
          totalTextLength: allTexts.join(' ').length,
          fullText: allTexts.join('\n').substring(0, 8000)
        };
      });

      // Print results
      console.log(`\n  📄 Page Title: ${data.title}`);
      console.log(`  🔗 URL: ${data.url}`);

      if (data.headings.length) {
        console.log('\n  📑 제목 구조:');
        data.headings.forEach(h => console.log(`    ${h}`));
      }

      if (data.inputValues.length) {
        console.log('\n  📝 입력된 실제 값:');
        data.inputValues.forEach(i => console.log(`    [${i.label}] → "${i.value}"`));
      }

      if (data.badges.length) {
        console.log('\n  🏷️ 배지/태그:');
        data.badges.forEach(b => console.log(`    • ${b}`));
      }

      if (data.tables.length) {
        console.log('\n  📊 테이블 데이터:');
        data.tables.forEach((t, idx) => {
          console.log(`    [Table ${idx + 1}]`);
          if (t.headers.length) console.log(`    Headers: ${t.headers.join(' | ')}`);
          t.rows.forEach((r, ri) => console.log(`    Row ${ri + 1}: ${r.join(' | ')}`));
        });
      }

      if (data.cards.length) {
        console.log('\n  🃏 카드 섹션:');
        data.cards.forEach(c => {
          console.log(`    ▸ ${c.title}`);
          if (c.content && c.content.length > 5) {
            // Truncate long content
            const preview = c.content.substring(0, 300).replace(/\n/g, ' ').replace(/\s+/g, ' ');
            console.log(`      ${preview}`);
          }
        });
      }

      if (data.buttons.length) {
        console.log('\n  🔘 버튼:');
        data.buttons.forEach(b => console.log(`    [${b}]`));
      }

      console.log(`\n  📏 총 텍스트: ${data.totalTextLength} chars`);

      // Also print raw text for detailed analysis
      console.log('\n  ═══ 페이지 전체 텍스트 (처음 4000자) ═══');
      console.log(data.fullText.substring(0, 4000));
      console.log('  ═══ 끝 ═══');

      // Scroll and capture additional screenshots if page is long
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      const viewportHeight = 900;
      if (pageHeight > viewportHeight * 2) {
        // Capture middle
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT_DIR, `${step.name}_mid.png`) });
        console.log(`  ✅ 중간 스크린샷: ${step.name}_mid.png`);
        
        // Capture bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT_DIR, `${step.name}_bottom.png`) });
        console.log(`  ✅ 하단 스크린샷: ${step.name}_bottom.png`);
      }

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      await page.screenshot({ path: path.join(OUT_DIR, `${step.name}_error.png`) }).catch(() => {});
    }
  }

  await browser.close();
  console.log('\n🎉 모든 단계 캡처 완료!');
})();
