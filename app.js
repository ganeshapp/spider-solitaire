(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════════════════════════
  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const NUM_COLUMNS = 10;
  const TOTAL_CARDS = 104;
  const SEQUENCES_TO_WIN = 8;
  const STORAGE_KEY_STATE = 'zen_spider_state';
  const STORAGE_KEY_STATS = 'zen_spider_stats';

  const FACE_DOWN_OFFSET = 0.06;
  const FACE_UP_OFFSET = 0.18;

  // Cardmeister card ID mappings
  const RANK_CID = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_CID = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };

  // ═══════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════
  let state = {
    columns: [],
    stock: [],
    completed: 0,
    completedSuits: [],
    moves: 0,
    undoStack: [],
    mode: 1,
    gameOver: false,
  };

  const MODE_LABELS = { 1: '1 Suit', 2: '2 Suits', 4: '4 Suits' };

  function emptyModeStats() {
    return { gamesWon: 0, gamesLost: 0, bestWin: null };
  }

  function defaultStats() {
    return {
      totalMoves: 0,
      gamesWon: 0,
      gamesLost: 0,
      bestWin: null,
      byMode: { 1: emptyModeStats(), 2: emptyModeStats(), 4: emptyModeStats() },
    };
  }

  let stats = defaultStats();
  let dragState = null;
  let hintTimeout = null;
  let animating = false;

  // ═══════════════════════════════════════════════════════════
  //  DOM REFS
  // ═══════════════════════════════════════════════════════════
  const $tableau = document.getElementById('tableau');
  const $completedArea = document.getElementById('completed-area');
  const $stockPile = document.getElementById('stock-pile');
  const $stockCount = document.getElementById('stock-count');
  const $statMoves = document.getElementById('stat-moves');
  const $statCompleted = document.getElementById('stat-completed');
  const $modalNewGame = document.getElementById('modal-newgame');
  const $modalWin = document.getElementById('modal-win');
  const $modalStats = document.getElementById('modal-stats');
  const $modalInfo = document.getElementById('modal-info');
  const $winMessage = document.getElementById('win-message');
  const $dragLayer = document.getElementById('drag-layer');
  const $toastContainer = document.getElementById('toast-container');

  // ═══════════════════════════════════════════════════════════
  //  CARDMEISTER HELPERS
  // ═══════════════════════════════════════════════════════════
  function getCardCid(suit, rank) {
    return RANK_CID[rank] + SUIT_CID[suit];
  }

  // ═══════════════════════════════════════════════════════════
  //  DECK CREATION & SHUFFLING
  // ═══════════════════════════════════════════════════════════
  function createDeck(mode) {
    const suitsForMode = SUITS.slice(0, mode);
    const cardsPerSuit = TOTAL_CARDS / mode;
    const deck = [];
    for (const suit of suitsForMode) {
      for (let copy = 0; copy < cardsPerSuit / 13; copy++) {
        for (let rank = 1; rank <= 13; rank++) {
          deck.push({ suit, rank, faceUp: false });
        }
      }
    }
    return deck;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ═══════════════════════════════════════════════════════════
  //  WINNABLE DEAL GENERATOR
  // ═══════════════════════════════════════════════════════════
  function buildRandomDeal(mode) {
    const deck = shuffle(createDeck(mode));
    const columns = Array.from({ length: NUM_COLUMNS }, () => []);
    let idx = 0;
    for (let col = 0; col < NUM_COLUMNS; col++) {
      const count = col < 4 ? 6 : 5;
      for (let i = 0; i < count; i++) {
        columns[col].push({ ...deck[idx], faceUp: i === count - 1 });
        idx++;
      }
    }
    return { columns, stock: deck.slice(idx).map(c => ({ ...c })) };
  }

  function generateWinnableDeal(mode) {
    const maxAttempts = mode === 4 ? 25 : mode === 2 ? 50 : 80;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deal = buildRandomDeal(mode);
      if (checkWinnable(deal.columns, deal.stock)) return deal;
    }
    return buildRandomDeal(mode);
  }

  function checkWinnable(initCols, initStock) {
    for (let trial = 0; trial < 3; trial++) {
      const cols = initCols.map(c => c.map(x => ({ ...x })));
      const stock = initStock.map(x => ({ ...x }));
      if (greedySolve(cols, stock, trial > 0)) return true;
    }
    return false;
  }

  function greedySolve(cols, stock, useRandom) {
    let completed = 0;
    let stale = 0;

    for (let step = 0; step < 1500; step++) {
      if (completed >= SEQUENCES_TO_WIN) return true;

      const moves = [];
      for (let fc = 0; fc < NUM_COLUMNS; fc++) {
        const col = cols[fc];
        for (let ci = col.length - 1; ci >= 0; ci--) {
          if (!col[ci].faceUp) break;
          const seq = simGetSeq(cols, fc, ci);
          if (!seq) continue;
          for (let tc = 0; tc < NUM_COLUMNS; tc++) {
            if (tc === fc) continue;
            if (simCanPlace(seq, cols[tc])) {
              moves.push({ fromCol: fc, cardIndex: ci, toCol: tc, cards: seq });
            }
          }
        }
      }

      if (moves.length > 0) {
        for (const m of moves) m._s = simScore(m, cols);
        moves.sort((a, b) => b._s - a._s);

        const pick = (useRandom && moves.length > 1 && Math.random() < 0.25)
          ? Math.floor(Math.random() * Math.min(3, moves.length)) : 0;
        const best = moves[pick];

        const taken = cols[best.fromCol].splice(best.cardIndex);
        cols[best.toCol].push(...taken);

        const src = cols[best.fromCol];
        let revealed = false;
        if (src.length > 0 && !src[src.length - 1].faceUp) {
          src[src.length - 1].faceUp = true;
          revealed = true;
        }

        completed += simRemoveSeq(cols, best.toCol);
        stale = revealed ? 0 : stale + 1;
        if (stale > 150) return false;
      } else if (stock.length >= NUM_COLUMNS) {
        let canDeal = true;
        for (let i = 0; i < NUM_COLUMNS; i++) {
          if (cols[i].length === 0) { canDeal = false; break; }
        }
        if (!canDeal) return false;

        for (let i = 0; i < NUM_COLUMNS; i++) {
          const card = stock.pop();
          card.faceUp = true;
          cols[i].push(card);
        }
        for (let i = 0; i < NUM_COLUMNS; i++) completed += simRemoveSeq(cols, i);
        stale = 0;
      } else {
        return false;
      }
    }
    return completed >= SEQUENCES_TO_WIN;
  }

  function simGetSeq(cols, colIdx, cardIdx) {
    const col = cols[colIdx];
    if (!col[cardIdx] || !col[cardIdx].faceUp) return null;
    const cards = [col[cardIdx]];
    for (let i = cardIdx + 1; i < col.length; i++) {
      const prev = col[i - 1], curr = col[i];
      if (!curr.faceUp || curr.suit !== prev.suit || curr.rank !== prev.rank - 1) break;
      cards.push(curr);
    }
    if (cardIdx + cards.length !== col.length) return null;
    return cards;
  }

  function simCanPlace(seq, targetCol) {
    if (targetCol.length === 0) return true;
    return seq[0].rank === targetCol[targetCol.length - 1].rank - 1;
  }

  function simScore(move, cols) {
    let score = 0;
    const { fromCol, cardIndex, toCol, cards } = move;
    const srcCol = cols[fromCol];
    const dstCol = cols[toCol];

    const combined = [...dstCol, ...cards];
    if (combined.length >= 13) {
      const b = combined.slice(combined.length - 13);
      if (b[0].rank === 13) {
        let ok = true;
        for (let i = 0; i < 13; i++) {
          if (b[i].rank !== 13 - i || b[i].suit !== b[0].suit) { ok = false; break; }
        }
        if (ok) score += 10000;
      }
    }

    if (cardIndex > 0 && !srcCol[cardIndex - 1].faceUp) score += 500;
    if (cardIndex === 0) score += 200;

    if (dstCol.length === 0) {
      score -= 50;
      if (cards[0].rank === 13) score += 50;
    }

    if (dstCol.length > 0) {
      const top = dstCol[dstCol.length - 1];
      if (top.suit === cards[0].suit) {
        score += 300;
        let run = 1;
        for (let i = dstCol.length - 2; i >= 0; i--) {
          if (dstCol[i].faceUp && dstCol[i].suit === top.suit &&
              dstCol[i].rank === dstCol[i + 1].rank + 1) run++;
          else break;
        }
        score += run * 20;
      }
    }

    score += cards.length * 10;
    return score;
  }

  function simRemoveSeq(cols, colIdx) {
    const col = cols[colIdx];
    if (col.length < 13) return 0;
    const b = col.slice(col.length - 13);
    if (b[0].rank !== 13) return 0;
    const suit = b[0].suit;
    for (let i = 0; i < 13; i++) {
      if (b[i].rank !== 13 - i || b[i].suit !== suit || !b[i].faceUp) return 0;
    }
    col.splice(col.length - 13, 13);
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
    return 1;
  }

  // ═══════════════════════════════════════════════════════════
  //  GAME SETUP
  // ═══════════════════════════════════════════════════════════
  function newGame(mode) {
    const deal = generateWinnableDeal(mode);

    state = {
      columns: deal.columns,
      stock: deal.stock,
      completed: 0,
      completedSuits: [],
      moves: 0,
      undoStack: [],
      mode,
      gameOver: false,
    };

    clearHint();
    render();
    saveGameState();
  }

  // ═══════════════════════════════════════════════════════════
  //  MOVE VALIDATION
  // ═══════════════════════════════════════════════════════════
  function getMovableSequence(colIndex, cardIndex) {
    const col = state.columns[colIndex];
    if (!col[cardIndex] || !col[cardIndex].faceUp) return null;

    const cards = [col[cardIndex]];
    for (let i = cardIndex + 1; i < col.length; i++) {
      const prev = col[i - 1];
      const curr = col[i];
      if (!curr.faceUp || curr.suit !== prev.suit || curr.rank !== prev.rank - 1) break;
      cards.push(curr);
    }

    if (cardIndex + cards.length !== col.length) return null;
    return cards;
  }

  function canPlaceOn(movingCards, targetCol) {
    if (targetCol.length === 0) return true;
    const topCard = targetCol[targetCol.length - 1];
    return movingCards[0].rank === topCard.rank - 1;
  }

  function findAllMoves() {
    const moves = [];
    for (let fromCol = 0; fromCol < NUM_COLUMNS; fromCol++) {
      const col = state.columns[fromCol];
      for (let ci = col.length - 1; ci >= 0; ci--) {
        if (!col[ci].faceUp) break;
        const seq = getMovableSequence(fromCol, ci);
        if (!seq) continue;
        for (let toCol = 0; toCol < NUM_COLUMNS; toCol++) {
          if (toCol === fromCol) continue;
          if (canPlaceOn(seq, state.columns[toCol])) {
            moves.push({ fromCol, cardIndex: ci, toCol, cards: seq });
          }
        }
      }
    }
    return moves;
  }

  // ═══════════════════════════════════════════════════════════
  //  MOVE SCORING
  // ═══════════════════════════════════════════════════════════
  function scoreMove(move) {
    let score = 0;
    const { fromCol, cardIndex, toCol, cards } = move;
    const srcCol = state.columns[fromCol];
    const dstCol = state.columns[toCol];

    if (checkIfMoveMakesSequence(cards, dstCol)) score += 10000;

    if (dstCol.length === 0) {
      score -= 50;
      if (cards[0].rank === 13) score += 50;
    }

    if (cardIndex > 0 && !srcCol[cardIndex - 1].faceUp) score += 500;
    if (cardIndex === 0) score += 200;

    if (dstCol.length > 0) {
      const topDst = dstCol[dstCol.length - 1];
      if (topDst.suit === cards[0].suit) {
        score += 300;
        let runLen = 1;
        for (let i = dstCol.length - 2; i >= 0; i--) {
          if (dstCol[i].faceUp && dstCol[i].suit === topDst.suit &&
              dstCol[i].rank === dstCol[i + 1].rank + 1) runLen++;
          else break;
        }
        score += runLen * 20;
      }
    }

    score += cards.length * 10;
    return score;
  }

  function checkIfMoveMakesSequence(movingCards, targetCol) {
    const combined = [...targetCol, ...movingCards];
    if (combined.length < 13) return false;
    const bottom13 = combined.slice(combined.length - 13);
    const suit = bottom13[0].suit;
    if (bottom13[0].rank !== 13) return false;
    for (let i = 0; i < 13; i++) {
      if (bottom13[i].rank !== 13 - i || bottom13[i].suit !== suit) return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  MOVE EXECUTION
  // ═══════════════════════════════════════════════════════════
  function pushUndo() {
    state.undoStack.push({
      columns: state.columns.map(col => col.map(c => ({ ...c }))),
      stock: state.stock.map(c => ({ ...c })),
      completed: state.completed,
      completedSuits: [...state.completedSuits],
      moves: state.moves,
    });
  }

  function executeMove(fromCol, cardIndex, toCol, skipAnimation = false) {
    if (animating && !skipAnimation) return false;

    const seq = getMovableSequence(fromCol, cardIndex);
    if (!seq) return false;
    if (!canPlaceOn(seq, state.columns[toCol])) return false;

    pushUndo();

    const cards = state.columns[fromCol].splice(cardIndex);
    state.columns[toCol].push(...cards);

    const srcCol = state.columns[fromCol];
    if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp) {
      srcCol[srcCol.length - 1].faceUp = true;
    }

    state.moves++;
    stats.totalMoves++;

    checkAndRemoveSequence(toCol);

    render();
    saveGameState();
    saveStats();

    if (state.completed >= SEQUENCES_TO_WIN) handleWin();
    return true;
  }

  function checkAndRemoveSequence(colIndex) {
    const col = state.columns[colIndex];
    if (col.length < 13) return false;

    const bottom13 = col.slice(col.length - 13);
    const suit = bottom13[0].suit;
    if (bottom13[0].rank !== 13) return false;

    for (let i = 0; i < 13; i++) {
      if (bottom13[i].rank !== 13 - i || bottom13[i].suit !== suit || !bottom13[i].faceUp) return false;
    }

    col.splice(col.length - 13, 13);
    state.completed++;
    state.completedSuits.push(suit);

    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }

    toast(`Sequence complete! (${state.completed}/${SEQUENCES_TO_WIN})`);
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  //  DEAL FROM STOCK
  // ═══════════════════════════════════════════════════════════
  function dealFromStock() {
    if (animating) return;
    if (state.stock.length === 0) { toast('Stock is empty!'); return; }

    for (let i = 0; i < NUM_COLUMNS; i++) {
      if (state.columns[i].length === 0) {
        toast('Fill all empty columns before dealing');
        return;
      }
    }

    pushUndo();

    for (let i = 0; i < NUM_COLUMNS; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.columns[i].push(card);
    }

    state.moves++;
    stats.totalMoves++;

    for (let i = 0; i < NUM_COLUMNS; i++) checkAndRemoveSequence(i);

    render();
    saveGameState();
    saveStats();

    if (state.completed >= SEQUENCES_TO_WIN) handleWin();
  }

  // ═══════════════════════════════════════════════════════════
  //  UNDO
  // ═══════════════════════════════════════════════════════════
  function undo() {
    if (animating) return;
    if (state.undoStack.length === 0) { toast('Nothing to undo'); return; }

    const prev = state.undoStack.pop();
    state.columns = prev.columns;
    state.stock = prev.stock;
    state.completed = prev.completed;
    state.completedSuits = prev.completedSuits;
    state.moves = prev.moves;
    state.gameOver = false;

    clearHint();
    render();
    saveGameState();
  }

  // ═══════════════════════════════════════════════════════════
  //  SMART CLICK
  // ═══════════════════════════════════════════════════════════
  function smartClick(colIndex, cardIndex) {
    if (animating || state.gameOver) return;

    const seq = getMovableSequence(colIndex, cardIndex);
    if (!seq) return;

    const moves = [];
    for (let toCol = 0; toCol < NUM_COLUMNS; toCol++) {
      if (toCol === colIndex) continue;
      if (canPlaceOn(seq, state.columns[toCol])) {
        moves.push({ fromCol: colIndex, cardIndex, toCol, cards: seq });
      }
    }

    if (moves.length === 0) { toast('No valid move for this card'); return; }

    moves.sort((a, b) => scoreMove(b) - scoreMove(a));
    animateMove(moves[0].fromCol, moves[0].cardIndex, moves[0].toCol);
  }

  // ═══════════════════════════════════════════════════════════
  //  HINT SYSTEM
  // ═══════════════════════════════════════════════════════════
  function showHint() {
    if (animating || state.gameOver) return;
    clearHint();

    const moves = findAllMoves();
    if (moves.length === 0) {
      if (state.stock.length > 0) toast('No moves \u2014 try dealing from stock');
      else { toast('No moves available!'); checkLose(); }
      return;
    }

    moves.sort((a, b) => scoreMove(b) - scoreMove(a));
    const best = moves[0];

    const srcColEl = $tableau.children[best.fromCol];
    for (let i = best.cardIndex; i < state.columns[best.fromCol].length; i++) {
      const cardEl = srcColEl.querySelector(`[data-index="${i}"]`);
      if (cardEl) cardEl.classList.add('hint-source');
    }

    const dstColEl = $tableau.children[best.toCol];
    const dstCol = state.columns[best.toCol];
    if (dstCol.length > 0) {
      const targetEl = dstColEl.querySelector(`[data-index="${dstCol.length - 1}"]`);
      if (targetEl) targetEl.classList.add('hint-target');
    } else {
      dstColEl.classList.add('hint-target');
    }

    hintTimeout = setTimeout(clearHint, 3000);
  }

  function clearHint() {
    if (hintTimeout) { clearTimeout(hintTimeout); hintTimeout = null; }
    document.querySelectorAll('.hint-source, .hint-target').forEach(el => {
      el.classList.remove('hint-source', 'hint-target');
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  WIN / LOSE
  // ═══════════════════════════════════════════════════════════
  function handleWin() {
    state.gameOver = true;
    stats.gamesWon++;
    if (stats.bestWin === null || state.moves < stats.bestWin) {
      stats.bestWin = state.moves;
    }

    const ms = stats.byMode[state.mode];
    if (ms) {
      ms.gamesWon++;
      if (ms.bestWin === null || state.moves < ms.bestWin) {
        ms.bestWin = state.moves;
      }
    }

    saveStats();
    saveGameState();

    $winMessage.textContent = `Completed in ${state.moves} moves!`;
    setTimeout(() => $modalWin.classList.remove('hidden'), 600);
  }

  function checkLose() {
    if (state.gameOver) return;
    const moves = findAllMoves();
    if (moves.length === 0 && state.stock.length === 0) {
      state.gameOver = true;
      stats.gamesLost++;
      const ms = stats.byMode[state.mode];
      if (ms) ms.gamesLost++;
      saveStats();
      saveGameState();
      toast('No more moves \u2014 Game Over!');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  ANIMATION
  // ═══════════════════════════════════════════════════════════
  function animateMove(fromCol, cardIndex, toCol) {
    if (animating) return;
    animating = true;

    const srcColEl = $tableau.children[fromCol];
    const dstColEl = $tableau.children[toCol];
    const col = state.columns[fromCol];
    const movingCards = col.slice(cardIndex);

    const sourceRects = [];
    for (let i = cardIndex; i < col.length; i++) {
      const el = srcColEl.querySelector(`[data-index="${i}"]`);
      if (el) sourceRects.push(el.getBoundingClientRect());
    }

    const dstCol = state.columns[toCol];
    let dstTop;
    const lastChild = dstColEl.querySelector('.card:last-of-type');
    if (lastChild) {
      const lastRect = lastChild.getBoundingClientRect();
      const cardH = lastRect.height;
      const isLastFaceUp = dstCol.length > 0 && dstCol[dstCol.length - 1].faceUp;
      dstTop = lastRect.top + cardH * (isLastFaceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET);
    } else {
      dstTop = dstColEl.getBoundingClientRect().top;
    }
    const dstLeft = dstColEl.getBoundingClientRect().left + dstColEl.getBoundingClientRect().width * 0.05;

    const flyingEls = [];
    movingCards.forEach((card, i) => {
      const el = createCardElement(card, cardIndex + i);
      el.style.position = 'fixed';
      el.style.width = sourceRects[0] ? sourceRects[0].width + 'px' : '60px';
      el.style.left = (sourceRects[i] || sourceRects[0] || { left: 0 }).left + 'px';
      el.style.top = (sourceRects[i] || sourceRects[0] || { top: 0 }).top + 'px';
      el.style.zIndex = 90 + i;
      el.style.transition = 'left 0.3s cubic-bezier(0.34, 1.2, 0.64, 1), top 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)';
      el.style.pointerEvents = 'none';
      $dragLayer.appendChild(el);
      flyingEls.push(el);
    });

    $dragLayer.classList.remove('hidden');

    for (let i = cardIndex; i < col.length; i++) {
      const el = srcColEl.querySelector(`[data-index="${i}"]`);
      if (el) el.style.visibility = 'hidden';
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flyingEls.forEach((el, i) => {
          const cardH = sourceRects[0] ? sourceRects[0].height : 80;
          el.style.left = dstLeft + 'px';
          el.style.top = (dstTop + i * cardH * FACE_UP_OFFSET) + 'px';
        });

        setTimeout(() => {
          $dragLayer.innerHTML = '';
          $dragLayer.classList.add('hidden');
          executeMove(fromCol, cardIndex, toCol, true);
          animating = false;
        }, 320);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════════════════════
  function render() {
    renderTableau();
    renderCompleted();
    renderStock();
    renderStats();
  }

  function renderTableau() {
    $tableau.innerHTML = '';
    for (let colIdx = 0; colIdx < NUM_COLUMNS; colIdx++) {
      const colEl = document.createElement('div');
      colEl.className = 'column';
      colEl.dataset.col = colIdx;

      const emptySlot = document.createElement('div');
      emptySlot.className = 'column-empty-slot';
      colEl.appendChild(emptySlot);

      const col = state.columns[colIdx];
      let topOffset = 0;

      col.forEach((card, cardIdx) => {
        const cardEl = createCardElement(card, cardIdx);
        cardEl.style.top = topOffset + 'px';
        cardEl.dataset.col = colIdx;
        cardEl.dataset.index = cardIdx;
        colEl.appendChild(cardEl);

        const cardHeight = getCardHeight();
        topOffset += cardHeight * (card.faceUp ? FACE_UP_OFFSET : FACE_DOWN_OFFSET);
      });

      const cardHeight = getCardHeight();
      colEl.style.minHeight = Math.max(60, topOffset + cardHeight) + 'px';
      $tableau.appendChild(colEl);
    }
  }

  function createCardElement(card, index) {
    const el = document.createElement('div');
    el.className = `card ${card.faceUp ? 'face-up' : 'face-down'}`;
    el.dataset.index = index;

    if (card.faceUp) {
      const pc = document.createElement('playing-card');
      pc.setAttribute('cid', getCardCid(card.suit, card.rank));
      pc.setAttribute('opacity', '1');
      el.appendChild(pc);
    }

    return el;
  }

  function getCardHeight() {
    const colWidth = $tableau.offsetWidth / NUM_COLUMNS;
    const cardWidth = colWidth * 0.94;
    return cardWidth * (3.5 / 2.5);
  }

  function renderCompleted() {
    $completedArea.innerHTML = '';
    for (let i = 0; i < SEQUENCES_TO_WIN; i++) {
      const slot = document.createElement('div');
      slot.className = 'completed-slot';
      if (i < state.completedSuits.length) {
        const suit = state.completedSuits[i];
        slot.classList.add('filled');
        const pc = document.createElement('playing-card');
        pc.setAttribute('cid', 'K' + SUIT_CID[suit]);
        pc.setAttribute('opacity', '1');
        slot.appendChild(pc);
      } else {
        slot.innerHTML = '<span class="slot-placeholder">\u2660</span>';
      }
      $completedArea.appendChild(slot);
    }
  }

  function renderStock() {
    const remaining = state.stock.length;
    const deals = Math.ceil(remaining / NUM_COLUMNS);
    $stockCount.textContent = deals;
    if (remaining === 0) {
      $stockPile.classList.add('empty');
    } else {
      $stockPile.classList.remove('empty');
    }
  }

  function renderStats() {
    $statMoves.textContent = `Moves: ${state.moves}`;
    $statCompleted.textContent = `${state.completed}/${SEQUENCES_TO_WIN}`;
  }

  // ═══════════════════════════════════════════════════════════
  //  DRAG & DROP
  // ═══════════════════════════════════════════════════════════
  function startDrag(e, colIndex, cardIndex) {
    if (animating || state.gameOver) return;
    const col = state.columns[colIndex];
    if (!col[cardIndex] || !col[cardIndex].faceUp) return;

    const seq = getMovableSequence(colIndex, cardIndex);
    if (!seq) return;

    clearHint();

    const pointer = getPointerPos(e);
    const colEl = $tableau.children[colIndex];
    const cardEls = [];

    for (let i = cardIndex; i < col.length; i++) {
      const el = colEl.querySelector(`[data-index="${i}"]`);
      if (el) cardEls.push(el);
    }
    if (cardEls.length === 0) return;

    const firstRect = cardEls[0].getBoundingClientRect();

    const ghosts = [];
    cardEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.position = 'fixed';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.zIndex = 100 + i;
      $dragLayer.appendChild(ghost);
      ghosts.push(ghost);
      el.classList.add('dragging');
    });

    $dragLayer.classList.remove('hidden');

    dragState = {
      fromCol: colIndex,
      cardIndex,
      cards: seq,
      ghosts,
      originalEls: cardEls,
      offsetX: pointer.x - firstRect.left,
      offsetY: pointer.y - firstRect.top,
      startX: pointer.x,
      startY: pointer.y,
      moved: false,
    };
  }

  function moveDrag(e) {
    if (!dragState) return;
    e.preventDefault();

    const pointer = getPointerPos(e);
    const dx = pointer.x - dragState.startX;
    const dy = pointer.y - dragState.startY;

    if (!dragState.moved && Math.abs(dx) + Math.abs(dy) > 5) dragState.moved = true;
    if (!dragState.moved) return;

    const baseLeft = pointer.x - dragState.offsetX;
    const baseTop = pointer.y - dragState.offsetY;

    dragState.ghosts.forEach((ghost, i) => {
      const cardH = parseFloat(ghost.style.height);
      ghost.style.left = baseLeft + 'px';
      ghost.style.top = (baseTop + i * cardH * FACE_UP_OFFSET) + 'px';
    });

    document.querySelectorAll('.column.drop-target').forEach(el => el.classList.remove('drop-target'));
    const target = getDropTarget(pointer);
    if (target !== null && target !== dragState.fromCol) {
      $tableau.children[target].classList.add('drop-target');
    }
  }

  function endDrag(e) {
    if (!dragState) return;

    document.querySelectorAll('.column.drop-target').forEach(el => el.classList.remove('drop-target'));

    const { fromCol, cardIndex, cards, moved } = dragState;

    if (!moved) {
      cancelDrag();
      dragState = null;
      smartClick(fromCol, cardIndex);
      return;
    }

    const pointer = getPointerPos(e);
    const target = getDropTarget(pointer);

    if (target !== null && target !== fromCol && canPlaceOn(cards, state.columns[target])) {
      cancelDragVisuals();
      dragState = null;
      executeMove(fromCol, cardIndex, target, true);
    } else {
      cancelDrag();
      dragState = null;
    }
  }

  function cancelDrag() {
    if (!dragState) return;
    cancelDragVisuals();
  }

  function cancelDragVisuals() {
    if (!dragState) return;
    dragState.originalEls.forEach(el => el.classList.remove('dragging'));
    $dragLayer.innerHTML = '';
    $dragLayer.classList.add('hidden');
  }

  function getDropTarget(pointer) {
    for (let i = 0; i < NUM_COLUMNS; i++) {
      const colEl = $tableau.children[i];
      if (!colEl) continue;
      const rect = colEl.getBoundingClientRect();
      if (pointer.x >= rect.left && pointer.x <= rect.right &&
          pointer.y >= rect.top - 20 && pointer.y <= rect.bottom + 20) {
        return i;
      }
    }
    return null;
  }

  function getPointerPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  // ═══════════════════════════════════════════════════════════
  //  PERSISTENCE
  // ═══════════════════════════════════════════════════════════
  function saveGameState() {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
        columns: state.columns,
        stock: state.stock,
        completed: state.completed,
        completedSuits: state.completedSuits,
        moves: state.moves,
        mode: state.mode,
        gameOver: state.gameOver,
      }));
    } catch (e) { /* ignore */ }
  }

  function loadGameState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_STATE);
      if (!data) return false;
      const saved = JSON.parse(data);
      state.columns = saved.columns || [];
      state.stock = saved.stock || [];
      state.completed = saved.completed || 0;
      state.completedSuits = saved.completedSuits || [];
      state.moves = saved.moves || 0;
      state.mode = saved.mode || 1;
      state.gameOver = saved.gameOver || false;
      state.undoStack = [];
      return true;
    } catch (e) { return false; }
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
    } catch (e) { /* ignore */ }
  }

  function loadStats() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_STATS);
      if (data) {
        const saved = JSON.parse(data);
        stats.totalMoves = saved.totalMoves || 0;
        stats.gamesWon = saved.gamesWon || 0;
        stats.gamesLost = saved.gamesLost || 0;
        stats.bestWin = saved.bestWin || null;
        if (saved.byMode) {
          for (const m of [1, 2, 4]) {
            if (saved.byMode[m]) {
              stats.byMode[m] = {
                gamesWon: saved.byMode[m].gamesWon || 0,
                gamesLost: saved.byMode[m].gamesLost || 0,
                bestWin: saved.byMode[m].bestWin ?? null,
              };
            }
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  // ═══════════════════════════════════════════════════════════
  //  TOAST
  // ═══════════════════════════════════════════════════════════
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $toastContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 2600);
  }

  // ═══════════════════════════════════════════════════════════
  //  MODAL HELPERS
  // ═══════════════════════════════════════════════════════════
  function showNewGameModal() {
    document.getElementById('modal-stats-won').textContent = stats.gamesWon;
    document.getElementById('modal-stats-lost').textContent = stats.gamesLost;
    document.getElementById('modal-stats-total').textContent = stats.totalMoves;
    $modalNewGame.classList.remove('hidden');
  }

  function hideNewGameModal() {
    $modalNewGame.classList.add('hidden');
  }

  function showStatsModal() {
    const total = stats.gamesWon + stats.gamesLost;
    const winPct = total > 0 ? Math.round((stats.gamesWon / total) * 100) : 0;

    document.getElementById('stat-detail-won').textContent = stats.gamesWon;
    document.getElementById('stat-detail-lost').textContent = stats.gamesLost;
    document.getElementById('stat-detail-winpct').textContent = winPct + '%';
    document.getElementById('stat-detail-moves').textContent = stats.totalMoves;

    for (const m of [1, 2, 4]) {
      const ms = stats.byMode[m];
      const best = ms.bestWin !== null ? ms.bestWin : '--';
      const mTotal = ms.gamesWon + ms.gamesLost;
      const mWinPct = mTotal > 0 ? Math.round((ms.gamesWon / mTotal) * 100) + '%' : '--';
      document.getElementById(`stat-mode-${m}-best`).textContent = best;
      document.getElementById(`stat-mode-${m}-won`).textContent = ms.gamesWon;
      document.getElementById(`stat-mode-${m}-winpct`).textContent = mWinPct;
    }

    $modalStats.classList.remove('hidden');
  }

  function hideStatsModal() {
    $modalStats.classList.add('hidden');
  }

  function showInfoModal() {
    $modalInfo.classList.remove('hidden');
  }

  function hideInfoModal() {
    $modalInfo.classList.add('hidden');
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════
  function setupEvents() {
    $tableau.addEventListener('mousedown', onTableauPointerDown);
    $tableau.addEventListener('touchstart', onTableauPointerDown, { passive: false });
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    $stockPile.addEventListener('click', dealFromStock);

    document.getElementById('btn-hint').addEventListener('click', showHint);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-new').addEventListener('click', showNewGameModal);
    document.getElementById('btn-info').addEventListener('click', showInfoModal);
    document.getElementById('btn-info-close').addEventListener('click', hideInfoModal);
    document.getElementById('btn-stats').addEventListener('click', showStatsModal);
    document.getElementById('btn-stats-close').addEventListener('click', hideStatsModal);
    document.getElementById('btn-stats-reset').addEventListener('click', () => {
      if (confirm('Reset all statistics?')) {
        stats = defaultStats();
        saveStats();
        showStatsModal();
      }
    });

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        hideNewGameModal();
        newGame(parseInt(btn.dataset.mode));
      });
    });

    document.getElementById('btn-win-new').addEventListener('click', () => {
      $modalWin.classList.add('hidden');
      showNewGameModal();
    });

    $tableau.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const anyModalOpen = !$modalNewGame.classList.contains('hidden') ||
                           !$modalWin.classList.contains('hidden') ||
                           !$modalStats.classList.contains('hidden') ||
                           !$modalInfo.classList.contains('hidden');
      if (anyModalOpen) return;
      switch (e.key.toLowerCase()) {
        case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); } break;
        case 'h': showHint(); break;
        case 'd': dealFromStock(); break;
        case 'n': showNewGameModal(); break;
      }
    });

    window.addEventListener('resize', () => {
      if (!animating) render();
    });
  }

  function onTableauPointerDown(e) {
    if (animating || state.gameOver) return;

    const cardEl = e.target.closest('.card');
    if (!cardEl) return;

    const colIndex = parseInt(cardEl.dataset.col);
    const cardIndex = parseInt(cardEl.dataset.index);
    if (isNaN(colIndex) || isNaN(cardIndex)) return;

    const card = state.columns[colIndex]?.[cardIndex];
    if (!card || !card.faceUp) return;

    e.preventDefault();
    startDrag(e, colIndex, cardIndex);
  }

  // ═══════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════════════════════
  function init() {
    loadStats();

    const hasState = loadGameState();
    if (hasState && !state.gameOver && state.columns.length === NUM_COLUMNS) {
      render();
    } else {
      showNewGameModal();
      state.columns = Array.from({ length: NUM_COLUMNS }, () => []);
      render();
    }
  }

  init();
  setupEvents();
})();
