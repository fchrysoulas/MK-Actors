import { MODULE_ID } from "./constants.js";
import { getTokenShadowFields, saveTokenShadowSettings } from "./token-shadow-controls.js";
import { isShadowdarkDrawingShadows } from "./token-shadows.js";
import { localize } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";
import { TokenShadowPreview } from "./token-shadow-preview.js";

export class MKTokenShadowSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mk-actors-token-shadows",
    classes: ["mk-actors-token-editor-app", "mk-actors-token-shadow-settings-app"],
    position: { width: 460, height: 760 },
    window: { title: "MKACTORS.TokenShadowSettings", resizable: true }
  };

  _prepareContext() {
    const fields = game.user?.isGM ? getTokenShadowFields() : [];
    return {
      fields, available: fields.length > 0,
      hint: localize("TokenShadowSettingsHint"),
      unavailable: localize("TokenShadowsGMOnly"),
      notice: isShadowdarkDrawingShadows() ? localize("TokenShadowsOtherRenderer") : "",
      previewLabel: localize("TokenShadowPreview"), previewHint: localize("TokenShadowPreviewHint"),
      close: localize("Close"), save: localize("SaveAndClose")
    };
  }

  _renderHTML(context) {
    return renderTemplate(`modules/${MODULE_ID}/templates/token-shadow-settings.hbs`, context);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.windowDrag = prepareWindowDrag(this, this.windowDrag);
    const root = this.element?.[0] || this.element;
    this.shadowPreview?.destroy();
    const form = root.querySelector("form");
    this.shadowPreview = form?.querySelector("[data-role='shadow-preview']") ? new TokenShadowPreview(form) : null;
    root.querySelector("[data-action='close-shadow-settings']")?.addEventListener("click", () => this.close());
    form?.addEventListener("submit", (event) => this.onSubmit(event));
  }

  async onSubmit(event) {
    event.preventDefault();
    if (this.saving) return false;
    const form = event.currentTarget;
    if (!form.reportValidity()) return false;
    const values = Object.fromEntries(getTokenShadowFields().map((field) => {
      const input = form.elements.namedItem(field.key);
      return [field.key, field.isBoolean ? input?.checked : input?.value];
    }));
    this.saving = true;
    const controls = Array.from(form.querySelectorAll?.("input, button") ?? []).filter((input) => !input.disabled);
    for (const control of controls) control.disabled = true;
    form.setAttribute?.("aria-busy", "true");
    try {
      await saveTokenShadowSettings(values);
      await this.close();
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save token shadow settings.`, error);
      ui.notifications.error(error.message);
      return false;
    } finally {
      this.saving = false;
      for (const control of controls) control.disabled = false;
      form.removeAttribute?.("aria-busy");
    }
  }

  _onClose(options) {
    this.shadowPreview?.destroy();
    this.shadowPreview = null;
    this.windowDrag?.destroy();
    this.windowDrag = null;
    super._onClose(options);
  }
}
