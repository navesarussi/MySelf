import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@/lib/types";
import {
  taskDeleteErrorFlash,
  taskLocalOnlyWarningFlash,
  taskUpdateErrorFlash,
} from "../task-errors";

const task = (source: Task["source"]): Task => ({
  id: "1",
  title: "T",
  project_id: null,
  priority: "medium",
  status: "open",
  due_date: null,
  notes: null,
  source,
  external_id: "x",
  external_list_id: "y",
  external_meta: {},
  synced_at: null,
  created_at: "",
  updated_at: "",
});

describe("task error flash keys", () => {
  it("maps auth failures to reconnect messages per source", () => {
    assert.equal(taskUpdateErrorFlash(task("monday"), "integration_auth_failed"), "flash.taskReconnectMonday");
    assert.equal(taskDeleteErrorFlash(task("github"), "not_connected"), "flash.taskReconnectGithub");
  });

  it("maps API failures to source-specific update/delete messages", () => {
    assert.equal(taskUpdateErrorFlash(task("google_tasks"), "external_api_failed"), "flash.taskUpdateGoogleFailed");
    assert.equal(taskDeleteErrorFlash(task("monday"), "monday_graphql:boom"), "flash.taskDeleteMondayFailed");
  });

  it("maps local-only warnings to resync/reconnect copy", () => {
    assert.equal(
      taskLocalOnlyWarningFlash({ local_only: true, warning: "external_missing_ids", source: "google_tasks" }),
      "flash.taskLocalOnlyResync"
    );
    assert.equal(
      taskLocalOnlyWarningFlash({ local_only: true, warning: "integration_auth_failed", source: "monday" }),
      "flash.taskReconnectMonday"
    );
  });
});
