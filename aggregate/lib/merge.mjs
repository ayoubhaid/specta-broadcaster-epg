/**
 * Consolidates one canonical channel's programmes inside the app's time window.
 * Near-identical rows from independent EPG sources are treated as duplicates
 * when title and both timestamps agree within the configured tolerance.
 */

function normalizeTitle(title) {
  return String(title ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function mergeChannel(programmes, window, toleranceSeconds = 120) {
  const kept = [];
  const byTitle = new Map();

  for (const programme of programmes) {
    if (programme.stop <= window.from || programme.start >= window.to) continue;
    const title = normalizeTitle(programme.title);
    const matches = byTitle.get(title) ?? [];
    const duplicate = matches.some(existing =>
      Math.abs(existing.start - programme.start) <= toleranceSeconds &&
      Math.abs(existing.stop - programme.stop) <= toleranceSeconds
    );
    if (duplicate) continue;

    kept.push(programme);
    matches.push(programme);
    byTitle.set(title, matches);
  }

  kept.sort((a, b) => a.start - b.start || a.stop - b.stop || a.title.localeCompare(b.title));
  return kept.slice(0, window.cap);
}
