/** Auto-mover - simulates human-like mouse interactions to play moves */

window.ChessBuddy = window.ChessBuddy || {};

ChessBuddy.AutoMover = {
  /** Execute a move on chess.com by clicking squares */
  async moveChessCom(fromSq, toSq, promotion) {
    const boardEl = document.querySelector('wc-chess-board, chess-board, .board');
    if (!boardEl) return false;

    const rect = boardEl.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const flipped = ChessBuddy.BoardReader._isChessComFlipped(boardEl);

    const fromCoords = this._getSquareCenter(fromSq, sqSize, rect, flipped);
    const toCoords = this._getSquareCenter(toSq, sqSize, rect, flipped);

    // Click source square
    await this._simulateClick(fromCoords.x, fromCoords.y, boardEl);
    await this._microDelay();

    // Click destination square
    await this._simulateClick(toCoords.x, toCoords.y, boardEl);

    // Handle promotion
    if (promotion && promotion !== 'q') {
      await this._microDelay();
      await this._handlePromotion(promotion, 'chess.com');
    }

    return true;
  },

  /** Execute a move on lichess by clicking squares */
  async moveLichess(fromSq, toSq, promotion) {
    const boardEl = document.querySelector('cg-board');
    if (!boardEl) return false;

    const rect = boardEl.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const flipped = ChessBuddy.BoardReader._isLichessFlipped();

    const fromCoords = this._getSquareCenter(fromSq, sqSize, rect, flipped);
    const toCoords = this._getSquareCenter(toSq, sqSize, rect, flipped);

    // Click source square
    await this._simulateClick(fromCoords.x, fromCoords.y, boardEl);
    await this._microDelay();

    // Click destination square
    await this._simulateClick(toCoords.x, toCoords.y, boardEl);

    // Handle promotion
    if (promotion) {
      await this._microDelay();
      await this._handlePromotion(promotion, 'lichess');
    }

    return true;
  },

  _getSquareCenter(sq, sqSize, boardRect, flipped) {
    const pos = ChessBuddy.algebraicToSquare(sq);
    let x, y;
    if (flipped) {
      x = boardRect.left + (7 - pos.file + 0.5) * sqSize;
      y = boardRect.top + (7 - pos.rank + 0.5) * sqSize;
    } else {
      x = boardRect.left + (pos.file + 0.5) * sqSize;
      y = boardRect.top + (pos.rank + 0.5) * sqSize;
    }
    // Add slight random offset for naturalism
    x += (Math.random() - 0.5) * sqSize * 0.3;
    y += (Math.random() - 0.5) * sqSize * 0.3;
    return { x, y };
  },

  async _simulateClick(x, y, target) {
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    };

    const el = document.elementFromPoint(x, y) || target;
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    await new Promise(r => setTimeout(r, 30 + Math.random() * 60));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  },

  async _handlePromotion(piece, site) {
    await new Promise(r => setTimeout(r, 300));
    if (site === 'chess.com') {
      const promoMap = { q: 1, r: 2, b: 3, n: 4 };
      const promoButtons = document.querySelectorAll('.promotion-piece, [data-promotion-piece]');
      const idx = promoMap[piece] || 1;
      if (promoButtons[idx - 1]) {
        promoButtons[idx - 1].click();
      }
    } else {
      // lichess promotion
      const promoSquare = document.querySelector(`piece.${piece === 'n' ? 'knight' : piece === 'b' ? 'bishop' : piece === 'r' ? 'rook' : 'queen'}`);
      if (promoSquare) promoSquare.click();
    }
  },

  async _microDelay() {
    return new Promise(r => setTimeout(r, 80 + Math.random() * 200));
  }
};
