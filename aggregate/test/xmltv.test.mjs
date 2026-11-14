import test from "node:test";
import assert from "node:assert/strict";
import { clipText, toXmltv, xmlEscape, xmltvTime } from "../lib/xmltv.mjs";

test("xmltvTime writes the format the app parses", () => {
  assert.equal(xmltvTime(1794139200), "20261108120000 +0000");
  assert.equal(xmltvTime(1794139200 + 300), "20261108120500 +0000");
  assert.match(xmltvTime(1794139200), /^\d{14} \+0000$/);
});

test("xmlEscape masks XML characters and control codes", () => {
  assert.equal(xmlEscape('Köln & "Mainz" <1>'), "Köln &amp; &quot;Mainz&quot; &lt;1&gt;");
  assert.equal(xmlEscape("a\u0000b"), "a b");
});

test("clipText never splits a code point and marks the cut", () => {
  assert.equal(clipText("short", 10), "short");
  const clipped = clipText("a".repeat(500), 400);
  assert.equal(clipped.length, 402);
  assert.ok(clipped.endsWith(" …"));
  assert.equal(clipText("😀".repeat(10), 2), "😀😀 …");
});

test("the document contains channel, programme, title and description", () => {
  const xml = toXmltv([
    {
      id: "ard.de",
      name: "Das Erste",
      programmes: [
        { title: "Tagesschau", description: "Nachrichten", start: 1794139200, stop: 1794139500 },
        { title: "Ohne Beschreibung", description: "", start: 1794139500, stop: 1794139800 },
      ],
    },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(xml, /<channel id="ard\.de"><display-name>Das Erste<\/display-name><\/channel>/);
  assert.match(
    xml,
    /<programme start="20261108120000 \+0000" stop="20261108120500 \+0000" channel="ard\.de">\n {4}<title>Tagesschau<\/title>\n {4}<desc>Nachrichten<\/desc>\n {2}<\/programme>/
  );
  assert.equal((xml.match(/<desc>/g) ?? []).length, 1, "empty descriptions are omitted");
  assert.ok(xml.endsWith("</tv>\n"));
});


test("XMLTV fans out programme rows to reviewed playlist aliases", () => {
  const xml = toXmltv([{
    id: "specta.sky_uk.sky-sports-main-event",
    name: "Sky Sports Main Event",
    aliases: ["SkySportsMainEvent.uk", "legacy.sky.main"],
    programmes: [{ title: "Live Sport", description: "", start: 1794139200, stop: 1794139500 }]
  }]);
  assert.match(xml, /<channel id="specta\.sky_uk\.sky-sports-main-event">/);
  assert.match(xml, /<channel id="SkySportsMainEvent\.uk">/);
  assert.match(xml, /<channel id="legacy\.sky\.main">/);
  assert.equal((xml.match(/<programme /g) ?? []).length, 3);
  assert.match(xml, /channel="legacy\.sky\.main"/);
});
