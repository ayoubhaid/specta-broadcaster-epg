/** Turns the normalised programmes of one channel into what the app will actually keep. */

export function mergeChannel(programmes, window) {
  const seen = new Set();
  const kept = [];
  for (const programme of programmes) {
    if (programme.stop <= window.from || programme.start >= window.to) continue;
    const key = `${programme.start}|${programme.stop}|${programme.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(programme);
  }
  kept.sort((a, b) => a.start - b.start || a.stop - b.stop || a.title.localeCompare(b.title));
  return kept.slice(0, window.cap);
}
