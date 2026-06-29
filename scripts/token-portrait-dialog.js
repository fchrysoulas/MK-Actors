import { MODULE_ID } from "./constants.js";
import { debugLog } from "./debug.js";
import { escapeHtml, localize, numberOrFallback } from "./utils.js";

export async function openTokenPortraitDialog(actor, { onUpdated = null } = {}) {
  const prototypeToken = actor.prototypeToken;
  const portraitImage = actor.img ?? "";
  const width = prototypeToken?.width ?? 1;
  const height = prototypeToken?.height ?? 1;
  const fit = prototypeToken?.texture?.fit || "height";
  const anchorX = prototypeToken?.texture?.anchorX ?? 0.5;
  const anchorY = prototypeToken?.texture?.anchorY ?? 0.5;
  const scale = prototypeToken?.texture?.scaleX ?? prototypeToken?.texture?.scaleY ?? 1;
  const actorName = escapeHtml(actor.name || localize("UnnamedActor"));
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

  new Dialog({
    title: `${localize("TokenPortraitDialogTitle")}: ${actorName}`,
    content,
    buttons: {
      apply: {
        icon: '<i class="fas fa-check"></i>',
        label: localize("Apply"),
        callback: async (html) => {
          const portraitImg = String(html.find("#mk-portrait-img").val() ?? "").trim();
          const tokenWidth = numberOrFallback(html.find("#mk-token-width").val(), width);
          const tokenHeight = numberOrFallback(html.find("#mk-token-height").val(), height);
          const tokenFit = String(html.find("#mk-token-fit").val() ?? "height");
          const tokenAnchorX = numberOrFallback(html.find("#mk-token-anchor-x").val(), anchorX);
          const tokenAnchorY = numberOrFallback(html.find("#mk-token-anchor-y").val(), anchorY);
          const tokenScale = numberOrFallback(html.find("#mk-token-scale").val(), scale);

          if (!portraitImg) {
            debugLog("Token portrait update blocked: image path required", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.warn(localize("ImagePathRequired"));
            return;
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
            if (onUpdated) onUpdated();
            debugLog("Actor updated from token portrait dialog", {
              actorId: actor.id,
              actorUuid: actor.uuid
            });
            ui.notifications.info(game.i18n.format("MKACTORS.TokenPortraitUpdated", { name: actor.name }));
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
          }
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: localize("Cancel")
      }
    },
    render: (html) => {
      const portraitInput = html.find("#mk-portrait-img")[0];
      const scaleRange = html.find("#mk-token-scale-range")[0];
      const scaleInput = html.find("#mk-token-scale")[0];

      html.find("#mk-browse-portrait").on("click", () => {
        new FilePicker({
          type: "image",
          current: portraitInput.value || "",
          callback: (path) => {
            portraitInput.value = path;
            debugLog("Token portrait image selected", {
              actorId: actor.id,
              actorUuid: actor.uuid,
              path
            });
          }
        }).browse();
      });

      scaleRange?.addEventListener("input", () => {
        scaleInput.value = scaleRange.value;
      });

      scaleInput?.addEventListener("input", () => {
        scaleRange.value = scaleInput.value;
      });
    },
    default: "apply"
  }).render(true);
}
