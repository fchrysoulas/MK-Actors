import { MK_SHADOWDARK_ID, MODULE_ID } from "./constants.js";
import { getTokenShadowFields, saveTokenShadowSettings } from "./shadowdark-integration.js";
import { localize } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";

export class MKTokenShadowSettings extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mk-actors-token-shadows",
    classes: ["mk-actors-token-editor-app", "mk-actors-token-shadow-settings-app"],
    position: { width: 420, height: 680 },
    window: { title: "MKACTORS.TokenShadowSettings", resizable: true }
  };

  _prepareContext() {
    const fields = game.user?.isGM ? getTokenShadowFields() : [];
    return {
      fields, available: fields.length > 0,
      hint: localize("TokenShadowSettingsHint"),
      unavailable: localize(!game.user?.isGM ? "TokenShadowsGMOnly"
        : game.modules?.get?.(MK_SHADOWDARK_ID)?.active ? "TokenShadowsSettingsRequired" : "TokenShadowsModuleRequired"),
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
    root.querySelector("[data-action='close-shadow-settings']")?.addEventListener("click", () => this.close());
    root.querySelector("form")?.addEventListener("submit", (event) => this.onSubmit(event));
  }

  async onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return false;
    const values = Object.fromEntries(getTokenShadowFields().map((field) => {
      const input = form.elements.namedItem(field.key);
      return [field.key, field.isBoolean ? input?.checked : input?.value];
    }));
    try {
      await saveTokenShadowSettings(values);
      await this.close();
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save shared token shadow settings.`, error);
      ui.notifications.error(error.message);
      return false;
    }
  }

  _onClose(options) {
    this.windowDrag?.destroy();
    this.windowDrag = null;
    super._onClose(options);
  }
}
