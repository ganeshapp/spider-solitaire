#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🕷️  Spider Solitaire Browser Test\n');
  
  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Listen for console messages
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') {
      console.log('❌ Console Error:', msg.text());
    } else if (type === 'warning') {
      console.log('⚠️  Console Warning:', msg.text());
    }
  });

  // Listen for page errors
  page.on('pageerror', error => {
    console.log('❌ Page Error:', error.message);
  });

  try {
    // Step 1: Navigate to the page
    console.log('Step 1: Loading http://localhost:8080...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.screenshot({ path: path.join(screenshotsDir, '1-initial-load.png') });
    console.log('✓ Screenshot saved: 1-initial-load.png');

    // Check if modal is visible
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('modal-newgame');
      return modal && !modal.classList.contains('hidden');
    });
    console.log(`  Modal visible: ${modalVisible ? '✓ YES' : '✗ NO'}`);

    // Step 2: Click "1 Suit" button
    console.log('\nStep 2: Clicking "1 Suit" (Easy) button...');
    const buttonClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.difficulty-btn');
      for (let btn of buttons) {
        if (btn.dataset.mode === '1') {
          btn.click();
          return true;
        }
      }
      return false;
    });
    console.log(`  Button clicked: ${buttonClicked ? '✓ YES' : '✗ NO'}`);
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Take screenshot of game board
    console.log('\nStep 3: Taking screenshot of game board...');
    await page.screenshot({ path: path.join(screenshotsDir, '2-game-started.png') });
    console.log('✓ Screenshot saved: 2-game-started.png');

    // Check game state
    const gameInfo = await page.evaluate(() => {
      const columns = document.querySelectorAll('.column');
      const cards = document.querySelectorAll('.card');
      const faceUpCards = document.querySelectorAll('.card.face-up');
      const faceDownCards = document.querySelectorAll('.card.face-down');
      const moves = document.getElementById('stat-moves')?.textContent;
      const completed = document.getElementById('stat-completed')?.textContent;
      const stockCount = document.getElementById('stock-count')?.textContent;

      return {
        columnCount: columns.length,
        totalCards: cards.length,
        faceUpCards: faceUpCards.length,
        faceDownCards: faceDownCards.length,
        moves,
        completed,
        stockCount
      };
    });

    console.log('\n📊 Game State:');
    console.log(`  Columns: ${gameInfo.columnCount}`);
    console.log(`  Total cards on board: ${gameInfo.totalCards}`);
    console.log(`  Face-up cards: ${gameInfo.faceUpCards}`);
    console.log(`  Face-down cards: ${gameInfo.faceDownCards}`);
    console.log(`  ${gameInfo.moves}`);
    console.log(`  ${gameInfo.completed}`);
    console.log(`  Stock remaining: ${gameInfo.stockCount}`);

    // Step 4: Click on a face-up card
    console.log('\nStep 4: Clicking on a face-up card (smart click)...');
    const clickResult = await page.evaluate(() => {
      const faceUpCards = document.querySelectorAll('.card.face-up');
      if (faceUpCards.length > 0) {
        // Find a card that's at the bottom of a column
        for (let card of faceUpCards) {
          const col = card.dataset.col;
          const index = card.dataset.index;
          const column = document.querySelector(`.column[data-col="${col}"]`);
          const cardsInCol = column.querySelectorAll('.card');
          // Click on bottom card
          if (parseInt(index) === cardsInCol.length - 1) {
            card.click();
            return {
              success: true,
              col,
              index,
              rank: card.querySelector('.card-rank')?.textContent
            };
          }
        }
      }
      return { success: false };
    });

    if (clickResult.success) {
      console.log(`✓ Clicked card: rank ${clickResult.rank} in column ${clickResult.col}`);
    } else {
      console.log('✗ Could not find a face-up card to click');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 5: Take screenshot after click
    console.log('\nStep 5: Taking screenshot after card click...');
    await page.screenshot({ path: path.join(screenshotsDir, '3-after-click.png') });
    console.log('✓ Screenshot saved: 3-after-click.png');

    // Check if moves increased
    const newGameInfo = await page.evaluate(() => {
      return {
        moves: document.getElementById('stat-moves')?.textContent,
        completed: document.getElementById('stat-completed')?.textContent
      };
    });
    console.log(`  ${newGameInfo.moves}`);
    console.log(`  ${newGameInfo.completed}`);

    // Test hint button
    console.log('\nBonus Test: Clicking Hint button...');
    await page.click('#btn-hint');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({ path: path.join(screenshotsDir, '4-hint-active.png') });
    console.log('✓ Screenshot saved: 4-hint-active.png');

    const hintActive = await page.evaluate(() => {
      const hintSource = document.querySelector('.hint-source');
      const hintTarget = document.querySelector('.hint-target');
      return {
        hasSource: !!hintSource,
        hasTarget: !!hintTarget
      };
    });
    console.log(`  Hint highlights: source=${hintActive.hasSource ? '✓' : '✗'}, target=${hintActive.hasTarget ? '✓' : '✗'}`);

    console.log('\n✅ All tests completed!');
    console.log(`📁 Screenshots saved in: ${screenshotsDir}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
