#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  console.log('🕷️  Spider Solitaire - SVG Card Rendering Test\n');
  
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--window-size=1400,900', '--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    const consoleMessages = [];
    const errors = [];
    
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });
      if (msg.type() === 'error') {
        errors.push(text);
        console.log('❌ Console Error:', text);
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
      console.log('❌ Page Error:', error.message);
    });

    // Step 1: Load page and capture initial modal
    console.log('Step 1: Loading page...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle2', 
      timeout: 15000 
    });
    
    await wait(1000);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'svg-01-initial-modal.png'),
      fullPage: false 
    });
    console.log('✓ Screenshot 1: Initial modal saved\n');

    // Step 2: Start game
    console.log('Step 2: Starting 1-Suit game...');
    await page.evaluate(() => {
      const btn = document.querySelector('.difficulty-btn[data-mode="1"]');
      if (btn) btn.click();
    });
    
    await wait(1500);
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'svg-02-game-board.png'),
      fullPage: false 
    });
    console.log('✓ Screenshot 2: Game board saved\n');

    // Detailed SVG card analysis
    console.log('Analyzing SVG card rendering...');
    const svgAnalysis = await page.evaluate(() => {
      const results = {
        svgCards: {},
        cardSamples: [],
        issues: [],
        layoutInfo: {}
      };

      // Check if SVG sprite is loaded
      const svgUse = document.querySelector('use[href*="svg-cards"]');
      results.svgCards.usesSVGSprite = !!svgUse;
      
      // Check for SVG elements in cards
      const faceUpCards = document.querySelectorAll('.card.face-up');
      results.svgCards.totalFaceUpCards = faceUpCards.length;
      
      if (faceUpCards.length > 0) {
        // Analyze first few cards
        const samples = Array.from(faceUpCards).slice(0, 10);
        
        samples.forEach((card, index) => {
          const svg = card.querySelector('svg');
          const use = card.querySelector('use');
          const rankEl = card.querySelector('[data-rank]');
          const suitEl = card.querySelector('[data-suit]');
          
          const sample = {
            index,
            hasSVG: !!svg,
            hasUseElement: !!use,
            rank: card.dataset.rank || (rankEl ? rankEl.dataset.rank : 'unknown'),
            suit: card.dataset.suit || (suitEl ? suitEl.dataset.suit : 'unknown'),
            innerHTML: card.innerHTML.substring(0, 200) // First 200 chars
          };
          
          if (use) {
            sample.useHref = use.getAttribute('href') || use.getAttribute('xlink:href');
          }
          
          if (svg) {
            sample.svgViewBox = svg.getAttribute('viewBox');
            sample.svgClass = svg.getAttribute('class');
          }
          
          results.cardSamples.push(sample);
        });
        
        // Check if cards have proper SVG structure
        const allHaveSVG = Array.from(faceUpCards).every(card => 
          card.querySelector('svg') !== null
        );
        results.svgCards.allCardsUseSVG = allHaveSVG;
        
        // Check for pip layouts vs simple design
        const hasPipClass = document.querySelector('.pip') !== null;
        const hasComplexStructure = document.querySelector('.card-inner svg use') !== null;
        
        results.svgCards.usesPipLayout = hasPipClass;
        results.svgCards.usesComplexSVG = hasComplexStructure;
        
        // Check if using htdebeer sprite
        const usesHtdebeer = Array.from(faceUpCards).some(card => {
          const use = card.querySelector('use');
          if (!use) return false;
          const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
          return href.includes('svg-cards.svg');
        });
        results.svgCards.usesHtdebeerLibrary = usesHtdebeer;
        
      } else {
        results.issues.push('❌ No face-up cards found');
      }

      // Check layout
      const completedArea = document.getElementById('completed-area');
      const stockPile = document.getElementById('stock-pile');
      const tableau = document.getElementById('tableau');
      
      if (completedArea && tableau) {
        const completedRect = completedArea.getBoundingClientRect();
        const tableauRect = tableau.getBoundingClientRect();
        
        results.layoutInfo.foundationTop = Math.round(completedRect.top);
        results.layoutInfo.tableauTop = Math.round(tableauRect.top);
        results.layoutInfo.foundationIsAboveTableau = completedRect.top < tableauRect.top;
      }

      return results;
    });

    // Report findings
    console.log('='.repeat(70));
    console.log('SVG CARD RENDERING ANALYSIS');
    console.log('='.repeat(70));
    
    console.log('\n📊 SVG Implementation Status:');
    console.log(`  Uses SVG sprite: ${svgAnalysis.svgCards.usesSVGSprite ? '✓' : '✗'}`);
    console.log(`  All cards use SVG: ${svgAnalysis.svgCards.allCardsUseSVG ? '✓' : '✗'}`);
    console.log(`  Uses htdebeer library: ${svgAnalysis.svgCards.usesHtdebeerLibrary ? '✓' : '✗'}`);
    console.log(`  Complex SVG structure: ${svgAnalysis.svgCards.usesComplexSVG ? '✓' : '✗'}`);
    console.log(`  Face-up cards found: ${svgAnalysis.svgCards.totalFaceUpCards}`);
    
    console.log('\n🃏 Sample Cards:');
    svgAnalysis.cardSamples.slice(0, 5).forEach(card => {
      console.log(`  Card ${card.index}: ${card.rank}♠`);
      console.log(`    - Has SVG: ${card.hasSVG ? '✓' : '✗'}`);
      console.log(`    - Has <use>: ${card.hasUseElement ? '✓' : '✗'}`);
      if (card.useHref) {
        console.log(`    - Sprite ref: ${card.useHref.substring(0, 50)}...`);
      }
      if (card.svgViewBox) {
        console.log(`    - ViewBox: ${card.svgViewBox}`);
      }
    });
    
    console.log('\n📐 Layout:');
    console.log(`  Foundation bar top: ${svgAnalysis.layoutInfo.foundationTop}px`);
    console.log(`  Tableau top: ${svgAnalysis.layoutInfo.tableauTop}px`);
    console.log(`  Foundation above tableau: ${svgAnalysis.layoutInfo.foundationIsAboveTableau ? '✓' : '✗'}`);
    
    if (svgAnalysis.issues.length > 0) {
      console.log('\n⚠️  Issues:');
      svgAnalysis.issues.forEach(issue => console.log(`  ${issue}`));
    }
    
    // Render quality assessment
    console.log('\n🎨 Visual Quality Assessment:');
    
    if (svgAnalysis.svgCards.usesHtdebeerLibrary) {
      console.log('  ✅ Using professional htdebeer/SVG-cards library');
      console.log('  ✅ Cards should have:');
      console.log('     - Proper pip layouts for number cards');
      console.log('     - French-style face card illustrations');
      console.log('     - Distinct, recognizable suit symbols');
      console.log('     - Professional typography');
    } else if (svgAnalysis.svgCards.allCardsUseSVG) {
      console.log('  ⚠️  Using SVG but not htdebeer library');
      console.log('  Card design may be custom/simplified');
    } else {
      console.log('  ❌ Not using SVG cards - likely using text/Unicode');
    }
    
    // Console errors
    console.log('\n💻 JavaScript Console:');
    if (errors.length === 0) {
      console.log('  ✅ No JavaScript errors');
    } else {
      console.log(`  ❌ ${errors.length} error(s) detected`);
      errors.forEach(err => console.log(`     - ${err}`));
    }
    
    // Take a close-up screenshot of a few cards
    console.log('\nStep 3: Taking close-up of cards...');
    await page.evaluate(() => {
      // Zoom in on the first few cards
      const firstColumn = document.querySelector('.column');
      if (firstColumn) {
        firstColumn.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
    await wait(500);
    
    // Get position of first card for close-up
    const firstCardPos = await page.evaluate(() => {
      const card = document.querySelector('.card.face-up');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    });
    
    if (firstCardPos) {
      await page.screenshot({
        path: path.join(screenshotsDir, 'svg-03-card-closeup.png'),
        clip: {
          x: Math.max(0, firstCardPos.x - 50),
          y: Math.max(0, firstCardPos.y - 50),
          width: Math.min(1400, firstCardPos.width * 4 + 100),
          height: Math.min(900, firstCardPos.height + 100)
        }
      });
      console.log('✓ Screenshot 3: Card close-up saved\n');
    }
    
    console.log('='.repeat(70));
    console.log('FINAL VERDICT');
    console.log('='.repeat(70));
    
    if (svgAnalysis.svgCards.usesHtdebeerLibrary && errors.length === 0) {
      console.log('✅ EXCELLENT: Professional SVG cards are rendering correctly!');
      console.log('   Cards should look like real playing cards with proper artwork.');
    } else if (svgAnalysis.svgCards.allCardsUseSVG) {
      console.log('⚠️  GOOD: SVG rendering works, but may not use professional artwork.');
    } else {
      console.log('❌ ISSUE: Cards may not be using SVG rendering.');
    }
    
    console.log(`\n📁 All screenshots saved in: ${screenshotsDir}`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
