import { TOKEN_SHADOW_SETTINGS } from "./constants.js";
import { debugLog } from "./debug.js";
import { drawTokenShadow, getTokenShadowAppearance } from "./token-shadows.js";
import { localize } from "./utils.js";

export class TokenShadowPreview {
  constructor(form) {
    this.form = form;
    this.canvas = form.querySelector("[data-role='shadow-preview']");
    this.status = form.querySelector("[data-role='shadow-preview-status']");
    this.values = Object.fromEntries(TOKEN_SHADOW_SETTINGS.map((field) => [field.key, field.default]));
    this.events = new AbortController();
    this.renderRequest = null;
    this.destroyed = false;
    form.addEventListener("input", (event) => this.onInput(event), { signal: this.events.signal });
    try {
      const { Renderer, Container, Graphics } = PIXI;
      this.renderer = new Renderer({ view: this.canvas, width: 480, height: 220, backgroundAlpha: 0, antialias: true });
      this.stage = new Container();
      const frame = new Graphics().lineStyle(1, 0xdda85b, 0.4).drawRect(0, 0, 100, 100);
      this.shadowState = { shadow: new Graphics(), blurFilter: null, drawState: null };
      const pawn = new Graphics().beginFill(0xf1c171).drawCircle(50, 22, 13)
        .drawRoundedRect(33, 40, 34, 34, 12).drawRoundedRect(26, 73, 48, 17, 5).endFill();
      this.stage.addChild(frame, this.shadowState.shadow, pawn);
      this.readValues();
      this.render();
    } catch (error) {
      this.destroyGraphics();
      this.canvas.hidden = true;
      this.status.textContent = localize("TokenShadowPreviewUnavailable");
      debugLog("Token shadow preview unavailable", { error });
    }
  }

  onInput(event) {
    const input = event.target;
    const key = input.dataset.shadowSlider || input.dataset.shadowValue;
    if (key) {
      const field = TOKEN_SHADOW_SETTINGS.find((setting) => setting.key === key && setting.range);
      if (!field || !input.validity.valid) return;
      const peer = this.form.elements.namedItem(input.dataset.shadowSlider ? key : `${key}Range`);
      if (peer) peer.value = input.value;
    }
    this.readValues();
    this.scheduleRender();
  }

  readValues() {
    for (const field of TOKEN_SHADOW_SETTINGS) {
      const input = this.form.elements.namedItem(field.key);
      if (input && input.validity.valid) this.values[field.key] = field.type === Boolean ? input.checked : Number(input.value);
    }
  }

  scheduleRender() {
    if (this.destroyed || !this.renderer || this.renderRequest !== null) return;
    this.renderRequest = requestAnimationFrame(() => {
      this.renderRequest = null;
      this.render();
    });
  }

  render() {
    if (this.destroyed || !this.renderer) return;
    // The isolated preview uses the same geometry and PIXI blur as Scene tokens.
    const appearance = getTokenShadowAppearance({ width: 100, height: 100, gridSize: 100 }, (key) => this.values[key]);
    drawTokenShadow(this.shadowState, appearance);
    this.shadowState.shadow.visible = this.values.tokenShadowsEnabled && appearance.alpha > 0;
    const padding = appearance.blur * 3 + 16;
    const left = Math.min(-40, appearance.x - appearance.radiusX - padding);
    const right = Math.max(140, appearance.x + appearance.radiusX + padding);
    const top = Math.min(-10, appearance.y - appearance.radiusY - padding);
    const bottom = Math.max(115, appearance.y + appearance.radiusY + padding);
    const scale = Math.min(460 / (right - left), 200 / (bottom - top), 1.3);
    this.stage.scale.set(scale);
    this.stage.position.set(240 - (left + right) * scale / 2, 110 - (top + bottom) * scale / 2);
    this.renderer.render(this.stage);
    this.status.textContent = localize(this.values.tokenShadowsEnabled ? "TokenShadowPreviewHint" : "TokenShadowPreviewDisabled");
  }

  destroyGraphics() {
    if (this.shadowState) {
      this.shadowState.shadow.filters = null;
      this.shadowState.blurFilter?.destroy();
      this.shadowState = null;
    }
    this.stage?.destroy({ children: true, texture: false, baseTexture: false });
    this.stage = null;
    this.renderer?.destroy(false);
    this.renderer = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.events.abort();
    if (this.renderRequest !== null) cancelAnimationFrame(this.renderRequest);
    this.renderRequest = null;
    this.destroyGraphics();
  }
}
