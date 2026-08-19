// src/renderer/helpers/scrollGuard.ts
/**
 * Scroll Guard – patches Entry.Scroller.resizeScrollBar to prevent NaN/Infinity values.
 */

function debugLog(...args: any[]) {
  // eslint-disable-next-line no-process-env
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn('[ScrollGuard]', ...args);
  }
}

export function applyScrollGuard() {
  const g = typeof window !== 'undefined' ? (window as any) : (global as any);
  const Entry = g ? g.Entry : null;

  if (!Entry) {
    return;
  }

  const Scroller = Entry.Scroller;
  if (!Scroller || !Scroller.prototype || typeof Scroller.prototype.resizeScrollBar !== 'function') {
    return;
  }

  const original = Scroller.prototype.resizeScrollBar;

  if ((original as any).__scrollGuardPatched) {
    return;
  }

  Scroller.prototype.resizeScrollBar = function (this: any) {
    const board = this.board;
    let rawOffset = null;
    let rawSvgRect = null;
    let rawBRect = null;

    if (board) {
      rawOffset = typeof board.offset === 'function' ? board.offset() : null;
      rawSvgRect = typeof board.getSvgDomRect === 'function' ? board.getSvgDomRect() : null;
      if (board.svgBlockGroup && typeof board.svgBlockGroup.getBoundingClientRect === 'function') {
        rawBRect = board.svgBlockGroup.getBoundingClientRect();
      }
    }

    // Print raw values returned by board functions BEFORE any clamping or fallback
    // eslint-disable-next-line no-process-env
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[ScrollGuard RAW DOM VALUES]', {
        rawOffset,
        rawSvgRect: rawSvgRect ? { width: rawSvgRect.width, height: rawSvgRect.height, top: rawSvgRect.top, left: rawSvgRect.left } : null,
        rawBRect: rawBRect ? { width: rawBRect.width, height: rawBRect.height, top: rawBRect.top, left: rawBRect.left } : null,
      });
    }

    const isBad = (v: any) => typeof v !== 'number' || !isFinite(v);

    const values = [
      rawOffset?.left,
      rawOffset?.top,
      rawSvgRect?.width,
      rawSvgRect?.height,
      rawBRect?.width,
      rawBRect?.height,
    ];

    const invalid = values.some((v) => isBad(v) || v === 0);

    if (invalid) {
      debugLog('Invalid or zero geometry detected in resizeScrollBar', {
        rawOffset,
        rawSvgRect,
        rawBRect,
        stack: new Error().stack,
      });
    }

    return original.apply(this, arguments);
  };

  (Scroller.prototype.resizeScrollBar as any).__scrollGuardPatched = true;
}

export default applyScrollGuard;
