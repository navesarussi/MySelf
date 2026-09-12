import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSyncProgress } from "../../mobile/src/query/sync-progress";
import { createTranslator } from "../i18n/core";

const t = createTranslator("en");
const tHe = createTranslator("he");

describe("formatSyncProgress", () => {
  it("falls back to the generic label with no snapshot yet", () => {
    assert.equal(formatSyncProgress(t, null), "Syncing…");
  });

  it("labels the fetch phase before counts exist", () => {
    const text = formatSyncProgress(t, {
      phase: "fetching",
      total: 0,
      processed: 0,
      imported: 0,
    });
    assert.equal(text, "Fetching data…");
  });

  it("reports processed/total while upserting", () => {
    const text = formatSyncProgress(t, {
      phase: "upserting",
      total: 450,
      processed: 120,
      imported: 30,
    });
    assert.equal(text, "120 of 450 tasks");
  });

  it("never renders a meaningless 0 of 0", () => {
    const text = formatSyncProgress(t, {
      phase: "upserting",
      total: 0,
      processed: 0,
      imported: 0,
    });
    assert.equal(text, "Syncing…");
  });

  it("labels the cleanup phase", () => {
    const text = formatSyncProgress(t, {
      phase: "cleanup",
      total: 10,
      processed: 10,
      imported: 4,
    });
    assert.equal(text, "Finishing up…");
  });

  it("resolves Hebrew strings with interpolated counts", () => {
    const text = formatSyncProgress(tHe, {
      phase: "upserting",
      total: 8,
      processed: 3,
      imported: 1,
    });
    assert.equal(text, "3 מתוך 8 משימות");
  });
});
