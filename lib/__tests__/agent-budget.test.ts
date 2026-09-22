import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAckReply,
  classifyAgentIntent,
  isAckQuery,
  isSimpleStatusQuery,
  maxStepsForRun,
  toolModeForIntent,
} from "../agent/budget";

describe("isAckQuery", () => {
  it("detects pure greetings", () => {
    assert.equal(isAckQuery("היי"), true);
    assert.equal(isAckQuery("שלום!"), true);
    assert.equal(isAckQuery("זמין?"), true);
    assert.equal(isAckQuery("מה נשמע"), true);
  });

  it("rejects messages with task intent", () => {
    assert.equal(isAckQuery("היי תוסיף משימה"), false);
    assert.equal(isAckQuery("שלום מה המצב"), false);
  });
});

describe("classifyAgentIntent", () => {
  it("classifies ack vs status vs full", () => {
    assert.equal(classifyAgentIntent("היי", false), "ack");
    assert.equal(classifyAgentIntent("מה המצב", false), "status");
    assert.equal(classifyAgentIntent("תוסיף משימה לקנות חלב", false), "full");
    assert.equal(classifyAgentIntent("היי", true), "full");
  });
});

describe("buildAckReply", () => {
  it("includes urgent task when present", () => {
    const reply = buildAckReply({
      top_urgent_tasks: [{ title: "לשלם ארנונה" }],
      habits: { pending_report_count: 2 },
    });
    assert.match(reply, /לשלם ארנונה/);
    assert.match(reply, /זמין/);
  });

  it("falls back to habit pending count", () => {
    const reply = buildAckReply({ habits: { pending_report_count: 3 } });
    assert.match(reply, /3 הרגלים/);
  });
});

describe("maxStepsForRun", () => {
  it("caps WhatsApp tiers", () => {
    assert.equal(maxStepsForRun("ack", "whatsapp", false), 1);
    assert.equal(maxStepsForRun("status", "whatsapp", false), 2);
    assert.equal(maxStepsForRun("full", "whatsapp", false), 6);
  });

  it("keeps higher app caps", () => {
    assert.equal(maxStepsForRun("full", "app", false), 10);
    assert.equal(maxStepsForRun("full", "app", true), 4);
  });
});

describe("toolModeForIntent", () => {
  it("uses read-only tools for WhatsApp status", () => {
    assert.equal(toolModeForIntent("status", "whatsapp"), "read");
    assert.equal(toolModeForIntent("full", "whatsapp"), "full");
    assert.equal(toolModeForIntent("status", "app"), "full");
  });
});

describe("isSimpleStatusQuery", () => {
  it("detects status questions", () => {
    assert.equal(isSimpleStatusQuery("מה המצב שלי"), true);
    assert.equal(isSimpleStatusQuery("מה דחוף"), true);
    assert.equal(isSimpleStatusQuery("תעדכן את כל ההרגלים"), false);
  });
});
