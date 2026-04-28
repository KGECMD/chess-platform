/** Shared utilities for content scripts */

window.ChessBuddy = window.ChessBuddy || {};

ChessBuddy.PIECE_MAP = {
  'k': 'k', 'q': 'q', 'r': 'r', 'b': 'b', 'n': 'n', 'p': 'p',
  'K': 'K', 'Q': 'Q', 'R': 'R', 'B': 'B', 'N': 'N', 'P': 'P'
};

ChessBuddy.FILES = 'abcdefgh';
ChessBuddy.RANKS = '87654321';

ChessBuddy.squareToAlgebraic = function(file, rank) {
  return ChessBuddy.FILES[file] + ChessBuddy.RANKS[rank];
};

ChessBuddy.algebraicToSquare = function(sq) {
  return {
    file: ChessBuddy.FILES.indexOf(sq[0]),
    rank: ChessBuddy.RANKS.indexOf(sq[1])
  };
};

ChessBuddy.boardToFEN = function(board, turn, castling, enPassant) {
  let fen = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += piece;
      }
    }
    if (empty > 0) fen += empty;
    if (r < 7) fen += '/';
  }
  fen += ` ${turn || 'w'} ${castling || 'KQkq'} ${enPassant || '-'} 0 1`;
  return fen;
};

ChessBuddy.getSettings = function() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
  });
};

ChessBuddy.analyze = function(fen, settings) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'ANALYZE',
      fen: fen,
      depth: settings.engineDepth || 18,
      multiPv: settings.multiPv || 1,
      useStockfish: settings.useStockfish !== false
    }, resolve);
  });
};

ChessBuddy.humanDelay = function(minMs, maxMs) {
  const base = minMs + Math.random() * (maxMs - minMs);
  // Add occasional "thinking" pauses
  const thinkChance = Math.random();
  let extra = 0;
  if (thinkChance > 0.92) extra = 2000 + Math.random() * 4000;
  else if (thinkChance > 0.8) extra = 500 + Math.random() * 1500;
  return new Promise(r => setTimeout(r, base + extra));
};

ChessBuddy.log = function(...args) {
  // Silent in production - uncomment for debug
  // console.log('[ChessBuddy]', ...args);
};
