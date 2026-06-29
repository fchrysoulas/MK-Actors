import { debugLog } from "./debug.js";

export async function resolveActor(uuid) {
  debugLog("Resolving Actor", { uuid });
  const document = await fromUuid(uuid);
  if (!document) {
    debugLog("Actor resolution failed", { uuid });
    return null;
  }

  if (document.documentName === "Actor" || document.constructor?.documentName === "Actor") {
    debugLog("Actor resolved", {
      uuid,
      id: document.id,
      name: document.name,
      pack: document.pack || ""
    });
    return document;
  }

  debugLog("Resolved document was not an Actor", { uuid, documentName: document.documentName });
  return null;
}
