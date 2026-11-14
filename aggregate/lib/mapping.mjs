/**
 * The reviewed bridge between a broadcaster's own channel IDs and the playlist's tvg-ids.
 *
 * A row with a canonical id overrides the automatic iptv-org resolution in lib/registry.mjs.
 * The file is optional: the build resolves identity by name when no row exists.
 */

import { readFile } from "node:fs/promises";

/** RFC-4180-ish reader: quotes, escaped quotes, commas and newlines inside fields. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

export function quoteCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function mappingKey(provider, sourceChannelId) {
  return `${provider}:${sourceChannelId}`.toLowerCase();
}

/** Missing file is not an error: the repository starts with an empty mapping. */
export async function loadMapping(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
  const [header, ...body] = parseCsv(text);
  if (!header) return new Map();
  const columns = new Map(header.map((name, index) => [name.trim(), index]));
  for (const required of ["provider", "source_channel_id", "canonical_channel_id", "channel_class"]) {
    if (!columns.has(required)) throw new Error(`mapping: missing column ${required}`);
  }
  const read = (values, name) => (values[columns.get(name)] ?? "").trim();
  const rows = new Map();
  for (const values of body) {
    const provider = read(values, "provider");
    const sourceId = read(values, "source_channel_id");
    if (!provider || !sourceId) continue;
    rows.set(mappingKey(provider, sourceId), {
      provider,
      sourceId,
      name: read(values, "source_channel_name"),
      canonicalChannelId: read(values, "canonical_channel_id"),
      channelClass: read(values, "channel_class"),
      status: read(values, "status"),
      playlistAliases: read(values, "playlist_aliases").split("|").map(value => value.trim()).filter(Boolean),
    });
  }
  return rows;
}
