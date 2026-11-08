import test from "node:test";
import assert from "node:assert/strict";
import { countryHints, indexRegistry, normalizeName, resolveChannel } from "../lib/registry.mjs";

const registry = indexRegistry([
  { id: "beINSports1.qa", name: "beIN Sports 1", country: "QA" },
  { id: "beINSports1Turk.tr", name: "beIN Sports 1 Turk", country: "TR" },
  { id: "beINSportsEnglish1.qa", name: "beIN Sports English 1", country: "QA" },
  { id: "beINSportsMax1.qa", name: "beIN Sports Max 1", country: "QA" },
  { id: "SkySportsMainEvent.uk", name: "Sky Sports Main Event", country: "UK" },
  { id: "SkySportsMainEvent.ie", name: "Sky Sports Main Event", country: "IE" },
  { id: "SuperSport1.al", name: "SuperSport 1", country: "AL" },
  { id: "SuperSportAction.za", name: "SuperSport Action", country: "ZA" },
  { id: "CanalPlusSport.fr", name: "Canal+ Sport", country: "FR" },
  { id: "AliasChannel.us", name: "Alias Channel", country: "US", alt_names: ["Alias Alt"] },
  { id: "beINSportsAFC1.qa", name: "beIN Sports AFC 1", country: "QA" },
  { id: "SuperSportMaximo1.za", name: "SuperSport Maximo 1", country: "ZA" },
  { id: "SuperSportOTT2.za", name: "SuperSport OTT 2", country: "ZA" },
]);

test("names normalise to the same shape on both sides", () => {
  assert.equal(normalizeName("beIN SPORTS 3"), "bein sport 3");
  assert.equal(normalizeName("Canal+ Sport"), "canal sport");
  assert.equal(normalizeName("BEIN SPORTS EN 1"), "bein sport english 1");
  assert.equal(normalizeName("Köln"), "koln");
  assert.equal(normalizeName("RTL & Co"), "rtl and co");
  assert.equal(normalizeName("beIN SPORTS 02"), "bein sport 2");
});

test("an exact name with a matching country resolves", () => {
  assert.deepEqual(resolveChannel(registry, { name: "beIN SPORTS 1", countryHints: ["QA"] }), {
    id: "beINSports1.qa",
    method: "registry",
    country: "QA",
  });
  assert.equal(resolveChannel(registry, { name: "SuperSport Action", countryHints: ["ZA"] }).id, "SuperSportAction.za");
  assert.equal(resolveChannel(registry, { name: "Canal+ Sport", countryHints: ["FR"] }).id, "CanalPlusSport.fr");
});

test("the country hint breaks UK/IE ties", () => {
  assert.equal(resolveChannel(registry, { name: "Sky Sports Main Event", countryHints: ["UK", "GB"] }).id, "SkySportsMainEvent.uk");
  assert.equal(resolveChannel(registry, { name: "Sky Sports Main Event", countryHints: ["IE"] }).id, "SkySportsMainEvent.ie");
});

test("without a hint a genuine tie is reported, not guessed", () => {
  const result = resolveChannel(registry, { name: "Sky Sports Main Event" });
  assert.equal(result.reason, "ambiguous");
  assert.deepEqual(result.candidates, ["SkySportsMainEvent.uk (UK)", "SkySportsMainEvent.ie (IE)"]);
});

test("a hint that matches nothing is reported instead of mapping a foreign feed", () => {
  const result = resolveChannel(registry, { name: "SuperSport 1", countryHints: ["ZA"] });
  assert.equal(result.reason, "unknown");
  assert.deepEqual(result.candidates, ["SuperSport1.al (AL)"]);
});

test("EN/FR abbreviations and quality suffixes still match", () => {
  assert.equal(resolveChannel(registry, { name: "beIN SPORTS EN 1", countryHints: ["QA"] }).id, "beINSportsEnglish1.qa");
  assert.equal(resolveChannel(registry, { name: "beIN Sports Max 1 HD", countryHints: ["QA"] }).id, "beINSportsMax1.qa");
});

test("alt names are indexed", () => {
  assert.equal(resolveChannel(registry, { name: "Alias Alt", countryHints: ["US"] }).id, "AliasChannel.us");
});

test("word numbers and AFC word order normalise to the registry shape", () => {
  assert.equal(normalizeName("SuperSport OTT Two"), "supersport ott 2");
  assert.equal(resolveChannel(registry, { name: "beIN SPORTS 1 AFC", countryHints: ["QA"] }).id, "beINSportsAFC1.qa");
  assert.equal(resolveChannel(registry, { name: "SuperSport OTT Two", countryHints: ["ZA"] }).id, "SuperSportOTT2.za");
});

test("a provider brand prefix is tried after the plain name", () => {
  assert.equal(
    resolveChannel(registry, { name: "Maximo 1", countryHints: ["ZA"], prefixes: ["supersport"] }).id,
    "SuperSportMaximo1.za"
  );
});

test("an unknown name is reported", () => {
  assert.deepEqual(resolveChannel(registry, { name: "Totally Unknown Channel" }), { reason: "unknown", candidates: [] });
  assert.deepEqual(resolveChannel(registry, { name: "  " }), { reason: "name", candidates: [] });
});

test("provider and region produce country hints", () => {
  assert.deepEqual(countryHints("bein_mena", "en-mena"), ["QA"]);
  assert.deepEqual(countryHints("sky_uk", "GB"), ["UK", "GB"]);
  assert.deepEqual(countryHints("supersport", "multi-region"), ["ZA"]);
  assert.deepEqual(countryHints("unknown_provider", "FR"), ["FR"]);
});
