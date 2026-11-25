import { MODULE_ID } from "./constants.js";
import { canImportActors } from "./actor-import.js";
import {
  createFolderImageResolver, defaultUploadFolder, importActorFolder, prepareActorFolderImport, remapFolderActorImages
} from "./actor-folder-import.js";
import { localize } from "./utils.js";
import { prepareWindowDrag } from "./window-drag.js";

export class MKActorFolderImportApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mk-actors-folder-import",
    classes: ["mk-actors-token-editor-app", "mk-actors-import-app"],
    position: { width: 520, height: 580 },
    window: { title: "MKACTORS.ImportFolder", resizable: true }
  };

  constructor({ onImport = null, onClose = null } = {}) {
    super();
    this.onImport = onImport;
    this.onClose = onClose;
    this.plan = null;
    this.readVersion = 0;
    this.loading = false;
    this.saving = false;
    this.rows = new Map();
    this.destination = defaultUploadFolder();
  }

  _prepareContext() { return { destination: this.destination }; }

  _renderHTML(context) {
    return renderTemplate(`modules/${MODULE_ID}/templates/actor-folder-import.hbs`, context);
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender(context, options) {
    super._onRender(context, options);
    this.windowDrag = prepareWindowDrag(this, this.windowDrag);
    const root = this.element?.[0] || this.element;
    const form = root.querySelector("form");
    form.addEventListener("submit", (event) => this.onSubmit(event));
    form.elements.namedItem("actorFolder").addEventListener("change", (event) => this.onFolderChange(event, form));
    form.elements.namedItem("destination").addEventListener("input", (event) => { this.destination = event.currentTarget.value; });
    root.querySelector("[data-action='cancel-import']").addEventListener("click", () => this.close());
    this.updateResults(form, { rebuild: true });
  }

  async onFolderChange(event, form) {
    if (this.saving) return;
    const version = ++this.readVersion;
    this.plan = null;
    this.loading = true;
    this.updateResults(form, { rebuild: true });
    try {
      const plan = await prepareActorFolderImport(event.currentTarget.files ?? []);
      if (version !== this.readVersion) return;
      const resolver = createFolderImageResolver(plan.images);
      for (const entry of plan.actors) entry.warnings = remapFolderActorImages(entry, resolver).warnings;
      this.plan = plan;
    } catch (error) {
      if (version === this.readVersion) ui.notifications.error(error.message);
    } finally {
      if (version === this.readVersion) {
        this.loading = false;
        this.updateResults(form, { rebuild: true });
      }
    }
  }

  updateResults(form, { rebuild = false, entry = null } = {}) {
    const plan = this.plan;
    const status = form.querySelector("[data-role='folder-status']");
    status.textContent = this.loading ? localize("ImportFolderReading") : !plan ? localize("ImportFolderSelect")
      : game.i18n.format(this.saving ? "MKACTORS.ImportFolderProgress" : "MKACTORS.ImportFolderSummary", {
        actors: plan.actors.length, images: plan.images.length, invalid: plan.invalid.length, ignored: plan.ignored,
        imported: plan.imported, uploaded: plan.uploaded
      });
    const submit = form.querySelector("[type='submit']");
    submit.disabled = this.loading || this.saving || !plan
      || ![...plan.actors, ...plan.images].some((item) => !item.actor && !item.uploadedPath);
    form.elements.namedItem("actorFolder").required = !plan;
    form.elements.namedItem("destination").disabled = this.saving || Boolean(plan?.uploaded);
    form.querySelector("[data-role='folder-target']").textContent = plan?.target ?? "";
    if (rebuild) {
      this.rows.clear();
      const list = form.querySelector("[data-role='folder-results']");
      list.replaceChildren();
      for (const item of [...(plan?.actors ?? []), ...(plan?.images ?? []), ...(plan?.invalid ?? [])]) {
        const row = list.ownerDocument.createElement("li");
        const name = list.ownerDocument.createElement("strong");
        name.textContent = item.source?.name ?? item.path;
        row.append(name, list.ownerDocument.createElement("span"));
        row.title = item.path;
        this.rows.set(item, row);
        list.append(row);
      }
    }
    for (const item of entry ? [entry] : this.rows.keys()) {
      const row = this.rows.get(item);
      if (!row) continue;
      row.classList.toggle("is-error", Boolean(item.error));
      row.lastElementChild.textContent = item.error || (item.actor || item.uploadedPath ? localize("ImportFolderDone")
        : item.warnings?.length ? localize("ImportFolderAmbiguousImage") : localize("ImportFolderReady"));
    }
  }

  async onSubmit(event) {
    event.preventDefault();
    if (this.loading || this.saving || !this.plan) return false;
    const form = event.currentTarget;
    if (!form.reportValidity()) return false;
    if (!canImportActors()) {
      ui.notifications.warn(localize("CannotImportActor"));
      return false;
    }
    this.saving = true;
    this.destination = form.elements.namedItem("destination").value;
    const importedBefore = this.plan.imported;
    const controls = Array.from(form.querySelectorAll("input, button")).filter((control) => !control.disabled);
    for (const control of controls) control.disabled = true;
    form.setAttribute("aria-busy", "true");
    this.updateResults(form);
    try {
      await importActorFolder(this.plan, {
        destination: this.destination,
        onProgress: (entry) => this.updateResults(form, { entry })
      });
      const failed = [...this.plan.actors, ...this.plan.images].filter((entry) => entry.error).length;
      ui.notifications[failed ? "warn" : "info"](game.i18n.format("MKACTORS.ImportFolderFinished", {
        actors: this.plan.imported, images: this.plan.uploaded, failed, invalid: this.plan.invalid.length
      }));
      return failed === 0;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not import Actor folder.`, error);
      ui.notifications.error(game.i18n.format("MKACTORS.ImportActorFailed", { message: error.message }));
      return false;
    } finally {
      this.saving = false;
      for (const control of controls) control.disabled = false;
      form.removeAttribute("aria-busy");
      this.updateResults(form);
      if (this.plan.imported > importedBefore) {
        try { await this.onImport?.(); }
        catch (error) {
          console.error(`${MODULE_ID} | Could not refresh after folder import.`, error);
          ui.notifications.warn(localize("LoadingFailed"));
        }
      }
    }
  }

  async close(options = {}) {
    if (this.saving) return this;
    return super.close(options);
  }

  _onClose(options) {
    this.readVersion += 1;
    this.windowDrag?.destroy();
    this.rows.clear();
    super._onClose(options);
    this.onClose?.();
  }
}
