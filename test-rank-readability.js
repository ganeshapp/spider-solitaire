#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Taking screenshot of Spider Solitaire card ranks...\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1600,1000', '--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    // Load page
    console.log('Loading page...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle2', 
      timeout: 10000 
    });
    
    await wait(800);

    // Start a game
    console.log('Starting game...');
    await page.evaluate(() => {
      const btn = document.querySelector('.difficulty-btn[data-mode="1"]');
      if (btn) btn.click();
    });
    
    await wait(1200);

    // Take full screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'rank-readability-full.png'),
      fullPage: false 
    });
    console.log('✓ Full screenshot saved');

    // Analyze card rank readability
    const rankAnalysis = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card.face-up')).slice(0, 10);
      return cards.map((card, index) => {
        const rankEl = card.querySelector('.rank, .card-rank, text[class*="rank"]');
        const computedStyle = rankEl ? window.getComputedStyle(rankEl) : null;
        
        return {
          index,
          rank: card.textContent.trim().split('\n')[0] || 'unknown',
          fontSize: computedStyle ? computedStyle.fontSize : 'N/A',
          fontWeight: computedStyle ? computedStyle.fontWeight : 'N/A',
          color: computedStyle ? computedStyle.color : 'N/A',
          fontFamily: computedStyle ? computedStyle.fontFamily : 'N/A'
        };
      });
    });

    console.log('\n📊 Card Rank Analysis:');
    console.log('='.repeat(70));
    rankAnalysis.forEach(card => {
      console.log(`Card ${card.index}: Rank "${card.rank}"`);
      console.log(`  Font: ${card.fontSize} | Weight: ${card.fontWeight}`);
      console.log(`  Color: ${card.color}`);
    });
    console.log('='.repeat(70));

    // Take a zoomed-in screenshot of cards
    console.log('\nTaking zoomed screenshot...');
    const firstCardRect = await page.evaluate(() => {
      const card = document.querySelector('.card.face-up');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });

    if (firstCardRect) {
      // Calculate clip to show first 5 cards
      await page.screenshot({
        path: path.join(screenshotsDir, 'rank-readability-zoom.png'),
        clip: {
          x: Math.max(0, firstCardRect.x - 20),
          y: Math.max(0, firstCardRect.y - 20),
          width: Math.min(1600, firstCardRect.width * 5.5 + 40),
          height: Math.min(1000, firstCardRect.height + 40)
        }
      });
      console.log('✓ Zoomed screenshot saved');
    }

    console.log(`\n📁 Screenshots saved in: ${screenshotsDir}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
