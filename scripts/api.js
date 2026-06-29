import { MKActorsApp } from "./gallery-app.js";
import { debugLog } from "./debug.js";
import { resolveActor } from "./documents.js";

export class MKActorsApi {
  static app = null;

  static open() {
    debugLog("Opening gallery");
    if (!this.app) this.app = new MKActorsApp();
    this.app.render(true);
    debugLog("Gallery render requested", { appId: this.app.appId });
    return this.app;
  }

  static refresh() {
    debugLog("Refreshing gallery");
    if (!this.app) return this.open();
    this.app.invalidateCache();
    this.app.render(true);
    debugLog("Gallery cache invalidated and render requested", { appId: this.app.appId });
    return this.app;
  }

  static async resolveActor(uuid) {
    return resolveActor(uuid);
  }
}
