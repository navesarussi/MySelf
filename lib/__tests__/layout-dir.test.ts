import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rowFlexDirection,
  physicalTextStart,
  physicalAlignStart,
  physicalAlignEnd,
  chevronBackName,
  chevronForwardName,
  progressAlignSelf,
} from "../layout-dir";

const nativeHe = { rtl: true, nativeSwaps: false, cssDirFollowsLocale: false };
const nativeEn = { rtl: false, nativeSwaps: false, cssDirFollowsLocale: false };
const webHe = { rtl: true, nativeSwaps: false, cssDirFollowsLocale: true };
const webEn = { rtl: false, nativeSwaps: false, cssDirFollowsLocale: true };
const nativeRtlHe = { rtl: true, nativeSwaps: true, cssDirFollowsLocale: false };

describe("rowFlexDirection", () => {
  it("native Hebrew uses row-reverse so first child is physical right", () => {
    assert.equal(rowFlexDirection(nativeHe), "row-reverse");
  });
  it("native English uses row so first child is physical left", () => {
    assert.equal(rowFlexDirection(nativeEn), "row");
  });
  it("web Hebrew uses row (CSS dir already reverses) — no double-flip", () => {
    assert.equal(rowFlexDirection(webHe), "row");
  });
  it("web English uses row", () => {
    assert.equal(rowFlexDirection(webEn), "row");
  });
  it("native I18nManager RTL + Hebrew uses row (engine already swaps)", () => {
    assert.equal(rowFlexDirection(nativeRtlHe), "row");
  });
});

describe("task card row layout", () => {
  it("Hebrew text start is physical right when native does not swap", () => {
    assert.equal(physicalTextStart(nativeHe), "right");
    assert.equal(physicalTextStart(webHe), "right");
  });
  it("English text start is physical left", () => {
    assert.equal(physicalTextStart(nativeEn), "left");
    assert.equal(physicalTextStart(webEn), "left");
  });
  it("checkbox as second child lands on physical end (left in Hebrew)", () => {
    assert.equal(physicalAlignEnd(nativeHe), "flex-start");
    assert.equal(physicalAlignEnd(webHe), "flex-end");
    assert.equal(physicalAlignEnd(nativeEn), "flex-end");
  });
});

describe("chat bubble alignment", () => {
  it("native Hebrew: other=physical right, user=physical left", () => {
    assert.equal(physicalAlignStart(nativeHe), "flex-end");
    assert.equal(physicalAlignEnd(nativeHe), "flex-start");
  });
  it("web Hebrew: CSS dir maps flex-start to inline-start", () => {
    assert.equal(physicalAlignStart(webHe), "flex-start");
    assert.equal(physicalAlignEnd(webHe), "flex-end");
  });
  it("English: other=left, user=right", () => {
    assert.equal(physicalAlignStart(nativeEn), "flex-start");
    assert.equal(physicalAlignEnd(nativeEn), "flex-end");
  });
});

describe("content chevrons", () => {
  it("Hebrew back points toward inline-start (right)", () => {
    assert.equal(chevronBackName(true), "chevron-forward");
    assert.equal(chevronForwardName(true), "chevron-back");
  });
  it("English back keeps chevron-back", () => {
    assert.equal(chevronBackName(false), "chevron-back");
    assert.equal(chevronForwardName(false), "chevron-forward");
  });
});

describe("progressAlignSelf", () => {
  it("progress grows from start", () => {
    assert.equal(progressAlignSelf(nativeHe), "flex-end");
    assert.equal(progressAlignSelf(webHe), "flex-start");
    assert.equal(progressAlignSelf(nativeEn), "flex-start");
  });
});
