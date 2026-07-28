import { MKActorsApp } from "./gallery-app.js";
import { debugLog } from "./debug.js";
import { resolveActor } from "./documents.js";

export class MKActorsApi {
  static app = null;

  static open() {
    debugLog("Opening gallery");
    if (!this.app) this.app = new MKActorsApp();
    this.app.render(true);
    debugLog("Gallery render requested", { appId: this.app.id });
    return this.app;
  }

  static refresh({ open = true } = {}) {
    debugLog("Refreshing gallery", { open });
    if (!this.app) return open ? this.open() : null;

    this.app.invalidateCache();
    const renderRequested = open || this.app.rendered;
    if (renderRequested) this.app.render(true);
    debugLog("Gallery cache invalidated", { appId: this.app.id, renderRequested });
    return this.app;
  }

  static async resolveActor(uuid) {
    return resolveActor(uuid);
  }
}
