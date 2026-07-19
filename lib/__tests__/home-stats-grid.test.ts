import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homeStatColumns, homeStatTileWidth, HOME_STATS_GRID_GAP } from "../home-stats-grid";

describe("homeStatColumns", () => {
  it("uses 4 columns on typical phone width", () => {
    assert.equal(homeStatColumns(390), 4);
  });

  it("uses at least 2 columns on narrow screens", () => {
    assert.ok(homeStatColumns(280) >= 2);
  });

  it("tile width fills row with gap", () => {
    const cols = 4;
    const w = 390;
    const tile = homeStatTileWidth(w, cols);
    const total = tile * cols + HOME_STATS_GRID_GAP * (cols - 1);
    assert.equal(Math.round(total), w - 32);
  });
});
