export type VocalTrack = { id: string; title: string; artist: string | null; url: string };

/** Each cycle visits every song once; shuffle never repeats the last song first. */
export function vocalOrder(ids: string[], shuffle: boolean, previous?: string, random = Math.random) {
  const order = [...new Set(ids)];
  if (shuffle) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[0] === previous) {
      [order[0], order[1]] = [order[1], order[0]];
    }
  }
  return order;
}
