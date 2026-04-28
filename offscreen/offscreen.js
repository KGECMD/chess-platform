/** Offscreen document - hosts the Stockfish WASM worker and custom engine */

let stockfishWorker = null;
let stockfishReady = false;
let currentResolve = null;
let analysisLines = [];
let bestMove = null;

function initStockfish() {
  return new Promise((resolve, reject) => {
    try {
      stockfishWorker = new Worker(chrome.runtime.getURL('lib/stockfish/stockfish.js'));
      stockfishWorker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : e.data.data || '';
        handleUCIOutput(line);
        if (line === 'uciok') {
          stockfishReady = true;
          stockfishWorker.postMessage('isready');
        }
        if (line === 'readyok') {
          resolve();
        }
      };
      stockfishWorker.onerror = reject;
      stockfishWorker.postMessage('uci');
    } catch (err) {
      reject(err);
    }
  });
}

function handleUCIOutput(line) {
  if (line.startsWith('info depth')) {
    const parsed = parseInfoLine(line);
    if (parsed) {
      const pvIndex = parsed.multipv || 1;
      analysisLines[pvIndex - 1] = parsed;
    }
  }
  if (line.startsWith('bestmove')) {
    bestMove = line.split(' ')[1];
    if (currentResolve) {
      currentResolve({
        bestMove,
        lines: [...analysisLines],
        raw: line
      });
      currentResolve = null;
    }
  }
}

function parseInfoLine(line) {
  const tokens = line.split(' ');
  const result = {};
  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth': result.depth = parseInt(tokens[++i]); break;
      case 'seldepth': result.seldepth = parseInt(tokens[++i]); break;
      case 'multipv': result.multipv = parseInt(tokens[++i]); break;
      case 'score':
        result.scoreType = tokens[++i];
        result.scoreValue = parseInt(tokens[++i]);
        break;
      case 'nodes': result.nodes = parseInt(tokens[++i]); break;
      case 'nps': result.nps = parseInt(tokens[++i]); break;
      case 'pv':
        result.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }
  return result.depth ? result : null;
}

async function analyzeWithStockfish(fen, depth, multiPv) {
  if (!stockfishReady) {
    await initStockfish();
  }
  analysisLines = [];
  bestMove = null;

  return new Promise((resolve) => {
    currentResolve = resolve;
    stockfishWorker.postMessage('stop');
    stockfishWorker.postMessage('ucinewgame');
    stockfishWorker.postMessage('isready');
    setTimeout(() => {
      stockfishWorker.postMessage(`setoption name MultiPV value ${multiPv}`);
      stockfishWorker.postMessage(`position fen ${fen}`);
      stockfishWorker.postMessage(`go depth ${depth}`);
    }, 50);
  });
}

/* ========== Custom Engine (DevinEngine) ========== */
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5,  5,  5,  5,  5,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20
  ],
  r: [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20
  ]
};

function parseFEN(fen) {
  const parts = fen.split(' ');
  const board = [];
  const rows = parts[0].split('/');
  for (const row of rows) {
    const boardRow = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) boardRow.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        boardRow.push({ type: ch.toLowerCase(), color });
      }
    }
    board.push(boardRow);
  }
  return {
    board,
    turn: parts[1] || 'w',
    castling: parts[2] || '-',
    enPassant: parts[3] || '-',
    halfMove: parseInt(parts[4] || '0'),
    fullMove: parseInt(parts[5] || '1')
  };
}

function evaluatePosition(fen) {
  const pos = parseFEN(fen);
  let score = 0;
  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = pos.board[r][f];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] || 0;
      const pstIndex = piece.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const pstVal = (PST[piece.type] || [])[pstIndex] || 0;
      if (piece.color === 'w') {
        score += val + pstVal;
        whiteMaterial += val;
      } else {
        score -= val + pstVal;
        blackMaterial += val;
      }
    }
  }

  // Bishop pair bonus
  let whiteBishops = 0, blackBishops = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r][f];
      if (p && p.type === 'b') {
        if (p.color === 'w') whiteBishops++;
        else blackBishops++;
      }
    }
  }
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;

  return pos.turn === 'w' ? score : -score;
}

function customAnalyze(fen) {
  const score = evaluatePosition(fen);
  return {
    bestMove: null,
    lines: [{
      depth: 1,
      scoreType: 'cp',
      scoreValue: score,
      pv: [],
      source: 'custom'
    }],
    evaluation: score / 100
  };
}

/* ========== Message Handler ========== */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RUN_ENGINE') {
    (async () => {
      try {
        let result;
        if (msg.useStockfish) {
          result = await analyzeWithStockfish(msg.fen, msg.depth, msg.multiPv);
        } else {
          result = customAnalyze(msg.fen);
        }
        chrome.runtime.sendMessage({
          type: 'ENGINE_RESULT',
          requestId: msg.requestId,
          data: result
        });
      } catch (err) {
        chrome.runtime.sendMessage({
          type: 'ENGINE_RESULT',
          requestId: msg.requestId,
          data: { error: err.message }
        });
      }
    })();
    return true;
  }
});
