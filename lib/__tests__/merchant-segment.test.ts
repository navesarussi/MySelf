import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatHebrewMerchantRemainder,
  segmentMerchantRemainder,
  stripCategoryPrefix,
  stripCompanySuffix,
} from "../finance/merchant-segment";

describe("stripCategoryPrefix", () => {
  it("strips glued truncated Cal categories", () => {
    assert.equal(stripCategoryPrefix("מזוןומשקארמילוי"), "רמילוי");
    assert.equal(stripCategoryPrefix("מוסדותמילודבע"), "מילודבע");
    assert.equal(stripCategoryPrefix("מסעדותג'נט"), "ג'נט");
    assert.equal(stripCategoryPrefix("פנאיבילוישאפל"), "ישאפל");
    assert.equal(stripCategoryPrefix("אנרגיהדלקמנטה"), "דלקמנטה");
    assert.equal(stripCategoryPrefix("חדשהבכרטיסלובי"), "לובי");
  });

  it("strips spaced categories", () => {
    assert.equal(stripCategoryPrefix("רכבות חבור כביש"), "כביש");
    assert.equal(stripCategoryPrefix("מזון ומשקאות סופר"), "סופר");
  });
});

describe("segmentMerchantRemainder", () => {
  it("segments with dictionary tokens and opaque tail", () => {
    assert.match(segmentMerchantRemainder("רמילויראשוןלציון"), /רמי לוי/);
    assert.match(formatHebrewMerchantRemainder("סופרפארםביגאילת"), /סופר-פארם/);
    assert.match(segmentMerchantRemainder("ארומהבורסה"), /ארומה/);
  });

  it("preserves geresh in opaque segments", () => {
    assert.match(segmentMerchantRemainder("ג'פהפיצהקיטצ'ן"), /ג'פה/);
  });
});

describe("stripCompanySuffix", () => {
  it("removes glued and spaced company suffixes", () => {
    assert.equal(stripCompanySuffix('מורדןברבע"מ'), "מורדןבר");
    assert.equal(stripCompanySuffix('חברה בע"מ'), "חברה");
    assert.equal(stripCompanySuffix("חברה בעמ"), "חברה");
    assert.equal(stripCompanySuffix("foo-"), "foo");
  });
});

describe("formatHebrewMerchantRemainder", () => {
  it("normalizes known brand phrases", () => {
    assert.match(formatHebrewMerchantRemainder("חברתהחשמללישראלבע"), /חברת החשמל לישראל/);
    assert.match(formatHebrewMerchantRemainder("רשותהטבעוהגנים"), /רשות הטבע והגנים/);
  });
});
