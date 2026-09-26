import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatDisplayMerchantName,
  meaningfulCharCount,
  normalizeStoredDisplayName,
  normalizeStoredMerchantFields,
  pickDisplayMerchantLabel,
  stripFullCategoryPrefix,
} from "../finance/merchant-display";

describe("formatDisplayMerchantName — Latin / friendly map", () => {
  it("maps Google Cloud including asterisk form", () => {
    assert.equal(formatDisplayMerchantName("google cloud wfv8mm sydney au"), "Google Cloud");
    assert.equal(formatDisplayMerchantName("google*cloud xcwlf3 cc google.com au"), "Google Cloud");
  });

  it("maps other international merchants and strips location junk", () => {
    assert.equal(formatDisplayMerchantName("cursor, ai powered ide cursor.com us"), "Cursor");
    assert.equal(formatDisplayMerchantName("www.hostinger.com larnaca cy"), "Hostinger");
    assert.equal(formatDisplayMerchantName("wix.com 1248411163 luxembourg lu"), "Wix");
    assert.equal(formatDisplayMerchantName("mcdonalds abu dhabi ai abudhabi ae"), "McDonald's");
    assert.equal(formatDisplayMerchantName("google*journeydiary"), "Google Journey Diary");
    assert.equal(formatDisplayMerchantName("apple.com/bill"), "Apple");
    assert.equal(formatDisplayMerchantName("twilio inc www.twilio.co us"), "Twilio");
    assert.equal(formatDisplayMerchantName("gett"), "Gett");
    assert.equal(formatDisplayMerchantName("shein"), "SHEIN");
    assert.equal(formatDisplayMerchantName("transportfornsw tap sydney au"), "Transport for NSW");
  });
});

