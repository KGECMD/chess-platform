/** lichess.org integration - main controller for lichess games */

(function() {
  'use strict';

  const SITE = 'lichess';
  let active = false;
  let analyzing = false;
  let lastFen = '';
  let observer = null;
  let settings = {};
  let boardEl = null;

  async function init() {
    settings = await ChessBuddy.getSettings();
    if (!settings.enabled) return;

    await waitForBoard();
    if (!boardEl) return;

    active = true;
    ChessBuddy.Overlay.init(boardEl);
    startObserving();
    ChessBuddy.log('Initialized on lichess');

    await analyzeCurrentPosition();
  }

  function waitForBoard() {
    return new Promise((resolve) => {
      const check = () => {
        boardEl = document.querySelector('cg-board');
        if (boardEl) return resolve();
        setTimeout(check, 500);
      };
      check();
      setTimeout(resolve, 30000);
    });
  }

  function startObserving() {
    const target = document.querySelector('.round__app, .analyse__board, .cg-wrap, main');
    if (!target) return;

    observer = new MutationObserver(debounce(onBoardChange, 150));
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'transform']
    });

    // Lichess also updates the move list
    const moveList = document.querySelector('l4x, .moves, kwdb');
    if (moveList) {
      const moveObs = new MutationObserver(debounce(onBoardChange, 200));
      moveObs.observe(moveList, { childList: true, subtree: true });
    }

    window.addEventListener('resize', () => {
      ChessBuddy.Overlay.resize(boardEl);
    });
  }

  async function onBoardChange() {
    if (!active || analyzing) return;
    settings = await ChessBuddy.getSettings();
    if (!settings.enabled) {
      ChessBuddy.Overlay.clear();
      return;
    }
    await analyzeCurrentPosition();
  }

  async function analyzeCurrentPosition() {
    const result = ChessBuddy.BoardReader.readLichess();
    if (!result) return;

    const turn = ChessBuddy.BoardReader.detectTurn(SITE);
    const castling = ChessBuddy.BoardReader.detectCastling(result.board);
    const fen = ChessBuddy.boardToFEN(result.board, turn, castling, '-');

    if (fen === lastFen) return;
    lastFen = fen;

    analyzing = true;
    ChessBuddy.Overlay.clear();

    try {
      const analysis = await ChessBuddy.analyze(fen, settings);
      if (!analysis || analysis.error) {
        analyzing = false;
        return;
      }

      if (settings.showArrows && analysis.bestMove) {
        const from = analysis.bestMove.substring(0, 2);
        const to = analysis.bestMove.substring(2, 4);
        const boardSize = boardEl.getBoundingClientRect().width;

        ChessBuddy.Overlay.clear();
        ChessBuddy.Overlay.drawArrow(from, to, result.flipped, boardSize, true);

        if (analysis.lines && analysis.lines.length > 1) {
          for (let i = 1; i < analysis.lines.length; i++) {
            const line = analysis.lines[i];
            if (line && line.pv && line.pv[0]) {
              const altFrom = line.pv[0].substring(0, 2);
              const altTo = line.pv[0].substring(2, 4);
              ChessBuddy.Overlay.drawArrow(altFrom, altTo, result.flipped, boardSize, false);
            }
          }
        }
      }

      if (settings.showEval && analysis.lines && analysis.lines[0]) {
        const line = analysis.lines[0];
        ChessBuddy.Overlay.updateEval(line.scoreValue, line.scoreType);
      }

      if (settings.autoMove && analysis.bestMove) {
        await performAutoMove(analysis, result.flipped, turn);
      }

    } catch (err) {
      ChessBuddy.log('Analysis error:', err);
    }

    analyzing = false;
  }

  async function performAutoMove(analysis, flipped, turn) {
    const playerColor = getPlayerColor();
    if (playerColor && playerColor !== turn) return;

    const move = analysis.bestMove;
    const from = move.substring(0, 2);
    const to = move.substring(2, 4);
    const promotion = move.length > 4 ? move[4] : null;

    if (settings.humanize) {
      await ChessBuddy.humanDelay(settings.minDelay, settings.maxDelay);
    }

    // Re-verify position
    const currentResult = ChessBuddy.BoardReader.readLichess();
    if (!currentResult) return;
    const currentFen = ChessBuddy.boardToFEN(
      currentResult.board,
      ChessBuddy.BoardReader.detectTurn(SITE),
      ChessBuddy.BoardReader.detectCastling(currentResult.board),
      '-'
    );
    if (currentFen !== lastFen) return;

    await ChessBuddy.AutoMover.moveLichess(from, to, promotion);
  }

  function getPlayerColor() {
    const flipped = ChessBuddy.BoardReader._isLichessFlipped();
    return flipped ? 'b' : 'w';
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      settings = msg.settings;
      if (!settings.enabled) {
        ChessBuddy.Overlay.clear();
      } else {
        analyzeCurrentPosition();
      }
    }
    if (msg.type === 'TOGGLE') {
      settings.enabled = !settings.enabled;
      if (!settings.enabled) ChessBuddy.Overlay.clear();
      else analyzeCurrentPosition();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
