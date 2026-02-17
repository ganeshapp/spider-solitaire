#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('🕷️  Testing Cardmeister Integration in Spider Solitaire\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1600,1000', '--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    const consoleMessages = [];
    const errors = [];
    
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        errors.push(text);
        console.log('❌ Console Error:', text);
      } else if (msg.type() === 'warning') {
        console.log('⚠️  Console Warning:', text);
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
      console.log('❌ Page Error:', error.message);
    });

    // Load the page
    console.log('Step 1: Loading http://localhost:8080...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle2', 
      timeout: 15000 
    });
    
    await wait(1500);
    
    // Take screenshot of modal
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'cardmeister-01-modal.png'),
      fullPage: false 
    });
    console.log('✓ Screenshot 1: Initial modal\n');

    // Start game
    console.log('Step 2: Starting 1-Suit game...');
    await page.evaluate(() => {
      const btn = document.querySelector('.difficulty-btn[data-mode="1"]');
      if (btn) btn.click();
    });
    
    await wait(2000);
    
    // Take full board screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'cardmeister-02-full-board.png'),
      fullPage: false 
    });
    console.log('✓ Screenshot 2: Full game board\n');

    // Detailed analysis
    console.log('Analyzing Cardmeister card rendering...');
    const cardAnalysis = await page.evaluate(() => {
      const results = {
        layout: {},
        faceUpCards: {},
        faceDownCards: {},
        cardmeister: {},
        issues: []
      };

      // Check layout
      const header = document.querySelector('header');
      const completedArea = document.getElementById('completed-area');
      const stockPile = document.getElementById('stock-pile');
      const tableau = document.getElementById('tableau');
      const columns = document.querySelectorAll('.column');
      
      results.layout.hasHeader = !!header;
      results.layout.hasCompletedArea = !!completedArea;
      results.layout.hasStockPile = !!stockPile;
      results.layout.hasTableau = !!tableau;
      results.layout.columnCount = columns.length;
      
      if (completedArea && tableau) {
        const completedRect = completedArea.getBoundingClientRect();
        const tableauRect = tableau.getBoundingClientRect();
        results.layout.foundationTop = Math.round(completedRect.top);
        results.layout.tableauTop = Math.round(tableauRect.top);
        results.layout.foundationAboveTableau = completedRect.top < tableauRect.top;
      }

      // Check face-up cards
      const faceUpCards = document.querySelectorAll('.card.face-up');
      results.faceUpCards.count = faceUpCards.length;
      
      if (faceUpCards.length > 0) {
        const firstCard = faceUpCards[0];
        
        // Check for Cardmeister web components
        const playingCard = firstCard.querySelector('playing-card');
        const hasPlayingCardTag = !!playingCard;
        
        // Check for SVG
        const hasSVG = !!firstCard.querySelector('svg');
        
        // Check for custom element registration
        const isCardmeisterDefined = typeof customElements !== 'undefined' && 
                                     customElements.get('playing-card') !== undefined;
        
        results.cardmeister.usesPlayingCardElement = hasPlayingCardTag;
        results.cardmeister.hasSVG = hasSVG;
        results.cardmeister.customElementDefined = isCardmeisterDefined;
        results.cardmeister.firstCardHTML = firstCard.innerHTML.substring(0, 300);
        
        // Sample cards
        results.faceUpCards.samples = Array.from(faceUpCards).slice(0, 5).map((card, i) => {
          const playingCard = card.querySelector('playing-card');
          return {
            index: i,
            hasPlayingCard: !!playingCard,
            hasSVG: !!card.querySelector('svg'),
            rank: card.dataset.rank || 'unknown',
            suit: card.dataset.suit || 'unknown',
            classes: card.className
          };
        });
        
        if (!hasPlayingCardTag && !hasSVG) {
          results.issues.push('❌ Face-up cards have no <playing-card> or SVG content');
        }
      } else {
        results.issues.push('❌ No face-up cards found');
      }

      // Check face-down cards
      const faceDownCards = document.querySelectorAll('.card.face-down');
      results.faceDownCards.count = faceDownCards.length;
      
      if (faceDownCards.length > 0) {
        const firstFaceDown = faceDownCards[0];
        results.faceDownCards.hasBackground = firstFaceDown.style.background || 
                                              window.getComputedStyle(firstFaceDown).background;
        results.faceDownCards.visible = true;
      } else {
        results.faceDownCards.visible = false;
      }

      // Check stock pile visibility
      if (stockPile) {
        const stockRect = stockPile.getBoundingClientRect();
        results.layout.stockVisible = stockRect.width > 0 && stockRect.height > 0;
        results.layout.stockCount = document.getElementById('stock-count')?.textContent;
      }

      return results;
    });

    // Report findings
    console.log('='.repeat(70));
    console.log('CARDMEISTER INTEGRATION ANALYSIS');
    console.log('='.repeat(70));
    
    console.log('\n📐 Layout Check:');
    console.log(`  Header: ${cardAnalysis.layout.hasHeader ? '✓' : '✗'}`);
    console.log(`  Completed area: ${cardAnalysis.layout.hasCompletedArea ? '✓' : '✗'}`);
    console.log(`  Stock pile: ${cardAnalysis.layout.hasStockPile ? '✓' : '✗'}`);
    console.log(`  Stock visible: ${cardAnalysis.layout.stockVisible ? '✓' : '✗'}`);
    console.log(`  Stock count: ${cardAnalysis.layout.stockCount}`);
    console.log(`  Tableau: ${cardAnalysis.layout.hasTableau ? '✓' : '✗'}`);
    console.log(`  Columns: ${cardAnalysis.layout.columnCount}/10`);
    console.log(`  Foundation above tableau: ${cardAnalysis.layout.foundationAboveTableau ? '✓' : '✗'}`);
    
    console.log('\n🃏 Face-Up Cards:');
    console.log(`  Count: ${cardAnalysis.faceUpCards.count}`);
    console.log(`  Uses <playing-card>: ${cardAnalysis.cardmeister.usesPlayingCardElement ? '✓' : '✗'}`);
    console.log(`  Has SVG: ${cardAnalysis.cardmeister.hasSVG ? '✓' : '✗'}`);
    console.log(`  Custom element defined: ${cardAnalysis.cardmeister.customElementDefined ? '✓' : '✗'}`);
    
    if (cardAnalysis.faceUpCards.samples) {
      console.log('\n  Sample cards:');
      cardAnalysis.faceUpCards.samples.forEach(card => {
        console.log(`    Card ${card.index}: ${card.rank}${card.suit} - ` +
                    `<playing-card>: ${card.hasPlayingCard ? '✓' : '✗'}, ` +
                    `SVG: ${card.hasSVG ? '✓' : '✗'}`);
      });
    }
    
    console.log('\n🎴 Face-Down Cards:');
    console.log(`  Count: ${cardAnalysis.faceDownCards.count}`);
    console.log(`  Visible: ${cardAnalysis.faceDownCards.visible ? '✓' : '✗'}`);
    
    console.log('\n💻 Console Status:');
    if (errors.length === 0) {
      console.log('  ✅ No JavaScript errors');
    } else {
      console.log(`  ❌ ${errors.length} error(s):`);
      errors.forEach(err => console.log(`     - ${err}`));
    }
    
    if (cardAnalysis.issues.length > 0) {
      console.log('\n⚠️  Issues Detected:');
      cardAnalysis.issues.forEach(issue => console.log(`  ${issue}`));
    }

    // Take close-up screenshots
    console.log('\nStep 3: Taking close-up screenshots...');
    
    const firstCardPos = await page.evaluate(() => {
      const card = document.querySelector('.card.face-up');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    });
    
    if (firstCardPos) {
      await page.screenshot({
        path: path.join(screenshotsDir, 'cardmeister-03-cards-closeup.png'),
        clip: {
          x: Math.max(0, firstCardPos.x - 30),
          y: Math.max(0, firstCardPos.y - 30),
          width: Math.min(1600, firstCardPos.width * 5.5 + 60),
          height: Math.min(1000, firstCardPos.height + 60)
        }
      });
      console.log('✓ Screenshot 3: Cards close-up\n');
    }

    // Final verdict
    console.log('='.repeat(70));
    console.log('VERDICT');
    console.log('='.repeat(70));
    
    const allGood = 
      cardAnalysis.layout.columnCount === 10 &&
      cardAnalysis.layout.foundationAboveTableau &&
      cardAnalysis.faceUpCards.count > 0 &&
      cardAnalysis.faceDownCards.count > 0 &&
      errors.length === 0;
    
    if (allGood && cardAnalysis.cardmeister.usesPlayingCardElement) {
      console.log('✅ SUCCESS: Cardmeister integration working perfectly!');
    } else if (allGood && cardAnalysis.cardmeister.hasSVG) {
      console.log('✅ GOOD: Cards rendering with SVG (may be htdebeer or custom)');
    } else {
      console.log('⚠️  ISSUES: Some problems detected (see above)');
    }
    
    console.log(`\n📁 Screenshots saved in: ${screenshotsDir}`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
