#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('Loading Cardmeister website...\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1600,1000', '--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    console.log('Navigating to https://cardmeister.github.io/...');
    await page.goto('https://cardmeister.github.io/', { 
      waitUntil: 'networkidle2', 
      timeout: 20000 
    });
    
    await wait(2000);

    // Take full page screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'cardmeister-full.png'),
      fullPage: true
    });
    console.log('✓ Full page screenshot saved');

    // Take viewport screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'cardmeister-viewport.png'),
      fullPage: false
    });
    console.log('✓ Viewport screenshot saved');

    // Analyze page content
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim()),
        hasCards: document.querySelectorAll('svg').length > 0,
        svgCount: document.querySelectorAll('svg').length,
        cardImages: document.querySelectorAll('img').length,
        mainText: document.body.innerText.substring(0, 500)
      };
    });

    console.log('\n📄 Page Information:');
    console.log('='.repeat(70));
    console.log('Title:', pageInfo.title);
    console.log('SVG elements:', pageInfo.svgCount);
    console.log('Images:', pageInfo.cardImages);
    console.log('\nHeadings found:');
    pageInfo.headings.forEach(h => console.log('  -', h));
    console.log('='.repeat(70));

    console.log(`\n📁 Screenshots saved in: ${screenshotsDir}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
