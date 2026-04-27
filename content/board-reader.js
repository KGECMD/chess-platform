/** Board reader - extracts position from chess.com and lichess DOM */

window.ChessBuddy = window.ChessBuddy || {};

ChessBuddy.BoardReader = {
  /** Read board from chess.com */
  readChessCom() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const boardEl = document.querySelector('wc-chess-board, chess-board, .board');
    if (!boardEl) return null;

    // Detect orientation
    const flipped = this._isChessComFlipped(boardEl);

    // chess.com uses <div class="piece XX square-YZ"> where XX = piece code, YZ = file+rank
    const pieces = boardEl.querySelectorAll('.piece');
    for (const el of pieces) {
      const classes = el.className.split(/\s+/);
      let pieceCode = null;
      let squareNum = null;

      for (const cls of classes) {
        if (cls.match(/^(w|b)(p|n|b|r|q|k)$/)) {
          pieceCode = cls;
        }
        if (cls.match(/^square-\d{2}$/)) {
          squareNum = cls.replace('square-', '');
        }
      }

      if (!pieceCode || !squareNum) continue;

      const fileIdx = parseInt(squareNum[0]) - 1; // 1-based file
      const rankIdx = parseInt(squareNum[1]) - 1; // 1-based rank
      const row = 7 - rankIdx; // Convert to 0-indexed row (rank 8 = row 0)
      const col = fileIdx;

      const color = pieceCode[0]; // w or b
      const type = pieceCode[1];  // p,n,b,r,q,k
      const fenChar = color === 'w' ? type.toUpperCase() : type.toLowerCase();

      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        board[row][col] = fenChar;
      }
    }

    return { board, flipped };
  },

  /** Read board from lichess */
  readLichess() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const boardEl = document.querySelector('cg-board');
    if (!boardEl) return null;

    const flipped = this._isLichessFlipped();
    const pieces = boardEl.querySelectorAll('piece');
    const boardRect = boardEl.getBoundingClientRect();
    const squareW = boardRect.width / 8;
    const squareH = boardRect.height / 8;

    for (const el of pieces) {
      const classes = el.className.split(/\s+/);
      if (classes.includes('ghost')) continue;

      let color = null;
      let type = null;
      for (const cls of classes) {
        if (cls === 'white') color = 'w';
        if (cls === 'black') color = 'b';
        if (['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].includes(cls)) {
          type = cls[0]; // p,n,b,r,q,k
          if (cls === 'knight') type = 'n';
        }
      }
      if (!color || !type) continue;

      // Get position from transform style
      const transform = el.style.transform || '';
      const match = transform.match(/translate\((\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)px\)/);
      if (!match) continue;

      const px = parseFloat(match[1]);
      const py = parseFloat(match[2]);

      let col, row;
      if (flipped) {
        col = 7 - Math.round(px / squareW);
        row = 7 - Math.round(py / squareH);
      } else {
        col = Math.round(px / squareW);
        row = Math.round(py / squareH);
      }

      const fenChar = color === 'w' ? type.toUpperCase() : type.toLowerCase();
      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        board[row][col] = fenChar;
      }
    }

    return { board, flipped };
  },

  /** Detect turn from move indicators or clocks */
  detectTurn(site) {
    if (site === 'chess.com') {
      // Check move list or active clock
      const moveList = document.querySelector('.move-list-wrapper, vertical-move-list');
      if (moveList) {
        const moves = moveList.querySelectorAll('.move, .node');
        if (moves.length > 0) {
          const lastMove = moves[moves.length - 1];
          const text = lastMove.textContent.trim();
          // If there's an active black node, it's white's turn
          const activeWhite = document.querySelector('.clock-bottom.clock-player-turn, .clock-white.clock-player-turn');
          const activeBlack = document.querySelector('.clock-top.clock-player-turn, .clock-black.clock-player-turn');
          if (activeWhite) return 'w';
          if (activeBlack) return 'b';
        }
      }
      // Fallback: check highlight squares
      const highlights = document.querySelectorAll('.highlight');
      if (highlights.length >= 2) {
        // Last move was made, figure out whose turn based on move count
        const moveNodes = document.querySelectorAll('.move .white, .move .black, .node .white-move, .node .black-move');
        return moveNodes.length % 2 === 0 ? 'w' : 'b';
      }
      return 'w';
    }

    if (site === 'lichess') {
      const turnIndicator = document.querySelector('.rclock-turn');
      if (turnIndicator) {
        const isBottom = turnIndicator.closest('.rclock-bottom');
        const isTop = turnIndicator.closest('.rclock-top');
        const flipped = this._isLichessFlipped();
        if (isBottom) return flipped ? 'b' : 'w';
        if (isTop) return flipped ? 'w' : 'b';
      }
      // Fallback: clock running indicator
      const runningClock = document.querySelector('.rclock .time.running');
      if (runningClock) {
        const isBottom = runningClock.closest('.rclock-bottom');
        const flipped = this._isLichessFlipped();
        if (isBottom) return flipped ? 'b' : 'w';
        return flipped ? 'w' : 'b';
      }
      return 'w';
    }

    return 'w';
  },

  /** Detect castling rights (heuristic based on king/rook positions) */
  detectCastling(board) {
    let castling = '';
    // White
    if (board[7][4] === 'K') {
      if (board[7][7] === 'R') castling += 'K';
      if (board[7][0] === 'R') castling += 'Q';
    }
    // Black
    if (board[0][4] === 'k') {
      if (board[0][7] === 'r') castling += 'k';
      if (board[0][0] === 'r') castling += 'q';
    }
    return castling || '-';
  },

  _isChessComFlipped(boardEl) {
    if (!boardEl) return false;
    // Check if board is flipped (black at bottom)
    const coordsBottom = document.querySelector('.coordinates-bottom, .coordinate-bottom');
    if (coordsBottom && coordsBottom.textContent.trim().startsWith('h')) return true;
    // Check board element class/attribute
    if (boardEl.hasAttribute('flipped')) return true;
    const style = boardEl.className || '';
    return style.includes('flipped');
  },

  _isLichessFlipped() {
    const orientation = document.querySelector('.cg-wrap');
    if (orientation) {
      return orientation.classList.contains('orientation-black');
    }
    return false;
  }
};
