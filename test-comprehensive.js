#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('🕷️  Spider Solitaire - Comprehensive Visual Test\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1400,900', '--no-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const errors = [];
    const warnings = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        errors.push(text);
        console.log('❌ Console Error:', text);
      } else if (msg.type() === 'warning') {
        warnings.push(text);
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
      console.log('❌ Page Error:', error.message);
    });

    // Step 1: Initial page load
    console.log('Step 1: Loading page and capturing initial modal...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2', timeout: 10000 });
    await wait(800);
    await page.screenshot({ path: path.join(screenshotsDir, '01-initial-modal.png'), fullPage: false });
    console.log('✓ Screenshot 1: Initial modal\n');

    // Step 2: Click 1 Suit difficulty
    console.log('Step 2: Starting 1-Suit game...');
    await page.evaluate(() => {
      const btn = document.querySelector('.difficulty-btn[data-mode="1"]');
      if (btn) btn.click();
    });
    await wait(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-game-board.png'), fullPage: false });
    console.log('✓ Screenshot 2: Game board\n');

    // Detailed inspection of the game board
    console.log('Analyzing game board structure...');
    const boardAnalysis = await page.evaluate(() => {
      const results = {
        layout: {},
        cards: {},
        foundation: {},
        issues: []
      };

      // Check header
      const header = document.querySelector('header');
      results.layout.hasHeader = !!header;
      results.layout.headerHeight = header ? header.offsetHeight + 'px' : 'N/A';

      // Check foundation bar location
      const completedArea = document.getElementById('completed-area');
      const stockPile = document.getElementById('stock-pile');
      
      if (completedArea && stockPile) {
        const completedRect = completedArea.getBoundingClientRect();
        const stockRect = stockPile.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        
        results.foundation.completedTop = Math.round(completedRect.top);
        results.foundation.stockTop = Math.round(stockRect.top);
        results.foundation.headerBottom = Math.round(headerRect.bottom);
        results.foundation.isAtTop = completedRect.top < 150; // Should be near top
        results.foundation.isInBottomBar = completedRect.top > 700; // Should NOT be at bottom
        
        if (results.foundation.isInBottomBar) {
          results.issues.push('❌ Foundation bar is at BOTTOM instead of TOP');
        } else if (results.foundation.isAtTop) {
          results.issues.push('✓ Foundation bar is correctly positioned near TOP');
        }
      } else {
        results.issues.push('❌ Foundation elements not found');
      }

      // Check tableau position
      const tableau = document.getElementById('tableau');
      if (tableau) {
        const tableauRect = tableau.getBoundingClientRect();
        results.layout.tableauTop = Math.round(tableauRect.top);
        results.layout.tableauHeight = Math.round(tableauRect.height);
      }

      // Check card structure
      const sampleCard = document.querySelector('.card.face-up');
      if (sampleCard) {
        const innerHTML = sampleCard.innerHTML;
        
        // Check for SVG vs Unicode
        results.cards.usesSVG = innerHTML.includes('<svg');
        results.cards.usesUnicode = innerHTML.includes('♠') || innerHTML.includes('♥') || 
                                    innerHTML.includes('♦') || innerHTML.includes('♣');
        
        // Check for pip layout elements
        results.cards.hasPipLayout = innerHTML.includes('pip') || innerHTML.includes('card-pips');
        
        // Check card structure
        results.cards.hasCardInner = innerHTML.includes('card-inner');
        results.cards.hasCorners = innerHTML.includes('card-corner');
        results.cards.hasCenterSuit = innerHTML.includes('card-center-suit');
        
        // Get rank and suit info
        const rankEl = sampleCard.querySelector('.card-rank');
        const suitEl = sampleCard.querySelector('.card-suit-small');
        results.cards.sampleRank = rankEl ? rankEl.textContent : 'N/A';
        results.cards.sampleSuit = suitEl ? suitEl.textContent : 'N/A';
        
        if (results.cards.usesUnicode && !results.cards.usesSVG) {
          results.issues.push('⚠️  Cards use Unicode symbols, not SVG');
        }
        if (!results.cards.hasPipLayout) {
          results.issues.push('⚠️  Cards do not have pip layouts');
        }
      } else {
        results.issues.push('❌ No face-up cards found for inspection');
      }

      // Count columns
      const columns = document.querySelectorAll('.column');
      results.layout.columnCount = columns.length;
      if (columns.length !== 10) {
        results.issues.push(`❌ Expected 10 columns, found ${columns.length}`);
      }

      // Check stats button
      const statsBtn = document.querySelector('#btn-hint') || 
                       document.querySelector('[title*="stat"]') ||
                       document.querySelector('button[class*="chart"]');
      results.layout.hasStatsButton = !!statsBtn;
      if (!statsBtn) {
        results.issues.push('⚠️  Stats/chart button not found in header');
      }

      return results;
    });

    console.log('\n📊 Board Analysis Results:');
    console.log('=' .repeat(60));
    console.log('LAYOUT:');
    console.log(`  Header: ${boardAnalysis.layout.hasHeader ? '✓' : '✗'}`);
    console.log(`  Columns: ${boardAnalysis.layout.columnCount}/10`);
    console.log(`  Tableau top: ${boardAnalysis.layout.tableauTop}px`);
    console.log(`\nFOUNDATION BAR:`);
    console.log(`  Completed area top: ${boardAnalysis.foundation.completedTop}px`);
    console.log(`  Stock pile top: ${boardAnalysis.foundation.stockTop}px`);
    console.log(`  Position: ${boardAnalysis.foundation.isInBottomBar ? 'BOTTOM ❌' : 'TOP ✓'}`);
    console.log(`\nCARD RENDERING:`);
    console.log(`  SVG symbols: ${boardAnalysis.cards.usesSVG ? '✓' : '✗'}`);
    console.log(`  Unicode symbols: ${boardAnalysis.cards.usesUnicode ? '✓' : '✗'}`);
    console.log(`  Pip layouts: ${boardAnalysis.cards.hasPipLayout ? '✓' : '✗'}`);
    console.log(`  Sample card: ${boardAnalysis.cards.sampleRank}${boardAnalysis.cards.sampleSuit}`);
    console.log(`\nISSUES DETECTED:`);
    boardAnalysis.issues.forEach(issue => console.log(`  ${issue}`));
    console.log('=' .repeat(60));

    // Step 3: Test smart click
    console.log('\nStep 3: Testing smart click on a face-up card...');
    const clickResult = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card.face-up'));
      if (cards.length > 0) {
        const card = cards[0];
        const rank = card.querySelector('.card-rank')?.textContent || '?';
        const col = card.dataset.col;
        card.click();
        return { success: true, rank, col };
      }
      return { success: false };
    });
    
    if (clickResult.success) {
      console.log(`✓ Clicked card ${clickResult.rank} in column ${clickResult.col}`);
    }
    
    await wait(1200);
    await page.screenshot({ path: path.join(screenshotsDir, '03-after-smart-click.png'), fullPage: false });
    console.log('✓ Screenshot 3: After smart click\n');

    // Step 4: Look for stats button
    console.log('Step 4: Looking for stats/chart button...');
    const statsButtonFound = await page.evaluate(() => {
      // Try multiple selectors
      const selectors = [
        '#btn-stats',
        '#btn-chart',
        'button[title*="Stats"]',
        'button[title*="stats"]',
        'button[title*="Statistics"]',
        '.header-btn:first-child',
        'header button:first-of-type'
      ];
      
      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn) {
          return { found: true, selector, text: btn.textContent, title: btn.title };
        }
      }
      return { found: false };
    });

    if (statsButtonFound.found) {
      console.log(`✓ Stats button found: ${statsButtonFound.selector}`);
      console.log(`  Text: "${statsButtonFound.text}", Title: "${statsButtonFound.title}"`);
      
      await page.click(statsButtonFound.selector);
      await wait(500);
      await page.screenshot({ path: path.join(screenshotsDir, '04-stats-modal.png'), fullPage: false });
      console.log('✓ Screenshot 4: Stats modal\n');
      
      // Close modal
      console.log('Step 5: Closing stats modal...');
      await page.evaluate(() => {
        const modal = document.querySelector('.modal-overlay:not(.hidden)');
        if (modal) {
          // Try clicking outside or finding close button
          const closeBtn = modal.querySelector('button');
          if (closeBtn) closeBtn.click();
          else modal.click();
        }
      });
      await wait(400);
      console.log('✓ Modal closed\n');
    } else {
      console.log('⚠️  Stats button not found. Available buttons:');
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('header button')).map(btn => ({
          id: btn.id,
          class: btn.className,
          text: btn.textContent.trim(),
          title: btn.title
        }));
      });
      buttons.forEach(btn => {
        console.log(`    - ID: ${btn.id}, Class: ${btn.class}, Text: "${btn.text}", Title: "${btn.title}"`);
      });
    }

    // Final screenshot
    await page.screenshot({ path: path.join(screenshotsDir, '05-final-state.png'), fullPage: false });
    console.log('✓ Screenshot 5: Final state\n');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    
    const issues = [];
    
    if (boardAnalysis.foundation.isInBottomBar) {
      issues.push('❌ CRITICAL: Foundation bar is at BOTTOM, should be at TOP');
    }
    
    if (!boardAnalysis.cards.usesSVG && boardAnalysis.cards.usesUnicode) {
      issues.push('⚠️  Cards use Unicode text symbols instead of SVG graphics');
    }
    
    if (!boardAnalysis.cards.hasPipLayout) {
      issues.push('⚠️  Cards lack pip layouts for number cards');
    }
    
    if (!statsButtonFound.found) {
      issues.push('⚠️  Stats/chart button not found in header');
    }
    
    if (errors.length > 0) {
      issues.push(`❌ ${errors.length} JavaScript errors detected`);
    }
    
    if (issues.length === 0) {
      console.log('✅ All tests passed!');
    } else {
      console.log('Issues found:');
      issues.forEach(issue => console.log(`  ${issue}`));
    }
    
    console.log(`\n📁 Screenshots saved in: ${screenshotsDir}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
