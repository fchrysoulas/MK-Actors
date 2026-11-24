import { normalizeAngle, normalizeNumber } from "./utils.js";

function rotateVector(x, y, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function getTokenImageBounds({ width, height, imageWidth, imageHeight, fit, scale, anchorX, anchorY }) {
  const sx = width / imageWidth;
  const sy = height / imageHeight;
  let fitX;
  let fitY;
  switch (fit) {
    case "fill": fitX = sx; fitY = sy; break;
    case "contain": fitX = fitY = Math.min(sx, sy); break;
    case "cover": fitX = fitY = Math.max(sx, sy); break;
    case "width": fitX = fitY = sx; break;
    default: fitX = fitY = sy;
  }
  const fittedWidth = imageWidth * fitX;
  const fittedHeight = imageHeight * fitY;
  return {
    width: fittedWidth * scale,
    height: fittedHeight * scale,
    left: width / 2 - fittedWidth * scale * anchorX,
    top: height / 2 - fittedHeight * scale * anchorY
  };
}

export class TokenImagePreview {
  constructor(form) {
    this.form = form;
    this.stage = form.querySelector("[data-role='token-preview-stage']");
    this.image = form.querySelector("[data-role='token-editor-preview']");
    this.frame = form.querySelector("[data-role='token-preview-frame']");
    this.handle = form.querySelector("[data-action='scale-token-preview']");
    this.rotationHandle = form.querySelector("[data-action='rotate-token-preview']");
    this.inputs = Object.fromEntries([
      "tokenWidth", "tokenHeight", "tokenFit", "tokenAnchorX", "tokenAnchorY", "tokenScale", "tokenScaleRange",
      "tokenRotation"
    ].map((name) => [name, form.querySelector(`[name='${name}']`)]));
    this.drag = null;
    this.renderRequest = null;
    this.destroyed = false;
    this.events = new AbortController();
    const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, {
      ...options, signal: this.events.signal
    });

    listen(form, "input", () => this.scheduleRender());
    listen(form, "change", () => this.scheduleRender());
    listen(this.image, "load", () => this.scheduleRender());
    listen(this.stage, "pointerdown", (event) => this.startDrag(event));
    listen(this.stage, "pointermove", (event) => this.moveDrag(event));
    listen(this.stage, "pointerup", (event) => {
      if (event.pointerId === this.drag?.pointerId) this.finishDrag();
    });
    for (const type of ["pointercancel", "lostpointercapture"]) {
      listen(this.stage, type, (event) => {
        if (event.pointerId === this.drag?.pointerId) this.finishDrag(true);
      });
    }
    listen(this.stage, "wheel", (event) => {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.drag) this.finishDrag();
      this.writeValues({ scale: this.readValues().scale - Math.sign(event.deltaY) * 0.05 });
    }, { passive: false });
    listen(this.stage, "keydown", (event) => this.onKeyDown(event));
    listen(form.querySelector("[data-action='reset-token-preview']"), "click", () => {
      this.finishDrag();
      this.writeValues({ anchorX: 0.5, anchorY: 0.5, scale: 1, rotation: 0 });
    });
    if (globalThis.ResizeObserver) {
      this.observer = new ResizeObserver(() => this.scheduleRender());
      this.observer.observe(this.stage);
    }
    this.render();
  }

  readValues() {
    const value = (name) => this.inputs[name]?.value;
    return {
      width: normalizeNumber(value("tokenWidth"), 1, { min: 0.5, step: 0.5 }),
      height: normalizeNumber(value("tokenHeight"), 1, { min: 0.5, step: 0.5 }),
      fit: value("tokenFit") || "height",
      anchorX: normalizeNumber(value("tokenAnchorX"), 0.5, { min: 0, max: 1 }),
      anchorY: normalizeNumber(value("tokenAnchorY"), 0.5, { min: 0, max: 1 }),
      scale: normalizeNumber(value("tokenScale"), 1, { min: 0.2, max: 3, step: 0.05 }),
      rotation: normalizeAngle(value("tokenRotation"))
    };
  }

  writeValues(values) {
    for (const [key, value] of Object.entries(values)) {
      const isScale = key === "scale";
      const number = key === "rotation" ? normalizeAngle(value) : normalizeNumber(value, isScale ? 1 : 0.5, {
        min: isScale ? 0.2 : 0, max: isScale ? 3 : 1, step: isScale ? 0.05 : 0.001
      });
      const name = isScale ? "tokenScale" : `token${key[0].toUpperCase()}${key.slice(1)}`;
      this.inputs[name].value = String(number);
      if (isScale) this.inputs.tokenScaleRange.value = String(number);
    }
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.destroyed || this.renderRequest !== null) return;
    if (!globalThis.requestAnimationFrame) {
      this.render();
      return;
    }
    this.renderRequest = requestAnimationFrame(() => {
      this.renderRequest = null;
      this.render();
    });
  }

  render() {
    if (this.renderRequest !== null) {
      globalThis.cancelAnimationFrame?.(this.renderRequest);
      this.renderRequest = null;
    }
    if (this.destroyed) return;
    const stageWidth = this.stage.clientWidth;
    const stageHeight = this.stage.clientHeight;
    if (!stageWidth || !stageHeight) return;
    const values = this.readValues();
    const unit = Math.min(stageWidth * 0.65 / values.width, stageHeight * 0.65 / values.height);
    const width = values.width * unit;
    const height = values.height * unit;
    const left = (stageWidth - width) / 2;
    const top = (stageHeight - height) / 2;
    const bounds = getTokenImageBounds({
      ...values, width, height,
      imageWidth: this.image.naturalWidth || 1,
      imageHeight: this.image.naturalHeight || 1
    });
    Object.assign(this.frame.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    this.frame.style.setProperty("--mk-preview-grid-size", `${unit}px`);
    Object.assign(this.image.style, {
      left: `${left + bounds.left}px`, top: `${top + bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
      transformOrigin: `${values.anchorX * 100}% ${values.anchorY * 100}%`,
      transform: `rotate(${values.rotation}deg)`
    });

    // Use the corner furthest from the texture anchor so resizing stays usable at anchor 0 or 1.
    const cornerX = values.anchorX <= 0.5 ? 1 : 0;
    const cornerY = values.anchorY <= 0.5 ? 1 : 0;
    const centerX = stageWidth / 2;
    const centerY = stageHeight / 2;
    const corner = rotateVector((cornerX - values.anchorX) * bounds.width,
      (cornerY - values.anchorY) * bounds.height, values.rotation);
    const handleX = centerX + corner.x;
    const handleY = centerY + corner.y;
    Object.assign(this.handle.style, {
      left: `${Math.max(14, Math.min(stageWidth - 14, handleX))}px`,
      top: `${Math.max(14, Math.min(stageHeight - 14, handleY))}px`,
      cursor: cornerX === cornerY ? "nwse-resize" : "nesw-resize"
    });
    const rotationPoint = rotateVector((0.5 - values.anchorX) * bounds.width,
      -values.anchorY * bounds.height - 24, values.rotation);
    const rotationX = Math.max(16, Math.min(stageWidth - 16, centerX + rotationPoint.x));
    let rotationY = Math.max(16, Math.min(stageHeight - 16, centerY + rotationPoint.y));
    if (Math.hypot(rotationX - Number.parseFloat(this.handle.style.left),
      rotationY - Number.parseFloat(this.handle.style.top)) < 36) {
      rotationY = Number.parseFloat(this.handle.style.top) + (handleY > centerY ? -36 : 36);
      rotationY = Math.max(16, Math.min(stageHeight - 16, rotationY));
    }
    Object.assign(this.rotationHandle.style, { left: `${rotationX}px`, top: `${rotationY}px` });
    const resize = rotateVector((cornerX - values.anchorX) * bounds.width / values.scale,
      (cornerY - values.anchorY) * bounds.height / values.scale, values.rotation);
    this.layout = {
      ...bounds, centerX, centerY,
      resizeX: resize.x, resizeY: resize.y
    };
  }

  startDrag(event) {
    if (event.button !== 0 || this.drag || this.destroyed) return;
    const scaling = this.handle.contains(event.target);
    const rotating = this.rotationHandle.contains(event.target);
    if (!scaling && !rotating && event.target !== this.image) return;
    this.render();
    if (!this.layout) return;
    event.preventDefault();
    event.stopPropagation();
    this.stage.focus({ preventScroll: true });
    const rect = this.stage.getBoundingClientRect();
    this.drag = {
      ...this.readValues(), ...this.layout, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, scaling, rotating,
      pixelScaleX: this.stage.clientWidth / rect.width,
      pixelScaleY: this.stage.clientHeight / rect.height,
      centerX: rect.left + this.layout.centerX * rect.width / this.stage.clientWidth,
      centerY: rect.top + this.layout.centerY * rect.height / this.stage.clientHeight
    };
    this.drag.pointerAngle = Math.atan2((event.clientY - this.drag.centerY) * this.drag.pixelScaleY,
      (event.clientX - this.drag.centerX) * this.drag.pixelScaleX);
    this.drag.angle = this.drag.rotation;
    this.stage.classList.add("is-dragging");
    this.stage.setPointerCapture(event.pointerId);
  }

  moveDrag(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.x) * drag.pixelScaleX;
    const dy = (event.clientY - drag.y) * drag.pixelScaleY;
    if (drag.rotating) {
      const x = (event.clientX - drag.centerX) * drag.pixelScaleX;
      const y = (event.clientY - drag.centerY) * drag.pixelScaleY;
      if (Math.hypot(x, y) < 4) return;
      const angle = Math.atan2(y, x);
      const delta = angle - drag.pointerAngle;
      drag.angle += Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
      drag.pointerAngle = angle;
      this.writeValues({ rotation: event.shiftKey ? Math.round(drag.angle / 15) * 15 : drag.angle });
    } else if (drag.scaling) {
      const distanceSquared = drag.resizeX ** 2 + drag.resizeY ** 2;
      this.writeValues({ scale: drag.scale + (dx * drag.resizeX + dy * drag.resizeY) / distanceSquared });
    } else {
      const movement = rotateVector(dx, dy, -drag.rotation);
      this.writeValues({ anchorX: drag.anchorX - movement.x / drag.width,
        anchorY: drag.anchorY - movement.y / drag.height });
    }
  }

  finishDrag(cancel = false) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.stage.classList.remove("is-dragging");
    if (cancel) this.writeValues({ anchorX: drag.anchorX, anchorY: drag.anchorY, scale: drag.scale,
      rotation: drag.rotation });
    if (this.stage.hasPointerCapture(drag.pointerId)) this.stage.releasePointerCapture(drag.pointerId);
  }

  onKeyDown(event) {
    if (event.key === "Escape" && this.drag) {
      event.preventDefault();
      event.stopPropagation();
      this.finishDrag(true);
      return;
    }
    const { anchorX, anchorY, scale, rotation } = this.readValues();
    const step = event.shiftKey ? 0.05 : 0.01;
    const move = (x, y) => {
      const offset = rotateVector(x, y, -rotation);
      return { anchorX: anchorX - offset.x, anchorY: anchorY - offset.y };
    };
    const key = ({ BracketLeft: "[", BracketRight: "]" })[event.code] || event.key;
    const changes = {
      ArrowLeft: move(-step, 0), ArrowRight: move(step, 0),
      ArrowUp: move(0, -step), ArrowDown: move(0, step),
      "[": { rotation: rotation - (event.shiftKey ? 15 : 1) },
      "]": { rotation: rotation + (event.shiftKey ? 15 : 1) },
      "+": { scale: scale + 0.05 }, "=": { scale: scale + 0.05 }, "-": { scale: scale - 0.05 }
    }[key];
    if (!changes) return;
    event.preventDefault();
    event.stopPropagation();
    this.finishDrag();
    this.writeValues(changes);
  }

  destroy() {
    this.finishDrag();
    this.destroyed = true;
    if (this.renderRequest !== null) {
      globalThis.cancelAnimationFrame?.(this.renderRequest);
      this.renderRequest = null;
    }
    this.events.abort();
    this.observer?.disconnect();
  }
}
