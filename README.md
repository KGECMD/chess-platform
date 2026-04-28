# Chess Buddy - Chrome Extension

A chess analysis Chrome extension that works on **chess.com** and **lichess.org**. Uses Stockfish WASM for deep analysis plus a custom DevinEngine for lightweight evaluation.

## Features

- **Board Vision** — Reads the board state from chess.com and lichess DOM in real time
- **Stockfish WASM** — Full Stockfish engine running in-browser via WebAssembly (depth 8–24)
- **DevinEngine** — Custom neural-inspired evaluation model with piece-square tables, pawn structure analysis, king safety, and alpha-beta search
- **Move Arrows** — SVG overlay draws best move arrows directly on the board (green = best, blue = alternatives)
- **Eval Bar** — Shows position evaluation alongside the board
- **Auto-Play** — Automatically plays the best move on your turn with human-like timing
- **Humanization** — Configurable random delays (0.5s–10s), occasional "thinking" pauses, and natural mouse movement offsets
- **Settings Panel** — Full control via popup: toggle engine, arrows, auto-move, depth, delay ranges, strength percentage

## Install

### Method 1: Load Unpacked (Developer Mode)

1. Clone this repo or download and extract the ZIP
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the repo root folder (the one containing `manifest.json`)
6. Navigate to chess.com or lichess.org and start a game

### Method 2: CRX File

1. Download `chess-buddy.crx` from this repo
2. Open Chrome → `chrome://extensions/`
3. Drag and drop the `.crx` file onto the page
4. Confirm the installation

## Usage

1. Click the Chess Buddy icon in your toolbar to open settings
2. Toggle features on/off:
   - **Use Stockfish** — Uses full Stockfish WASM (stronger, slower) vs DevinEngine (lighter, faster)
   - **Show Arrows** — Green arrow shows best move, blue arrows show alternatives
   - **Show Eval** — Evaluation bar next to the board
   - **Auto Move** — Automatically plays moves on your turn
   - **Humanize** — Adds random delays to auto-moves
   - **Depth** — Engine search depth (8–24)
   - **Strength %** — Reduce to occasionally play sub-optimal moves
3. Navigate to a game on chess.com or lichess.org

## Architecture

```
├── manifest.json           # Chrome MV3 manifest
├── background.js           # Service worker - message routing
├── offscreen/
│   ├── offscreen.html      # Offscreen document host
│   └── offscreen.js        # Stockfish WASM + custom engine bridge
├── engine/
│   └── custom-eval.js      # DevinEngine - custom evaluation model
├── content/
│   ├── shared.js           # Shared utilities (FEN generation, settings)
│   ├── board-reader.js     # DOM board reading for both sites
│   ├── overlay.js          # SVG arrow + eval bar overlay
│   ├── auto-mover.js       # Human-like auto-move via mouse simulation
│   ├── chess-com.js        # chess.com controller
│   └── lichess.js          # lichess.org controller
├── popup/
│   ├── popup.html          # Settings UI
│   ├── popup.js            # Settings controller
│   └── popup.css           # Dark theme styles
├── lib/stockfish/          # Stockfish WASM engine files
├── icons/                  # Extension icons
└── styles/
    └── overlay.css         # Arrow + eval bar styles
```

## How It Works

1. **Board Reading**: Content scripts parse the DOM to extract piece positions. On chess.com, pieces have CSS classes like `piece wp square-18`. On lichess, pieces use CSS transforms for positioning.

2. **FEN Generation**: The board state is converted to FEN notation and sent to the background service worker.

3. **Engine Analysis**: The service worker routes the FEN to either Stockfish WASM (via offscreen document) or DevinEngine. Stockfish communicates via UCI protocol.

4. **Visualization**: Best moves are drawn as SVG arrows on the board. The eval bar shows the position score.

5. **Auto-Move**: When enabled, the extension simulates mouse clicks on the source and destination squares with randomized timing and position offsets.

## DevinEngine

The custom engine features:
- **Evaluation**: Material + piece-square tables (middlegame/endgame interpolation) + pawn structure + bishop pair + mobility
- **Search**: Alpha-beta with iterative deepening, quiescence search, late move reduction, and move ordering (MVV-LVA)
- Strength: ~1600-1800 ELO in pure JavaScript

## License

MIT
