/**
 * XMLTV output for the app-facing feed.
 *
 * The app reads this with a streaming pull parser (Epg.kt / Xmltv) and expects:
 * - "start"/"stop" as YYYYMMDDHHMMSS +HHMM
 * - "channel" identical (case-insensitively) to the playlist's tvg-id
 * - no programme longer than 12 hours, or it is dropped while reading
 * Descriptions are capped at 400 characters because the app truncates there anyway.
 */

const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.replace(INVALID_XML, " ").replace(/\s+/g, " ").trim();
}

/** Clips on code points, not UTF-16 units, so an emoji is never cut in half. */
export function clipText(value, max = 400) {
  const characters = Array.from(value);
  if (characters.length <= max) return value;
  const head = characters.slice(0, max);
  const space = head.lastIndexOf(" ");
  const cut = space > max * 0.6 ? head.slice(0, space) : head;
  return `${cut.join("").trimEnd()} …`;
}

export function xmlEscape(value) {
  return String(value)
    .replace(INVALID_XML, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function xmltvTime(seconds) {
  const date = new Date(seconds * 1000);
  const pad = (number) => String(number).padStart(2, "0");
  const day = String(date.getUTCFullYear()).padStart(4, "0") + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate());
  const time = pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds());
  return `${day}${time} +0000`;
}

export function toXmltv(channels) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="specta-epg">'];
  const outputs = [];
  for (const channel of channels) {
    const ids = [...new Set([channel.id, ...(channel.aliases ?? [])].filter(Boolean))];
    for (const id of ids) {
      outputs.push({ ...channel, outputId: id });
      lines.push(`  <channel id="${xmlEscape(id)}"><display-name>${xmlEscape(channel.name)}</display-name></channel>`);
    }
  }
  for (const channel of outputs) {
    for (const programme of channel.programmes) {
      lines.push(
        `  <programme start="${xmltvTime(programme.start)}" stop="${xmltvTime(programme.stop)}" channel="${xmlEscape(channel.outputId)}">`
      );
      lines.push(`    <title>${xmlEscape(programme.title)}</title>`);
      if (programme.description) lines.push(`    <desc>${xmlEscape(programme.description)}</desc>`);
      lines.push("  </programme>");
    }
  }
  lines.push("</tv>");
  return `${lines.join("\n")}\n`;
}
