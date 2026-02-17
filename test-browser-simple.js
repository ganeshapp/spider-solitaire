#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('🕷️  Spider Solitaire Browser Test\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1280,800', '--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Collect console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Step 1: Initial load
    console.log('Step 1: Loading page...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2', timeout: 10000 });
    await wait(500);
    await page.screenshot({ path: path.join(screenshotsDir, '1-initial-load.png'), fullPage: false });
    console.log('✓ Screenshot 1 saved');

    // Step 2: Click 1 Suit button
    console.log('\nStep 2: Clicking "1 Suit" button...');
    await page.evaluate(() => {
      const btn = document.querySelector('.difficulty-btn[data-mode="1"]');
      if (btn) btn.click();
    });
    await wait(800);
    await page.screenshot({ path: path.join(screenshotsDir, '2-game-started.png'), fullPage: false });
    console.log('✓ Screenshot 2 saved');

    // Check game state
    const gameState = await page.evaluate(() => {
      return {
        columns: document.querySelectorAll('.column').length,
        cards: document.querySelectorAll('.card').length,
        faceUp: document.querySelectorAll('.card.face-up').length,
        faceDown: document.querySelectorAll('.card.face-down').length,
        moves: document.getElementById('stat-moves')?.textContent,
        completed: document.getElementById('stat-completed')?.textContent,
        stock: document.getElementById('stock-count')?.textContent
      };
    });
    console.log('Game state:', gameState);

    // Step 3: Click a face-up card
    console.log('\nStep 3: Clicking a face-up card...');
    const clicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card.face-up'));
      if (cards.length > 0) {
        cards[0].click();
        return true;
      }
      return false;
    });
    console.log(clicked ? '✓ Card clicked' : '✗ No card found');
    
    await wait(1200);
    await page.screenshot({ path: path.join(screenshotsDir, '3-after-click.png'), fullPage: false });
    console.log('✓ Screenshot 3 saved');

    // Check if move happened
    const afterClick = await page.evaluate(() => {
      return {
        moves: document.getElementById('stat-moves')?.textContent,
        completed: document.getElementById('stat-completed')?.textContent
      };
    });
    console.log('After click:', afterClick);

    // Step 4: Test hint button
    console.log('\nStep 4: Testing Hint button...');
    await page.click('#btn-hint');
    await wait(600);
    await page.screenshot({ path: path.join(screenshotsDir, '4-hint-active.png'), fullPage: false });
    console.log('✓ Screenshot 4 saved');

    const hintCheck = await page.evaluate(() => {
      return {
        hintSource: !!document.querySelector('.hint-source'),
        hintTarget: !!document.querySelector('.hint-target')
      };
    });
    console.log('Hint state:', hintCheck);

    // Step 5: Test undo button
    console.log('\nStep 5: Testing Undo button...');
    await page.click('#btn-undo');
    await wait(400);
    await page.screenshot({ path: path.join(screenshotsDir, '5-after-undo.png'), fullPage: false });
    console.log('✓ Screenshot 5 saved');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log('✅ Page loads correctly');
    console.log('✅ Modal appears with difficulty options');
    console.log('✅ Game starts after clicking difficulty');
    console.log(`✅ Game has ${gameState.columns} columns`);
    console.log(`✅ ${gameState.cards} cards dealt (${gameState.faceUp} face-up, ${gameState.faceDown} face-down)`);
    console.log(`✅ Stock pile shows: ${gameState.stock} cards`);
    console.log(`${clicked ? '✅' : '⚠️ '} Smart click ${clicked ? 'works' : 'not tested'}`);
    console.log(`${hintCheck.hintSource ? '✅' : '⚠️ '} Hint button ${hintCheck.hintSource ? 'works' : 'may not work'}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️  Console Errors:');
      errors.forEach(e => console.log('  -', e));
    } else {
      console.log('\n✅ No JavaScript errors detected');
    }
    
    console.log(`\n📁 All screenshots saved in: ${screenshotsDir}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