describe("formatDisplayMerchantName — Cal markers and categories", () => {
  it("strips Cal standing-order prefix from Hebrew display", () => {
    assert.equal(formatDisplayMerchantName("לאהוראתקבעעמותותותרלובי"), "לובי");
    assert.equal(formatDisplayMerchantName("לא הוראת קבע ריהוט בית גו אה"), "גו אה");
  });

  it("strips standalone leading לא marker and formats foreign country rows", () => {
    assert.equal(formatDisplayMerchantName("לא ארצות הברית פנאיבילוי"), "פנאי ובילוי (ארצות הברית)");
    assert.equal(formatDisplayMerchantName("לא אירלנד מוצרי און"), "מוצרי און (אירלנד)");
    assert.doesNotMatch(formatDisplayMerchantName("לא ארצות הברית פנאיבילוי"), /^לא\s/);
  });

  it("strips glued truncated category prefix (מזוןומשקא)", () => {
    const out = formatDisplayMerchantName("מזוןומשקארמילוי-ראשוןלציון");
    assert.doesNotMatch(out, /^ומשקא/);
    assert.doesNotMatch(out, /^מזוןומשקא/);
    assert.match(out, /רמי לוי|ראשון לציון/);
  });

  it("preserves geresh in restaurant names after category strip", () => {
    assert.match(formatDisplayMerchantName("מסעדותג'פהפיצהקיטצ'ן"), /ג'פה/);
    assert.doesNotMatch(formatDisplayMerchantName("מסעדותג'פהפיצהקיטצ'ן"), /^ג$/);
    assert.match(formatDisplayMerchantName("מסעדותג'יימסמודיעין"), /ג'יימס/);
    assert.equal(formatDisplayMerchantName("מסעדותג'נט"), "ג'נט");
    assert.match(formatDisplayMerchantName("מסעדותקז'ואלברקפהקולינרי"), /קז'ואל/);
  });

  it("strips full spaced category prefixes", () => {
    assert.equal(formatDisplayMerchantName("פנאיבילוימשתלהסיטונאית"), "משתלה סיטונאית");
    assert.equal(formatDisplayMerchantName("רכבות חבור כביש"), "כביש 6");
    assert.match(formatDisplayMerchantName("מסעדותארומהבורסה"), /ארומה/);
    assert.match(formatDisplayMerchantName("ריהוטוביתגואה"), /גו אה/);
    assert.match(formatDisplayMerchantName("תיירותאחוזתהחוף-גולדה"), /אחוזת|גולדה/);
    assert.equal(formatDisplayMerchantName("עמותות ותרכוורת"), "כוורת");
  });

  it("normalizes Mei Lod institution names", () => {
    assert.equal(formatDisplayMerchantName("מוסדותמילודבע"), "מי לוד");
    assert.equal(formatDisplayMerchantName("חדשהבכרטיסמוסדותמילודבע"), "מי לוד");
    assert.doesNotMatch(formatDisplayMerchantName("מוסדותמילודבע"), /^בע$/);
  });

  it("handles לא-prefixed glued categories with spacing", () => {
    const out = formatDisplayMerchantName("לא עמותות ותרלובי");
    assert.match(out, /לובי/);
    assert.doesNotMatch(out, /^לא\s/);
  });

  it("segments leisure and food merchants sensibly", () => {
    assert.match(formatDisplayMerchantName("פנאיבילוישאפל"), /שאפל/);
    assert.match(formatDisplayMerchantName("מזוןומשקאסופרפארםביגאילת"), /סופר|פארם|אילת/);
    assert.match(formatDisplayMerchantName("לא אנרגיהחברתהחשמללישראלבע"), /חשמל|ישראל/);
  });

  it("never returns fewer than 2 meaningful characters", () => {
    for (const raw of [
      "מסעדותג'נט",
      "לא ארצות הברית פנאיבילוי",
      "מזוןומשקא",
      "מוסדותמילודבע",
    ]) {
      assert.ok(meaningfulCharCount(formatDisplayMerchantName(raw)) >= 2, raw);
    }
  });

  it("preserves raw descriptor when requested", () => {
    const raw = formatDisplayMerchantName("google cloud wfv8mm sydney au", { raw: true });
    assert.match(raw, /google cloud/i);
  });
});

describe("stripFullCategoryPrefix", () => {
  it("matches only full category names", () => {
    assert.match(stripFullCategoryPrefix("מסעדותג'נט"), /ג'נט/);
    assert.equal(stripFullCategoryPrefix("מזוןומשקארמילוי"), "רמילוי");
  });
});

describe("pickDisplayMerchantLabel", () => {
  it("prefers clean label over OCR garbage", () => {
    assert.equal(pickDisplayMerchantLabel("לאהוראתקבעלובי", "לובי 99"), "לובי 99");
  });
});

describe("normalizeStoredDisplayName / normalizeStoredMerchantFields", () => {
  it("never changes merchant_key", () => {
    const key = "מסעדותג'פהפיצהקיטצ'ן";
    const out = normalizeStoredMerchantFields({
      merchant_key: key,
      display_name: null,
    });
    assert.equal(out.merchant_key, key);
    assert.match(out.display_name!, /ג'פה/);
  });

  it("cleans display_name only for migration", () => {
    const out = normalizeStoredDisplayName({
      merchant_key: "לאהוראתקבענטפליקס",
      display_name: "לא הוראת קבע נטפליקס",
    });
    assert.equal(out.display_name, "נטפליקס");
  });

  it("is idempotent on display_name", () => {
    const first = normalizeStoredDisplayName({
      merchant_key: "google*cloud xcwlf3 cc google.com au",
      display_name: null,
    });
    const second = normalizeStoredDisplayName({
      merchant_key: "google*cloud xcwlf3 cc google.com au",
      display_name: first.display_name,
    });
    assert.equal(first.display_name, second.display_name);
  });
});

describe("formatDisplayMerchantName — v3 refinements", () => {
  it("formats transport and lone categories", () => {
    assert.equal(formatDisplayMerchantName("רכבות חבור בינוחנותאופניים"), "בינו חנות אופניים");
    assert.equal(formatDisplayMerchantName("מזוןומשקא"), "מזון ומשקאות");
    assert.equal(formatDisplayMerchantName("לא ריהוטובית"), "ריהוט ובית");
  });

  it("strips card-new and insurance category prefixes", () => {
    assert.equal(formatDisplayMerchantName("חדשהבכרטיסעמותותותרלובי"), "לובי");
    assert.equal(formatDisplayMerchantName("לא ביטוח ופינפמיפרימיוםבע"), "פמי פרימיום");
    assert.equal(formatDisplayMerchantName("ביטוח ופינ פמיפרימיום"), "פמי פרימיום");
  });

  it("normalizes Electra Power gas merchants", () => {
    assert.equal(formatDisplayMerchantName("גזאלקטרהפאוור"), "אלקטרה פאוור");
    assert.equal(formatDisplayMerchantName("גזאלקטרהפאוורסופרגז"), "אלקטרה פאוור סופרגז");
  });

  it("cleans Latin processor prefixes and legal suffixes", () => {
    assert.equal(formatDisplayMerchantName("Ms* Nomads something"), "Nomads");
    assert.equal(formatDisplayMerchantName("ms* nomadssydney sydney au"), "Nomads");
    assert.equal(formatDisplayMerchantName("C2i Holding -"), "C2i Holding");
    assert.equal(formatDisplayMerchantName("Kxh Pty Ltd sydney au"), "KXH");
    assert.doesNotMatch(formatDisplayMerchantName("C2i Holding -"), /-$/);
  });
});

describe("formatDisplayMerchantName — preview fixture batch", () => {
  const cases: Array<{ in: string; assert: (out: string) => void }> = [
    { in: "לובי 99", assert: (o) => assert.equal(o, "לובי 99") },
    { in: "עמלת קנ במטח", assert: (o) => assert.equal(o, "עמלת קנ במטח") },
    { in: "כביש 6", assert: (o) => assert.equal(o, "כביש 6") },
    { in: "ארצות הברית פנאיבילוי", assert: (o) => assert.ok(meaningfulCharCount(o) >= 2) },
    { in: "לא מוסדותמילודבע", assert: (o) => assert.match(o, /מי לוד/) },
    { in: "wine&more חינאוי ג'ורג'", assert: (o) => assert.match(o, /wine|חינאוי|ג'ורג'/) },
    { in: "aldi stores darlinghurst au", assert: (o) => assert.match(o, /Aldi/i) },
    { in: "esimo limassol cy", assert: (o) => assert.equal(o, "eSIMo") },
    { in: "מסעדותהמלביהפלורנטין", assert: (o) => assert.match(o, /המלביה|פלורנטין/) },
    { in: "מזוןמהירפיצהשמש-חולון", assert: (o) => assert.match(o, /פיצה|שמש|חולון/) },
    { in: "לא ריהוטובית", assert: (o) => assert.match(o, /ריהוט|ובית/) },
  ];

  for (const { in: input, assert: check } of cases) {
    it(`preview: ${input.slice(0, 40)}`, () => {
      check(formatDisplayMerchantName(input));
    });
  }
});
