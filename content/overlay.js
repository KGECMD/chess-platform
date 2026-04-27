/** SVG arrow overlay for showing best moves on the board */

window.ChessBuddy = window.ChessBuddy || {};

ChessBuddy.Overlay = {
  svgNS: 'http://www.w3.org/2000/svg',
  container: null,
  evalBar: null,

  init(boardElement) {
    if (this.container) this.destroy();
    if (!boardElement) return;

    const rect = boardElement.getBoundingClientRect();

    // SVG overlay
    this.container = document.createElementNS(this.svgNS, 'svg');
    this.container.setAttribute('class', 'cb-overlay');
    this.container.setAttribute('width', rect.width);
    this.container.setAttribute('height', rect.height);
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; z-index: 100;
      pointer-events: none; width: ${rect.width}px; height: ${rect.height}px;
    `;

    // Arrow marker definition
    const defs = document.createElementNS(this.svgNS, 'defs');
    const marker = document.createElementNS(this.svgNS, 'marker');
    marker.setAttribute('id', 'cb-arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS(this.svgNS, 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', 'rgba(0, 180, 80, 0.85)');
    marker.appendChild(polygon);
    defs.appendChild(marker);

    // Secondary arrow marker (for alternative moves)
    const marker2 = marker.cloneNode(true);
    marker2.setAttribute('id', 'cb-arrowhead-alt');
    marker2.querySelector('polygon').setAttribute('fill', 'rgba(60, 130, 220, 0.65)');
    defs.appendChild(marker2);

    this.container.appendChild(defs);

    // Place overlay relative to board
    const wrapper = boardElement.closest('.board-layout-main, .cg-wrap, wc-chess-board, chess-board') || boardElement.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(this.container);
    }

    // Eval bar
    this.evalBar = document.createElement('div');
    this.evalBar.className = 'cb-eval-bar';
    this.evalBar.innerHTML = '<div class="cb-eval-fill"></div><span class="cb-eval-text"></span>';
    if (wrapper) wrapper.appendChild(this.evalBar);
  },

  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.evalBar) {
      this.evalBar.remove();
      this.evalBar = null;
    }
  },

  clear() {
    if (!this.container) return;
    const children = this.container.querySelectorAll('line, circle');
    children.forEach(c => c.remove());
  },

  drawArrow(fromSq, toSq, flipped, boardSize, isPrimary = true) {
    if (!this.container) return;
    const sqSize = boardSize / 8;

    const from = ChessBuddy.algebraicToSquare(fromSq);
    const to = ChessBuddy.algebraicToSquare(toSq);

    let x1 = (from.file + 0.5) * sqSize;
    let y1 = (from.rank + 0.5) * sqSize;
    let x2 = (to.file + 0.5) * sqSize;
    let y2 = (to.rank + 0.5) * sqSize;

    if (flipped) {
      x1 = boardSize - x1;
      y1 = boardSize - y1;
      x2 = boardSize - x2;
      y2 = boardSize - y2;
    }

    // Source circle
    const circle = document.createElementNS(this.svgNS, 'circle');
    circle.setAttribute('cx', x1);
    circle.setAttribute('cy', y1);
    circle.setAttribute('r', sqSize * 0.15);
    circle.setAttribute('fill', isPrimary ? 'rgba(0, 180, 80, 0.6)' : 'rgba(60, 130, 220, 0.4)');
    circle.setAttribute('class', 'cb-arrow-element');
    this.container.appendChild(circle);

    // Arrow line
    const line = document.createElementNS(this.svgNS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', isPrimary ? 'rgba(0, 180, 80, 0.85)' : 'rgba(60, 130, 220, 0.65)');
    line.setAttribute('stroke-width', isPrimary ? sqSize * 0.18 : sqSize * 0.12);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${isPrimary ? 'cb-arrowhead' : 'cb-arrowhead-alt'})`);
    line.setAttribute('class', 'cb-arrow-element');
    this.container.appendChild(line);
  },

  updateEval(score, scoreType) {
    if (!this.evalBar) return;
    const fill = this.evalBar.querySelector('.cb-eval-fill');
    const text = this.evalBar.querySelector('.cb-eval-text');
    if (!fill || !text) return;

    let evalText, percentage;
    if (scoreType === 'mate') {
      evalText = score > 0 ? `M${score}` : `M${score}`;
      percentage = score > 0 ? 95 : 5;
    } else {
      const cp = score / 100;
      evalText = cp >= 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);
      percentage = Math.max(5, Math.min(95, 50 + cp * 5));
    }

    fill.style.height = `${percentage}%`;
    text.textContent = evalText;
  },

  resize(boardElement) {
    if (!this.container || !boardElement) return;
    const rect = boardElement.getBoundingClientRect();
    this.container.setAttribute('width', rect.width);
    this.container.setAttribute('height', rect.height);
    this.container.style.width = rect.width + 'px';
    this.container.style.height = rect.height + 'px';
  }
};
