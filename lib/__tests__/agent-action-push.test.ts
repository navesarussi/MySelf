import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentActionPush,
  shouldNotifyAgentWrite,
} from "../agent/action-push";

describe("shouldNotifyAgentWrite", () => {
  it("ignores read-only tools", () => {
    assert.equal(shouldNotifyAgentWrite("list_tasks", []), false);
    assert.equal(shouldNotifyAgentWrite("get_dashboard", {}), false);
  });

  it("notifies on create_task", () => {
    assert.equal(shouldNotifyAgentWrite("create_task", { title: "Buy milk" }), true);
  });

  it("skips errors and duplicate email tasks", () => {
    assert.equal(shouldNotifyAgentWrite("create_task", { error: "fail" }), false);
    assert.equal(
      shouldNotifyAgentWrite("create_task_from_email", { already_exists: true, task: { id: "x" } }),
      false
    );
    assert.equal(
      shouldNotifyAgentWrite("create_task_from_email", { created: true, task: { title: "Hi" } }),
      true
    );
  });
});

describe("buildAgentActionPush", () => {
  it("builds Hebrew payload with deep link", () => {
    const push = buildAgentActionPush("create_task", { title: "לשלם חשבון" });
    assert.equal(push.title, "משימה נוצרה");
    assert.match(push.body, /לשלם חשבון/);
    assert.equal(push.data?.screen, "/tasks");
    assert.equal(push.data?.type, "agent_action");
  });

  it("unwraps nested task from email create", () => {
    const push = buildAgentActionPush("create_task_from_email", {
      created: true,
      task: { title: "מייל: Invoice" },
    });
    assert.match(push.body, /Invoice/);
  });
});
