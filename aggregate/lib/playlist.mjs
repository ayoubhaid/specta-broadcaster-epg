/** Reads the tvg-ids a playlist declares, so coverage can be reported without touching the playlist itself. */

export function tvgIdsFromM3u(text) {
  const ids = new Set();
  for (const match of String(text).matchAll(/#EXTINF[^\r\n]*?tvg-id="([^"]*)"/g)) {
    const id = match[1].trim().toLowerCase();
    if (id) ids.add(id);
  }
  return ids;
}
