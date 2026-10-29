import { debugLog } from "./debug.js";

export async function resolveActor(uuid) {
  debugLog("Resolving Actor", { uuid });
  if (typeof uuid !== "string" || !uuid) return null;

  let document;
  try {
    document = await fromUuid(uuid);
  } catch (error) {
    debugLog("Actor resolution failed", { uuid, error });
    return null;
  }
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
