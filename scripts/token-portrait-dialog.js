import { MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { localize, normalizeNumber } from "./utils.js";

export function resolveFilePickerClass() {
  let legacyBinding = null;
  try {
    if (typeof FilePicker !== "undefined") legacyBinding = FilePicker;
  } catch (_err) {
    // The v12 compatibility global is unavailable.
  }

  const queue = [
    legacyBinding,
    globalThis.FilePicker,
    globalThis.foundry?.applications?.apps?.FilePicker
  ];
  const visited = new Set();

  while (queue.length) {
    const candidate = queue.shift();
    if (candidate == null || visited.has(candidate)) continue;
    visited.add(candidate);

    if (typeof candidate === "function") {
      try {
        Reflect.construct(Object, [], candidate);
        return candidate;
      } catch (_err) {
        // Continue unwrapping non-constructable function exports.
      }
    }

    if (typeof candidate !== "object" && typeof candidate !== "function") continue;
    for (const key of ["implementation", "FilePicker", "default"]) {
      try {
        if (candidate[key] != null) queue.push(candidate[key]);
      } catch (_err) {
        // Ignore inaccessible export properties and try the remaining shapes.
      }
    }
  }

  return null;
}

export async function openTokenPortraitDialog(actor, { onUpdated = null } = {}) {
  const prototypeToken = actor.prototypeToken;
  const portraitImage = actor.img ?? "";
  const width = prototypeToken?.width ?? 1;
  const height = prototypeToken?.height ?? 1;
  const fit = prototypeToken?.texture?.fit || "height";
  const anchorX = prototypeToken?.texture?.anchorX ?? 0.5;
  const anchorY = prototypeToken?.texture?.anchorY ?? 0.5;
  const scale = prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1;
  const actorName = actor.name || localize("UnnamedActor");
  const fitOptions = [
    { value: "contain", label: localize("FitContain") },
    { value: "cover", label: localize("FitCover") },
    { value: "fill", label: localize("FitFill") },
    { value: "height", label: localize("FitHeight") },
    { value: "width", label: localize("FitWidth") }
  ].map((option) => ({
    ...option,
    selected: option.value === fit
  }));

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/token-portrait-dialog.hbs`, {
    portraitImage,
    width,
    height,
    fitOptions,
    anchorX,
    anchorY,
    scale,
    labels: {
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
      scaleRatio: localize("ScaleRatio")
    }
  });

  debugLog("Opening token portrait dialog", {
    actorId: actor.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    portraitImage,
    tokenImage: prototypeToken?.texture?.src || "",
    width,
    height,
    fit,
    anchorX,
    anchorY,
    scale
  });

  const DialogV2 = foundry.applications.api.DialogV2;
  const allowedFits = new Set(fitOptions.map((option) => option.value));
  const dialog = new DialogV2({
    classes: ["mk-actors-token-dialog"],
    window: {
      title: `${localize("TokenPortraitDialogTitle")}: ${actorName}`
    },
    content,
    modal: true,
    form: {
      closeOnSubmit: false
    },
    buttons: [
      {
        action: "apply",
        icon: "fas fa-check",
        label: localize("Apply"),
        default: true,
        callback: async (_event, button, dialogElement) => {
          const form = button.form;
          if (!form?.reportValidity()) return false;

          const portraitImg = String(form.querySelector("#mk-portrait-img")?.value ?? "").trim();
          const tokenWidth = normalizeNumber(
            form.querySelector("#mk-token-width")?.value,
            width,
            { min: 0.5, step: 0.5 }
          );
          const tokenHeight = normalizeNumber(
            form.querySelector("#mk-token-height")?.value,
            height,
            { min: 0.5, step: 0.5 }
          );
          const requestedFit = String(form.querySelector("#mk-token-fit")?.value ?? fit);
          const tokenFit = allowedFits.has(requestedFit) ? requestedFit : "height";
          const tokenAnchorX = normalizeNumber(
            form.querySelector("#mk-token-anchor-x")?.value,
            anchorX,
            { min: 0, max: 1 }
          );
          const tokenAnchorY = normalizeNumber(
            form.querySelector("#mk-token-anchor-y")?.value,
            anchorY,
            { min: 0, max: 1 }
          );
          const tokenScale = normalizeNumber(
            form.querySelector("#mk-token-scale")?.value,
            scale,
            { min: 0.2, max: 3, step: 0.05 }
          );

          if (!portraitImg) {
            debugLog("Token portrait update blocked: image path required", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.warn(localize("ImagePathRequired"));
            return false;
          }

          const updates = {
            img: portraitImg,
            "prototypeToken.width": tokenWidth,
            "prototypeToken.height": tokenHeight,
            "prototypeToken.texture.fit": tokenFit,
            "prototypeToken.texture.anchorX": tokenAnchorX,
            "prototypeToken.texture.anchorY": tokenAnchorY,
            "prototypeToken.texture.scaleX": tokenScale,
            "prototypeToken.texture.scaleY": tokenScale
          };

          try {
            debugLog("Updating Actor from token portrait dialog", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              updates
            });
            await actor.update(updates, { mkActorsForcePortraitToTokenImage: true });
            if (onUpdated) await onUpdated();
            debugLog("Actor updated from token portrait dialog", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.info(game.i18n.format("MKACTORS.TokenPortraitUpdated", { name: actor.name }));
            await dialogElement.close();
            return true;
          } catch (err) {
            debugLog("Token portrait update failed", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              error: err
            });
            console.error(err);
            ui.notifications.error(game.i18n.format("MKACTORS.TokenPortraitUpdateFailed", {
              message: err.message ?? err
            }));
            return false;
          }
        }
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: localize("Cancel"),
        callback: async (_event, _button, dialogElement) => {
          await dialogElement.close();
          return null;
        }
      }
    ]
  });

  await dialog.render({ force: true });

  const root = dialog.element;
  const portraitInput = root.querySelector?.("#mk-portrait-img");
  const scaleRange = root.querySelector?.("#mk-token-scale-range");
  const scaleInput = root.querySelector?.("#mk-token-scale");

  root.querySelector?.("#mk-browse-portrait")?.addEventListener("click", async () => {
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
          debugLog("Token portrait image selected", {
            actorId: actor.id,
            actorUuid: actor.uuid,
            path
          });
        }
      });
      await picker.browse();
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.format("MKACTORS.FilePickerFailed", {
        message: err.message ?? err
      }));
    }
  });

  scaleRange?.addEventListener("input", () => {
    if (scaleInput) scaleInput.value = scaleRange.value;
  });

  scaleInput?.addEventListener("input", () => {
    if (scaleRange) scaleRange.value = scaleInput.value;
  });

  return dialog;
}
