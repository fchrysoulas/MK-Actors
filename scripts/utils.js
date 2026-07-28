export function localize(key) {
  return game.i18n.localize(`MKACTORS.${key}`);
}

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeNumber(value, fallback, { min = -Infinity, max = Infinity, step = 0 } = {}) {
  let number = numberOrFallback(value, fallback);
  if (step > 0) number = Math.round(number / step) * step;
  number = Math.min(max, Math.max(min, number));
  return Number(number.toFixed(10));
}
