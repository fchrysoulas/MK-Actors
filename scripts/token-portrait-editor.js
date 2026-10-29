import { DEFAULT_ACTOR_IMAGE, MODULE_ID } from "./constants.js";
import { canModifyActor } from "./actor-helpers.js";
import { resolveActor } from "./documents.js";
import { resolveFilePickerClass } from "./file-picker.js";
import { TokenImagePreview } from "./token-preview.js";
import { localize, normalizeNumber } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";

export class MKTokenPortraitEditor extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["mk-actors-token-editor-app"],
    position: { width: 420, height: 740 },
    window: { title: "MKACTORS.TokenPortraitEditorTitle", resizable: true }
  };

  constructor(actor, { onApply = null, onClose = null } = {}) {
    super({ id: `mk-actors-token-editor-${actor.uuid.replace(/[^a-zA-Z0-9_-]/g, "-")}` });
    this.actor = actor;
    this.onApply = onApply;
    this.onClose = onClose;
    this.preview = null;
  }

  get title() {
    return `${localize("TokenPortraitEditorTitle")}: ${this.actor.name || localize("UnnamedActor")}`;
  }

  async _prepareContext() {
    return { id: this.id, editor: this.buildTokenEditorData(this.actor) };
  }

  async _renderHTML(context, _options) {
    return renderTemplate(`modules/${MODULE_ID}/templates/token-portrait-editor.hbs`, context);
  }

  _replaceHTML(result, content, _options) {
    this.preview?.destroy();
    this.preview = null;
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.windowDrag = prepareWindowDrag(this, this.windowDrag);
    this.activateListeners(this.element);
  }

  _onClose(options) {
    this.windowDrag?.destroy();
    this.windowDrag = null;
    this.preview?.destroy();
    this.preview = null;
    super._onClose(options);
    this.onClose?.();
  }

  buildTokenEditorData(actor) {
    const prototypeToken = actor.prototypeToken;
    const fit = prototypeToken?.texture?.fit || "height";
    const fits = [
      ["contain", "FitContain"],
      ["cover", "FitCover"],
      ["fill", "FitFill"],
      ["height", "FitHeight"],
      ["width", "FitWidth"]
    ];

    return {
      uuid: actor.uuid,
      name: actor.name || localize("UnnamedActor"),
      portraitImage: actor.img ?? "",
      previewImage: actor.img || DEFAULT_ACTOR_IMAGE,
      width: prototypeToken?.width ?? 1,
      height: prototypeToken?.height ?? 1,
      fitOptions: fits.map(([value, label]) => ({
        value,
        label: localize(label),
        selected: value === fit
      })),
      anchorX: prototypeToken?.texture?.anchorX ?? 0.5,
      anchorY: prototypeToken?.texture?.anchorY ?? 0.5,
      scale: prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1,
      labels: {
        title: localize("TokenPortraitEditorTitle"),
        preview: localize("TokenPreview"),
        previewHint: localize("TokenPreviewHint"),
        previewControls: localize("TokenPreviewControls"),
        scalePreview: localize("ScaleTokenPreview"),
        resetPreview: localize("ResetTokenPreview"),
        cancel: localize("Cancel"),
        imagePath: localize("ImagePath"),
        browseImage: localize("BrowseImage"),
        imagePathPortraitNote: localize("ImagePathPortraitNote"),
        dimensionsGridSpaces: localize("DimensionsGridSpaces"),
        width: localize("Width"),
        height: localize("Height"),
        fitModeHeightNote: localize("FitModeHeightNote"),
        imageFitMode: localize("ImageFitMode"),
        imageFitModeHint: localize("ImageFitModeHint"),
        anchor: localize("Anchor"),
        x: localize("X"),
        y: localize("Y"),
        anchorHint: localize("AnchorHint"),
        scaleRatio: localize("ScaleRatio"),
        saveAndClose: localize("SaveAndClose")
      }
    };
  }

  activateListeners(html) {
    const root = html?.[0] || html;
    root.querySelector?.("[data-action='close-token-editor']")?.addEventListener("click", () => this.close());
    root.querySelector?.("[data-action='browse-token-image']")?.addEventListener(
      "click",
      this.onBrowseTokenImage.bind(this)
    );

    root.querySelector?.("[data-action='token-editor-form']")?.addEventListener(
      "submit",
      this.onTokenEditorSubmit.bind(this)
    );

    const scaleRange = root.querySelector?.("[name='tokenScaleRange']");
    const scaleInput = root.querySelector?.("[name='tokenScale']");
    const portraitInput = root.querySelector?.("[name='portraitImg']");
    const portraitPreview = root.querySelector?.("[data-role='token-editor-preview']");

    scaleRange?.addEventListener("input", () => {
      if (scaleInput) scaleInput.value = scaleRange.value;
    });
    scaleInput?.addEventListener("input", () => {
      if (scaleRange) scaleRange.value = scaleInput.value;
    });
    portraitInput?.addEventListener("input", () => {
      if (portraitPreview) portraitPreview.src = portraitInput.value.trim() || DEFAULT_ACTOR_IMAGE;
    });
    portraitPreview?.addEventListener("error", (event) => {
      if (event.currentTarget.getAttribute("src") !== DEFAULT_ACTOR_IMAGE) {
        event.currentTarget.src = DEFAULT_ACTOR_IMAGE;
      }
    });
    this.preview?.destroy();
    const form = root.querySelector?.("[data-action='token-editor-form']");
    this.preview = form?.querySelector?.("[data-role='token-preview-stage']") ? new TokenImagePreview(form) : null;
  }

  async onBrowseTokenImage(event) {
    event.preventDefault();
    event.stopPropagation();

    const form = event.currentTarget.closest?.("form");
    const portraitInput = form?.querySelector("[name='portraitImg']");
    const portraitPreview = form?.querySelector("[data-role='token-editor-preview']");
    const FilePickerClass = resolveFilePickerClass();

    if (!FilePickerClass) {
      console.error("MK Actors | No compatible Foundry FilePicker constructor is available.");
      ui.notifications.error(localize("FilePickerUnavailable"));
      return;
    }

    try {
      const picker = new FilePickerClass({
        type: "image",
        current: portraitInput?.value || "",
        callback: (path) => {
          if (portraitInput) portraitInput.value = path;
          if (portraitPreview) portraitPreview.src = path;
        }
      });
      await picker.browse();
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("MKACTORS.FilePickerFailed", {
        message: err.message ?? err
      }));
    }
  }

  async onTokenEditorSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form?.reportValidity()) return false;

    const actor = await resolveActor(this.actor.uuid);
    if (!actor) {
      ui.notifications.warn(localize("CannotResolveActor"));
      await this.close();
      return false;
    }
    if (!canModifyActor(actor)) {
      ui.notifications.warn(localize("CannotModifyActor"));
      return false;
    }

    const prototypeToken = actor.prototypeToken;
    const currentFit = prototypeToken?.texture?.fit || "height";
    const portraitImg = String(form.querySelector("[name='portraitImg']")?.value ?? "").trim();
    const requestedFit = String(form.querySelector("[name='tokenFit']")?.value ?? currentFit);
    const allowedFits = new Set(["contain", "cover", "fill", "height", "width"]);

    if (!portraitImg) {
      ui.notifications.warn(localize("ImagePathRequired"));
      return false;
    }

    const updates = {
      img: portraitImg,
      "prototypeToken.width": normalizeNumber(
        form.querySelector("[name='tokenWidth']")?.value,
        prototypeToken?.width ?? 1,
        { min: 0.5, step: 0.5 }
      ),
      "prototypeToken.height": normalizeNumber(
        form.querySelector("[name='tokenHeight']")?.value,
        prototypeToken?.height ?? 1,
        { min: 0.5, step: 0.5 }
      ),
      "prototypeToken.texture.fit": allowedFits.has(requestedFit) ? requestedFit : "height",
      "prototypeToken.texture.anchorX": normalizeNumber(
        form.querySelector("[name='tokenAnchorX']")?.value,
        prototypeToken?.texture?.anchorX ?? 0.5,
        { min: 0, max: 1 }
      ),
      "prototypeToken.texture.anchorY": normalizeNumber(
        form.querySelector("[name='tokenAnchorY']")?.value,
        prototypeToken?.texture?.anchorY ?? 0.5,
        { min: 0, max: 1 }
      ),
      "prototypeToken.texture.scaleX": normalizeNumber(
        form.querySelector("[name='tokenScale']")?.value,
        prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1,
        { min: 0.2, max: 3, step: 0.05 }
      )
    };
    updates["prototypeToken.texture.scaleY"] = updates["prototypeToken.texture.scaleX"];

    try {
      await actor.update(updates, { mkActorsForcePortraitToTokenImage: true });
      this.actor = actor;
      await this.onApply?.();
      ui.notifications.info(game.i18n.format("MKACTORS.TokenPortraitUpdated", { name: actor.name }));
      await this.close();
      return true;
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("MKACTORS.TokenPortraitUpdateFailed", {
        message: err.message ?? err
      }));
      return false;
    }
  }
}
