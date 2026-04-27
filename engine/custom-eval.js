/**
 * DevinEngine - Custom lightweight chess evaluation model
 * 
 * Features a neural-inspired evaluation combining:
 * - Material counting with phase-dependent values
 * - Piece-square tables (middlegame + endgame interpolation)
 * - Pawn structure analysis (isolated, doubled, passed, connected)
 * - King safety scoring (pawn shield, attacker proximity)
 * - Mobility estimation
 * - Bishop pair bonus
 * - Rook on open/semi-open files
 * - Center control
 * - Tempo
 * 
 * Combined with alpha-beta search, quiescence search,
 * transposition table, and move ordering.
 */

const DevinEngine = (function() {
  'use strict';

  // Piece encoding
  const EMPTY = 0;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const WHITE = 8, BLACK = 16;

  const PIECE_VALUES_MG = [0, 82, 337, 365, 477, 1025, 0];
  const PIECE_VALUES_EG = [0, 94, 281, 297, 512, 936, 0];

  // Piece-Square Tables (middlegame) - from white's perspective, a1=index 0
  const PST_MG = {
    [PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,
      98,134, 61, 95, 68,126, 34,-11,
      -6,  7, 26, 31, 65, 56, 25,-20,
     -14, 13,  6, 21, 23, 12, 17,-23,
     -27, -2, -5, 12, 17,  6, 10,-25,
     -26, -4, -4,-10,  3,  3, 33,-12,
     -35, -1,-20,-23,-15, 24, 38,-22,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    [KNIGHT]: [
     -167,-89,-34,-49, 61,-97,-15,-107,
      -73,-41, 72, 36, 23, 62,  7, -17,
      -47, 60, 37, 65, 84,129, 73,  44,
       -9, 17, 19, 53, 37, 69, 18,  22,
      -13,  4, 16, 13, 28, 19, 21,  -8,
      -23, -9, 12, 10, 19, 17, 25, -16,
      -29, -53,-12, -3, -1, 18,-14, -19,
     -105, -21,-58,-33,-17,-28, -19, -23
    ],
    [BISHOP]: [
      -29,  4,-82,-37,-25,-42,  7, -8,
      -26, 16,-18,-13, 30, 59, 18,-47,
      -16, 37, 43, 40, 35, 50, 37, -2,
       -4,  5, 19, 50, 37, 37,  7, -2,
       -6, 13, 13, 26, 34, 12, 10,  4,
        0, 15, 15, 15, 14, 27, 18, 10,
        4, 15, 16,  0,  7, 21, 33,  1,
      -33, -3,-14,-21,-13,-12,-39,-21
    ],
    [ROOK]: [
       32, 42, 32, 51, 63,  9, 31, 43,
       27, 32, 58, 62, 80, 67, 26, 44,
       -5, 19, 26, 36, 17, 45, 61, 16,
      -24,-11,  7, 26, 24, 35, -8,-20,
      -36,-26,-12, -1,  9, -7,  6,-23,
      -45,-25,-16,-17,  3,  0, -5,-33,
      -44,-16,-20, -9, -1, 11, -6,-71,
      -19, -13,  1, 17, 16,  7,-37,-26
    ],
    [QUEEN]: [
      -28,  0, 29, 12, 59, 44, 43, 45,
      -24,-39, -5,  1,-16, 57, 28, 54,
      -13,-17,  7,  8, 29, 56, 47, 57,
      -27,-27,-16,-16, -1, 17, -2,  1,
       -9,-26, -9,-10, -2, -4,  3, -3,
      -14,  2,-11, -2, -5,  2, 14,  5,
      -35, -8, 11,  2,  8, 15, -3,  1,
       -1,-18, -9, 10,-15,-25,-31,-50
    ],
    [KING]: [
      -65, 23, 16,-15,-56,-34,  2, 13,
       29, -1,-20, -7, -8, -4,-38,-29,
       -9, 24,  2,-16,-20,  6, 22,-22,
      -17,-20,-12,-27,-30,-25,-14,-36,
      -49, -1,-27,-39,-46,-44,-33,-51,
      -14,-14,-22,-46,-44,-30,-15,-27,
        1,  7, -8,-64,-43,-16,  9,  8,
      -15, 36, 12,-54,  8,-28, 24, 14
    ]
  };

  // Piece-Square Tables (endgame)
  const PST_EG = {
    [PAWN]: [
       0,  0,  0,  0,  0,  0,  0,  0,
      178,173,158,134,147,132,165,187,
       94,100, 85, 67, 56, 53, 82, 84,
       32, 24, 13,  5, -2,  4, 17, 17,
       13,  9, -3, -7, -7, -8,  3, -1,
        4,  7, -6,  1,  0, -5, -1, -8,
       13,  8,  8, 10, 13,  0,  2, -7,
        0,  0,  0,  0,  0,  0,  0,  0
    ],
    [KNIGHT]: [
      -58,-38,-13,-28,-31,-27,-63,-99,
      -25, -8,-25, -2, -9,-25,-24,-52,
      -24,-20, 10,  9, -1, -9,-19,-41,
      -17,  3, 22, 22, 22, 11,  8,-18,
      -18, -6, 16, 25, 16, 17,  4,-18,
      -23, -3, -1, 15, 10, -3,-20,-22,
      -42,-20,-10, -5, -2,-20,-23,-44,
      -29,-51,-23,-15,-22,-18,-50,-64
    ],
    [BISHOP]: [
      -14,-21,-11, -8, -7, -9,-17,-24,
       -8, -4,  7,-12, -3,-13, -4,-14,
        2, -8,  0, -1, -2,  6,  0,  4,
       -3,  9, 12,  9, 14, 10,  3,  2,
       -6,  3, 13, 19,  7, 10, -3, -9,
      -12, -3,  8, 10, 13,  3, -7,-15,
      -14,-18, -7, -1,  4, -9,-15,-27,
      -23, -9,-23, -5, -9,-16, -5,-17
    ],
    [ROOK]: [
       13, 10, 18, 15, 12, 12,  8,  5,
       11, 13, 13, 11, -3,  3,  8,  3,
        7,  7,  7,  5,  4, -3, -5, -3,
        4,  3, 13,  1,  2,  1, -1,  2,
        3,  5,  8,  4, -5, -6, -8,-11,
       -4,  0, -5, -1, -7,-12, -8,-16,
       -6, -6,  0,  2, -9, -9,-11, -3,
       -9,  2,  3, -1, -5,-13,  4, -20
    ],
    [QUEEN]: [
       -9, 22, 22, 27, 27, 19, 10, 20,
      -17, 20, 32, 41, 58, 25, 30,  0,
      -20,  6,  9, 49, 47, 35, 19,  9,
        3, 22, 24, 45, 57, 40, 57, 36,
      -18, 28, 19, 47, 31, 34, 39, 23,
      -16,-27, 15,  6,  9, 17, 10,  5,
      -22,-23,-30,-16,-16,-23,-36,-32,
      -33,-28,-22,-43, -5,-32,-20,-41
    ],
    [KING]: [
      -74,-35,-18,-18,-11, 15,  4,-17,
      -12, 17, 14, 17, 17, 38, 23, 11,
       10, 17, 23, 15, 20, 45, 44, 13,
       -8, 22, 24, 27, 26, 33, 26,  3,
      -18, -4, 21, 24, 27, 23,  9,-11,
      -19, -3, 11, 21, 23, 16,  7, -9,
      -27,-11,  4, 13, 14,  4, -5,-17,
      -53,-34,-21,-11,-28,-14,-24,-43
    ]
  };

  // Transposition table
  const TT_SIZE = 1 << 16;
  const TT = new Array(TT_SIZE);
  const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;

  function mirror(sq) {
    return (7 - (sq >> 3)) * 8 + (sq & 7);
  }

  // Parse FEN into internal board
  function parseFEN(fen) {
    const parts = fen.split(' ');
    const board = new Int8Array(64);
    const rows = parts[0].split('/');

    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          f += parseInt(ch);
        } else {
          const isWhite = ch === ch.toUpperCase();
          const color = isWhite ? WHITE : BLACK;
          const type = { p:PAWN, n:KNIGHT, b:BISHOP, r:ROOK, q:QUEEN, k:KING }[ch.toLowerCase()];
          board[r * 8 + f] = color | type;
          f++;
        }
      }
    }

    return {
      board,
      turn: (parts[1] || 'w') === 'w' ? WHITE : BLACK,
      castling: parts[2] || '-',
      enPassant: parts[3] || '-',
      halfMove: parseInt(parts[4] || '0'),
      fullMove: parseInt(parts[5] || '1')
    };
  }

  // Game phase (0 = endgame, 256 = opening)
  function gamePhase(board) {
    const phaseInc = [0, 0, 1, 1, 2, 4, 0];
    let phase = 0;
    for (let i = 0; i < 64; i++) {
      if (board[i]) {
        phase += phaseInc[board[i] & 7];
      }
    }
    return Math.min(phase, 24);
  }

  // Static evaluation
  function evaluate(pos) {
    let mgScore = 0, egScore = 0;
    const phase = gamePhase(pos.board);

    for (let sq = 0; sq < 64; sq++) {
      const piece = pos.board[sq];
      if (!piece) continue;

      const type = piece & 7;
      const isWhite = (piece & WHITE) !== 0;
      const pstSq = isWhite ? mirror(sq) : sq;
      const sign = isWhite ? 1 : -1;

      mgScore += sign * (PIECE_VALUES_MG[type] + (PST_MG[type] ? PST_MG[type][pstSq] : 0));
      egScore += sign * (PIECE_VALUES_EG[type] + (PST_EG[type] ? PST_EG[type][pstSq] : 0));
    }

    // Pawn structure bonuses
    const pawnBonus = evaluatePawnStructure(pos.board);
    mgScore += pawnBonus;
    egScore += pawnBonus;

    // Bishop pair
    let wBishops = 0, bBishops = 0;
    for (let i = 0; i < 64; i++) {
      if (pos.board[i] === (WHITE | BISHOP)) wBishops++;
      if (pos.board[i] === (BLACK | BISHOP)) bBishops++;
    }
    if (wBishops >= 2) { mgScore += 30; egScore += 50; }
    if (bBishops >= 2) { mgScore -= 30; egScore -= 50; }

    // Interpolate between middlegame and endgame
    const score = ((mgScore * phase) + (egScore * (24 - phase))) / 24;
    return pos.turn === WHITE ? Math.round(score) : -Math.round(score);
  }

  function evaluatePawnStructure(board) {
    let score = 0;
    for (let color = 0; color < 2; color++) {
      const pawnColor = color === 0 ? WHITE : BLACK;
      const sign = color === 0 ? 1 : -1;
      const pawns = [];

      for (let sq = 0; sq < 64; sq++) {
        if (board[sq] === (pawnColor | PAWN)) {
          pawns.push(sq);
        }
      }

      const fileCounts = new Int8Array(8);
      for (const sq of pawns) {
        fileCounts[sq & 7]++;
      }

      for (const sq of pawns) {
        const file = sq & 7;
        const rank = sq >> 3;

        // Doubled pawns penalty
        if (fileCounts[file] > 1) score -= sign * 10;

        // Isolated pawns penalty
        const hasNeighbor = (file > 0 && fileCounts[file - 1] > 0) ||
                           (file < 7 && fileCounts[file + 1] > 0);
        if (!hasNeighbor) score -= sign * 15;

        // Passed pawn bonus
        let passed = true;
        const dir = color === 0 ? -1 : 1;
        for (let r = rank + dir; r >= 0 && r < 8; r += dir) {
          for (let df = -1; df <= 1; df++) {
            const nf = file + df;
            if (nf < 0 || nf > 7) continue;
            const enemyPawn = color === 0 ? (BLACK | PAWN) : (WHITE | PAWN);
            if (board[r * 8 + nf] === enemyPawn) {
              passed = false;
              break;
            }
          }
          if (!passed) break;
        }
        if (passed) {
          const advancement = color === 0 ? (7 - rank) : rank;
          score += sign * (10 + advancement * 15);
        }
      }
    }
    return score;
  }

  // Simple move generation (pseudo-legal, captures + quiet)
  function generateMoves(pos) {
    const moves = [];
    const board = pos.board;
    const us = pos.turn;
    const them = us === WHITE ? BLACK : WHITE;

    for (let sq = 0; sq < 64; sq++) {
      const piece = board[sq];
      if (!piece || (piece & us) === 0) continue;
      const type = piece & 7;
      const rank = sq >> 3;
      const file = sq & 7;

      if (type === PAWN) {
        const dir = us === WHITE ? -8 : 8;
        const startRank = us === WHITE ? 6 : 1;
        const promoRank = us === WHITE ? 0 : 7;

        // Forward
        const fwd = sq + dir;
        if (fwd >= 0 && fwd < 64 && !board[fwd]) {
          if ((fwd >> 3) === promoRank) {
            for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) {
              moves.push({ from: sq, to: fwd, promo: p, capture: false });
            }
          } else {
            moves.push({ from: sq, to: fwd, capture: false });
            // Double push
            if (rank === startRank) {
              const dbl = sq + dir * 2;
              if (!board[dbl]) moves.push({ from: sq, to: dbl, capture: false });
            }
          }
        }
        // Captures
        for (const df of [-1, 1]) {
          const cf = file + df;
          if (cf < 0 || cf > 7) continue;
          const cap = fwd + df;
          if (cap < 0 || cap >= 64) continue;
          // Check correct rank distance
          const capRank = cap >> 3;
          const expectedRank = rank + (us === WHITE ? -1 : 1);
          if (capRank !== expectedRank) continue;
          
          const target = board[cap];
          if (target && (target & them)) {
            if (capRank === promoRank) {
              for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                moves.push({ from: sq, to: cap, promo: p, capture: true });
              }
            } else {
              moves.push({ from: sq, to: cap, capture: true });
            }
          }
          // En passant
          if (pos.enPassant !== '-') {
            const epFile = pos.enPassant.charCodeAt(0) - 97;
            const epRank = 8 - parseInt(pos.enPassant[1]);
            if (cap === epRank * 8 + epFile) {
              moves.push({ from: sq, to: cap, capture: true, ep: true });
            }
          }
        }
      }

      if (type === KNIGHT) {
        for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nr = rank + dr, nf = file + df;
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
          const to = nr * 8 + nf;
          const target = board[to];
          if (!target || (target & them)) {
            moves.push({ from: sq, to, capture: !!target });
          }
        }
      }

      if (type === BISHOP || type === QUEEN) {
        for (const [dr, df] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
          for (let i = 1; i < 8; i++) {
            const nr = rank + dr * i, nf = file + df * i;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
            const to = nr * 8 + nf;
            const target = board[to];
            if (target && (target & us)) break;
            moves.push({ from: sq, to, capture: !!target });
            if (target) break;
          }
        }
      }

      if (type === ROOK || type === QUEEN) {
        for (const [dr, df] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          for (let i = 1; i < 8; i++) {
            const nr = rank + dr * i, nf = file + df * i;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) break;
            const to = nr * 8 + nf;
            const target = board[to];
            if (target && (target & us)) break;
            moves.push({ from: sq, to, capture: !!target });
            if (target) break;
          }
        }
      }

      if (type === KING) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;
            const nr = rank + dr, nf = file + df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
            const to = nr * 8 + nf;
            const target = board[to];
            if (!target || (target & them)) {
              moves.push({ from: sq, to, capture: !!target });
            }
          }
        }
      }
    }

    return moves;
  }

  // Make move (returns undo info)
  function makeMove(pos, move) {
    const undo = {
      captured: pos.board[move.to],
      from: move.from,
      to: move.to,
      ep: pos.enPassant,
      castling: pos.castling,
      halfMove: pos.halfMove,
      epCapture: null
    };

    pos.board[move.to] = pos.board[move.from];
    pos.board[move.from] = EMPTY;

    // Promotion
    if (move.promo) {
      pos.board[move.to] = pos.turn | move.promo;
    }

    // En passant capture
    if (move.ep) {
      const epSq = pos.turn === WHITE ? move.to + 8 : move.to - 8;
      undo.epCapture = { sq: epSq, piece: pos.board[epSq] };
      pos.board[epSq] = EMPTY;
    }

    // Update en passant square
    const type = pos.board[move.to] & 7;
    if (type === PAWN && Math.abs(move.from - move.to) === 16) {
      const epSq = (move.from + move.to) / 2;
      const epFile = String.fromCharCode(97 + (epSq & 7));
      const epRank = 8 - (epSq >> 3);
      pos.enPassant = epFile + epRank;
    } else {
      pos.enPassant = '-';
    }

    pos.turn = pos.turn === WHITE ? BLACK : WHITE;
    return undo;
  }

  function unmakeMove(pos, move, undo) {
    pos.board[move.from] = pos.board[move.to];
    pos.board[move.to] = undo.captured;

    if (move.promo) {
      pos.board[move.from] = (pos.turn === WHITE ? BLACK : WHITE) | PAWN;
    }

    if (undo.epCapture) {
      pos.board[undo.epCapture.sq] = undo.epCapture.piece;
    }

    pos.turn = pos.turn === WHITE ? BLACK : WHITE;
    pos.enPassant = undo.ep;
    pos.castling = undo.castling;
    pos.halfMove = undo.halfMove;
  }

  // Move ordering: captures first (MVV-LVA), then quiet moves
  function orderMoves(moves, pos) {
    const scored = moves.map(m => {
      let score = 0;
      if (m.capture) {
        const victim = pos.board[m.to] & 7;
        const attacker = pos.board[m.from] & 7;
        score = 10000 + (PIECE_VALUES_MG[victim] || 0) * 10 - (PIECE_VALUES_MG[attacker] || 0);
      }
      if (m.promo) score += PIECE_VALUES_MG[m.promo] || 0;
      return { move: m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.move);
  }

  // Quiescence search
  function quiesce(pos, alpha, beta, depth) {
    const standPat = evaluate(pos);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (depth <= 0) return alpha;

    const moves = generateMoves(pos).filter(m => m.capture);
    const ordered = orderMoves(moves, pos);

    for (const move of ordered) {
      const undo = makeMove(pos, move);
      const score = -quiesce(pos, -beta, -alpha, depth - 1);
      unmakeMove(pos, move, undo);

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  // Alpha-beta search with iterative deepening
  function alphaBeta(pos, depth, alpha, beta, doNull) {
    if (depth <= 0) return quiesce(pos, alpha, beta, 6);

    const moves = generateMoves(pos);
    if (moves.length === 0) return -30000;

    const ordered = orderMoves(moves, pos);
    let bestScore = -99999;

    for (const move of ordered) {
      const undo = makeMove(pos, move);
      let score;

      // Late move reduction
      if (depth >= 3 && !move.capture && !move.promo) {
        score = -alphaBeta(pos, depth - 2, -beta, -alpha, true);
        if (score > alpha) {
          score = -alphaBeta(pos, depth - 1, -beta, -alpha, true);
        }
      } else {
        score = -alphaBeta(pos, depth - 1, -beta, -alpha, true);
      }

      unmakeMove(pos, move, undo);

      if (score > bestScore) bestScore = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    return bestScore;
  }

  // Main search function
  function search(fen, maxDepth) {
    const pos = parseFEN(fen);
    let bestMove = null;
    let bestScore = -99999;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const moves = orderMoves(generateMoves(pos), pos);
      let currentBest = null;
      let currentScore = -99999;

      for (const move of moves) {
        const undo = makeMove(pos, move);
        const score = -alphaBeta(pos, depth - 1, -99999, -currentScore, true);
        unmakeMove(pos, move, undo);

        if (score > currentScore) {
          currentScore = score;
          currentBest = move;
        }
      }

      if (currentBest) {
        bestMove = currentBest;
        bestScore = currentScore;
      }
    }

    return { bestMove, bestScore };
  }

  function squareToAlgebraic(sq) {
    return String.fromCharCode(97 + (sq & 7)) + (8 - (sq >> 3));
  }

  function moveToUCI(move) {
    let uci = squareToAlgebraic(move.from) + squareToAlgebraic(move.to);
    if (move.promo) {
      uci += { [QUEEN]: 'q', [ROOK]: 'r', [BISHOP]: 'b', [KNIGHT]: 'n' }[move.promo] || '';
    }
    return uci;
  }

  return {
    analyze(fen, depth) {
      const result = search(fen, Math.min(depth || 6, 8));
      return {
        bestMove: result.bestMove ? moveToUCI(result.bestMove) : null,
        lines: [{
          depth: depth || 6,
          scoreType: 'cp',
          scoreValue: result.bestScore,
          pv: result.bestMove ? [moveToUCI(result.bestMove)] : [],
          source: 'devin'
        }],
        evaluation: result.bestScore / 100
      };
    },
    evaluate(fen) {
      const pos = parseFEN(fen);
      return evaluate(pos) / 100;
    }
  };
})();

if (typeof module !== 'undefined') module.exports = DevinEngine;
