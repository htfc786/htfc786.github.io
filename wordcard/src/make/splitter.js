/* ============================================================
 * splitter.js —— 设置区 / 预览区之间的可拖拽中线
 * 宽度保存在 localStorage，双击恢复 420px，支持键盘方向键。
 * ============================================================ */
import { clamp } from '../core/dom.js';
import { loadUI, patchUI } from '../core/storage.js';

export function createSplitter({ layout, settingsPane, handle, onChange }) {
  const ui = loadUI();
  let width = clamp(Number(ui.split) || 420, 320, 720);
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  let rafId = 0;

  function maxWidth() {
    return Math.max(320, Math.min(720, window.innerWidth * 0.55));
  }

  function applyWidth() {
    width = clamp(width, 320, maxWidth());
    layout.style.setProperty('--settings-w', width + 'px');
    handle.setAttribute('aria-valuenow', String(Math.round(width)));
    handle.setAttribute('aria-valuemax', String(Math.round(maxWidth())));
  }

  function queueRefit() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      applyWidth();
      onChange?.();
    });
  }

  applyWidth();

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startWidth = settingsPane.offsetWidth;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    event.preventDefault();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    width = clamp(startWidth + event.clientX - startX, 320, maxWidth());
    queueRefit();
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
    if (event?.pointerId !== undefined && handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    patchUI({ split: Math.round(settingsPane.offsetWidth) });
    onChange?.();
  }

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  handle.addEventListener('dblclick', () => {
    width = 420;
    applyWidth();
    patchUI({ split: 420 });
    onChange?.();
  });

  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === 'ArrowLeft') width -= step;
    else if (event.key === 'ArrowRight') width += step;
    else if (event.key === 'Home') width = 320;
    else if (event.key === 'End') width = maxWidth();
    else return;
    event.preventDefault();
    applyWidth();
    patchUI({ split: Math.round(width) });
    onChange?.();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) applyWidth();
  });

  return { applyWidth, getWidth: () => width };
}
