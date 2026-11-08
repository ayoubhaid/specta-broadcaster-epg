/**
 * Automatic channel identity.
 *
 * The app matches XMLTV programmes to a playlist by `tvg-id`, and the playlists in the wild use
 * iptv-org style ids (the app's own beIN matcher hardcodes ids like `beinsports1en.qa`). So instead
 * of asking a human to fill in 100+ mapping rows, every provider channel is resolved against the
 * public iptv-org channel registry by name.
 *
 * The registry is fetched at build time; a manual row in data/mapping/channel-map.csv always wins.
 */

const DIACRITICS = /\p{Mn}+/gu;
const QUALITY = /\b(hd|fhd|uhd|sd|h265|hevc|1080p?|720p?|480p?|2160p?|50fps|60fps)\b/g;

/** "SuperSport OTT Two" and "SuperSport OTT 2" are the same channel. */
const WORD_NUMBERS = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

/** Region of a feed -> country codes used by iptv-org ids. */
const REGION_COUNTRIES = {
  "en-mena": ["QA"],
  "multi-region": [],
  GB: ["UK", "GB"],
  FR: ["FR"],
  US: ["US"],
};

/** Providers whose feed region is too vague for a country hint. */
const PROVIDER_COUNTRIES = {
  bein_mena: ["QA"],
  sky_uk: ["UK", "GB"],
  canalplus_fr: ["FR"],
  supersport: ["ZA"],
};

/** Providers whose source feed drops the brand from some channel names ("Maximo 1"). */
const PROVIDER_PREFIXES = {
  supersport: ["supersport"],
};

export function countryHints(provider, region) {
  return PROVIDER_COUNTRIES[provider] ?? REGION_COUNTRIES[region] ?? (region ? [String(region).toUpperCase()] : []);
}

export function brandPrefixes(provider) {
  return PROVIDER_PREFIXES[provider] ?? [];
}

/** Case, accents, punctuation, "Sports"/"sport", "EN"/"English" — the same shape on both sides. */
export function normalizeName(raw) {
  if (typeof raw !== "string") return "";
  let text = raw.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
  text = text.replace(/&/g, " and ").replace(/ß/g, "ss");
  text = text.replace(/[^\p{L}\p{N}]+/gu, " ");
  text = text.replace(/\bsports\b/g, "sport");
  text = text.replace(/\b0+(\d)\b/g, "$1");
  text = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (word) => WORD_NUMBERS[word]);
  text = text.replace(/\ben\b/g, "english");
  // "beIN Sports 1 AFC" and "beIN Sports AFC 1" are the same feed.
  text = text.replace(/^(.*\bsport) (\d+) afc$/, "$1 afc $2");
  text = text.replace(/\bfr\b/g, "french");
  text = text.replace(/\bde\b/g, "german");
  text = text.replace(/\bes\b/g, "spanish");
  text = text.replace(/\bit\b/g, "italian");
  return text.replace(/\s+/g, " ").trim();
}

function withoutQuality(key) {
  return key.replace(QUALITY, " ").replace(/\s+/g, " ").trim();
}

/** normalized name (and alt name) -> registry entries */
export function indexRegistry(channels) {
  const index = new Map();
  const add = (name, entry) => {
    const key = normalizeName(name);
    if (!key) return;
    const list = index.get(key);
    if (!list) index.set(key, [entry]);
    else if (!list.includes(entry)) list.push(entry);
  };
  for (const channel of channels ?? []) {
    if (!channel || !channel.id || !channel.name) continue;
    const entry = {
      id: String(channel.id),
      name: String(channel.name),
      country: String(channel.country ?? "").toUpperCase(),
    };
    add(entry.name, entry);
    for (const alias of channel.alt_names ?? []) add(alias, entry);
  }
  return index;
}

/**
 * Returns { id, method: "registry", country } or { reason, candidates }.
 * A country hint breaks ties such as Sky Sports Main Event UK vs IE and SuperSport ZA vs AL.
 */
export function resolveChannel(index, { name, countryHints: hints = [], prefixes = [] }) {
  const key = normalizeName(name);
  if (!key) return { reason: "name", candidates: [] };

  const keys = [key];
  for (const prefix of prefixes) {
    const normalized = normalizeName(prefix);
    if (normalized) keys.push(`${normalized} ${key}`);
  }

  let candidates = [];
  for (const candidateKey of keys) {
    candidates = index.get(candidateKey) ?? [];
    if (!candidates.length) {
      const stripped = withoutQuality(candidateKey);
      if (stripped && stripped !== candidateKey) candidates = index.get(stripped) ?? [];
    }
    if (candidates.length) break;
  }

  const unique = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
  if (!unique.length) return { reason: "unknown", candidates: [] };

  const wanted = new Set(hints.map((hint) => String(hint).toUpperCase()));
  const fitsHint = (candidate) => !candidate.country || !wanted.size || wanted.has(candidate.country);

  if (unique.length === 1) {
    if (fitsHint(unique[0])) return { id: unique[0].id, method: "registry", country: unique[0].country };
    return { reason: "unknown", candidates: unique.map((candidate) => `${candidate.id} (${candidate.country})`) };
  }

  const preferred = unique.filter((candidate) => fitsHint(candidate));
  if (wanted.size && !preferred.length) {
    return { reason: "unknown", candidates: unique.map((candidate) => `${candidate.id} (${candidate.country})`) };
  }
  if (preferred.length === 1) return { id: preferred[0].id, method: "registry", country: preferred[0].country };

  const pool = preferred.length ? preferred : unique;
  const countries = new Set(pool.map((candidate) => candidate.country));
  if (countries.size === 1) return { id: pool[0].id, method: "registry", country: pool[0].country };

  return { reason: "ambiguous", candidates: pool.map((candidate) => `${candidate.id} (${candidate.country})`) };
}
