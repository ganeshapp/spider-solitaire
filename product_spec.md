# Project: Zen Spider Solitaire

## Overview
A high-performance, mobile-responsive Spider Solitaire web app hosted on GitHub Pages. The focus is on fluid animations, "smart" click-to-move UX, and persistent stat tracking.

## Technical Stack
- Framework: Vanilla JS/Tailwind (Keep it lightweight for GitHub Pages).
- State Management: Custom functions for game logic.
- Animations: Framer Motion (recommended for "smooth" card glides) or CSS Transitions.
- Persistence: Browser LocalStorage.
- Hosting: GitHub Pages.
- Card Assets: use a public CDN for card SVGs (like Cykoverse/SVG-Cards) so you don't have to manage 52+ image files manually.

## Core Features
### 1. Game Logic
- **Modes:** 1 Suit (Easy), 2 Suits (Medium), 4 Suits (Hard).
- **Deck:** 104 cards total. 10 tableau columns. Remaining cards in the stock pile.
- **Rules:** - Build sequences downward regardless of suit.
    - Only sequences of the same suit can be moved as a group.
    - Completed sequences (K through A) of the same suit are removed.
- **Win Condition:** All 8 sequences cleared.
- **Lose Condition:** No moves left and stock pile is empty.

### 2. Smart UX/UI
- **Drag & Drop:** Fluid dragging of valid stacks.
- **Smart Click:** If a user clicks a card/stack, automatically find the "best" legal move and animate the transition.
- **Hint System:** Calculate the best move (prioritizing clearing a hidden card or creating a suit sequence).
- **Undo System:** Unlimited undo stack stored in state.

### 3. State & Persistence
- Store `totalMoves`, `gamesWon`, and `gamesLost` in LocalStorage.
- Current game state should persist on page refresh.

### 4. Visuals
- Toast notifications for "No legal moves" or "Win/Loss".
- Card movement animations (Bezier curves preferred for natural feel).
- Responsive layout (adjusts column spacing for mobile vs. desktop).