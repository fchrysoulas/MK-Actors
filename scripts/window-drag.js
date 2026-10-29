export class WindowDragController {
  constructor(app, element, header) {
    this.app = app;
    this.element = element;
    this.header = header;
    this.view = element.ownerDocument.defaultView;
    this.drag = null;
    this.frame = null;
    this.events = new AbortController();
    const listen = (target, type, callback) => target.addEventListener(type, callback, {
      capture: true, signal: this.events.signal
    });
    listen(header, "pointerdown", (event) => this.start(event));
    listen(this.view, "pointermove", (event) => this.move(event));
    listen(this.view, "pointerup", (event) => {
      if (event.pointerId !== this.drag?.id) return;
      this.updateTarget(event);
      this.finish();
    });
    for (const type of ["pointercancel", "lostpointercapture"]) {
      listen(header, type, (event) => {
        if (event.pointerId === this.drag?.id) this.finish(true);
      });
    }
    listen(this.view, "blur", (event) => {
      if (event.target === this.view) this.finish(true);
    });
    listen(this.view, "resize", (event) => {
      if (event.target === this.view) this.finish();
    });
    listen(this.view, "keydown", (event) => {
      if (event.key !== "Escape" || !this.drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finish(true);
    });
  }

  start(event) {
    if (event.button !== 0 || this.drag || event.detail > 1 || event.isPrimary === false
      || (event.pointerType && event.pointerType !== "mouse")
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || this.app.minimized || this.element.classList.contains("minimizing")
      || this.element.classList.contains("maximizing")
      || event.target.closest?.("button, a, input, select, textarea, .header-control")) return;
    const bounds = this.element.getBoundingClientRect();
    const viewport = this.element.ownerDocument.documentElement;
    try {
      this.header.setPointerCapture(event.pointerId);
    } catch (_error) {
      return;
    }
    this.drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      left: this.app.position?.left ?? bounds.left,
      top: this.app.position?.top ?? bounds.top,
      minX: -bounds.left, maxX: Math.max(0, viewport.clientWidth - bounds.width) - bounds.left,
      minY: -bounds.top, maxY: Math.max(0, viewport.clientHeight - bounds.height) - bounds.top,
      transform: this.element.style.transform || "", dx: 0, dy: 0, moved: false
    };
    event.stopImmediatePropagation();
    this.app.bringToFront?.();
  }

  updateTarget(event) {
    const drag = this.drag;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    drag.moved = true;
    drag.dx = Math.max(drag.minX, Math.min(drag.maxX, dx));
    drag.dy = Math.max(drag.minY, Math.min(drag.maxY, dy));
  }

  move(event) {
    if (event.pointerId !== this.drag?.id) return;
    this.updateTarget(event);
    if (!this.drag.moved) return;
    event.preventDefault();
    this.element.classList.add("is-window-dragging");
    if (this.frame !== null) return;
    if (!this.view.requestAnimationFrame) this.paint();
    else this.frame = this.view.requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  paint() {
    if (!this.drag) return;
    const { dx, dy, transform } = this.drag;
    this.element.style.transform = `translate3d(${dx}px, ${dy}px, 0) ${transform}`.trim();
  }

  finish(cancel = false) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (this.frame !== null) {
      this.view.cancelAnimationFrame?.(this.frame);
      this.frame = null;
    }
    this.element.style.transform = drag.transform;
    this.element.classList.remove("is-window-dragging");
    if (this.header.hasPointerCapture(drag.id)) this.header.releasePointerCapture(drag.id);
    // Foundry validates and commits the final position using its public API.
    if (drag.moved && !cancel && this.element.isConnected !== false) {
      this.app.setPosition({ left: drag.left + drag.dx, top: drag.top + drag.dy });
    }
  }

  destroy() {
    this.finish(true);
    this.events.abort();
  }
}

export function prepareWindowDrag(app, current) {
  const element = app.element?.[0] || app.element;
  if (current?.element === element) return current;
  current?.destroy();
  const header = element?.querySelector?.(".window-header");
  if (!header?.setPointerCapture || !header.hasPointerCapture || !header.releasePointerCapture
    || !element.ownerDocument?.defaultView || typeof app.setPosition !== "function") return null;
  return new WindowDragController(app, element, header);
}
