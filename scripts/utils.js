export function localize(key) {
  return game.i18n.localize(`MKACTORS.${key}`);
}

export function escapeHtml(value) {
  const element = document.createElement("textarea");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

export function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
