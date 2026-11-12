import { DEFAULT_ACTOR_IMAGE, MODULE_ID } from "./constants.js";
import { canImportActors, importActor, parseActorImport } from "./actor-import.js";
import { getActorImage } from "./actor-helpers.js";
import { resolveFilePickerClass } from "./file-picker.js";
import { localize } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";

export class MKActorImportApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mk-actors-import",
    classes: ["mk-actors-token-editor-app", "mk-actors-import-app"],
    position: { width: 440, height: 560 },
    window: { title: "MKACTORS.ImportActor", resizable: true }
  };

  constructor({ onImport = null, onClose = null } = {}) {
    super();
    this.onImport = onImport;
    this.onClose = onClose;
    this.source = null;
    this.readVersion = 0;
    this.loading = false;
    this.saving = false;
    this.importedActor = null;
  }

  _prepareContext() {
    return { previewImage: DEFAULT_ACTOR_IMAGE };
  }

  _renderHTML(context) {
    return renderTemplate(`modules/${MODULE_ID}/templates/actor-import.hbs`, context);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.windowDrag = prepareWindowDrag(this, this.windowDrag);
    const root = this.element?.[0] || this.element;
    const form = root.querySelector("form");
    form.addEventListener("submit", (event) => this.onSubmit(event));
    form.elements.namedItem("actorJSON").addEventListener("change", (event) => this.onFileChange(event, form));
    form.elements.namedItem("imagePath").addEventListener("input", () => this.updatePreview(form));
    root.querySelector("[data-action='browse-import-image']").addEventListener("click", () => this.onBrowseImage(form));
    root.querySelector("[data-action='cancel-import']").addEventListener("click", () => this.close());
    const preview = form.querySelector("[data-role='import-preview']");
    preview.addEventListener("error", () => {
      if (preview.getAttribute("src") !== DEFAULT_ACTOR_IMAGE) preview.src = DEFAULT_ACTOR_IMAGE;
    });
  }

  async onFileChange(event, form) {
    if (this.saving) return;
    const version = ++this.readVersion;
    const file = event.currentTarget.files?.[0];
    this.source = null;
    this.loading = Boolean(file);
    const status = form.querySelector("[data-role='import-status']");
    status.textContent = localize(file ? "ImportActorLoading" : "ImportActorSelectFile");
    form.querySelector("[type='submit']").disabled = true;
    this.updatePreview(form);
    if (!file) return;
    try {
      const json = await file.text();
      if (version !== this.readVersion) return;
      this.source = parseActorImport(json);
      status.textContent = game.i18n.format("MKACTORS.ImportActorReady", { name: this.source.name });
    } catch (error) {
      if (version !== this.readVersion) return;
      status.textContent = error.message;
    } finally {
      if (version === this.readVersion) {
        this.loading = false;
        form.querySelector("[type='submit']").disabled = !this.source;
        this.updatePreview(form);
      }
    }
  }

  updatePreview(form) {
    const image = form.elements.namedItem("imagePath").value.trim();
    form.querySelector("[data-role='import-preview']").src = image || getActorImage(this.source);
  }

  async onBrowseImage(form) {
    if (this.saving) return;
    const FilePickerClass = resolveFilePickerClass();
    if (!FilePickerClass) {
      ui.notifications.error(localize("FilePickerUnavailable"));
      return;
    }
    const input = form.elements.namedItem("imagePath");
    try {
      const picker = new FilePickerClass({
        type: "image", current: input.value || this.source?.img || "",
        callback: (path) => {
          if (this.saving) return;
          input.value = path;
          this.updatePreview(form);
        }
      });
      await picker.browse();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not browse for an import image.`, error);
      ui.notifications.error(game.i18n.format("MKACTORS.FilePickerFailed", { message: error.message }));
    }
  }

  async onSubmit(event) {
    event.preventDefault();
    if (this.saving || this.loading || this.importedActor) return false;
    const form = event.currentTarget;
    if (!form.reportValidity() || !this.source) return false;
    if (!canImportActors()) {
      ui.notifications.warn(localize("CannotImportActor"));
      return false;
    }
    this.saving = true;
    const controls = Array.from(form.querySelectorAll("input, button")).filter((control) => !control.disabled);
    for (const control of controls) control.disabled = true;
    form.setAttribute("aria-busy", "true");
    let actor;
    try {
      actor = await importActor(this.source, { imagePath: form.elements.namedItem("imagePath").value });
      this.importedActor = actor;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not import Actor.`, error);
      ui.notifications.error(game.i18n.format("MKACTORS.ImportActorFailed", { message: error.message }));
      return false;
    } finally {
      this.saving = false;
      if (!actor) for (const control of controls) control.disabled = false;
      form.removeAttribute("aria-busy");
    }
    ui.notifications.info(game.i18n.format("MKACTORS.ActorImported", { name: actor.name }));
    await this.close();
    try {
      await this.onImport?.(actor);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not refresh the gallery after importing.`, error);
      ui.notifications.warn(localize("LoadingFailed"));
    }
    return true;
  }

  async close(options = {}) {
    if (this.saving) return this;
    return super.close(options);
  }

  _onClose(options) {
    this.readVersion += 1;
    this.windowDrag?.destroy();
    this.windowDrag = null;
    super._onClose(options);
    this.onClose?.();
  }
}
