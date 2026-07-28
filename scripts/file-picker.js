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
