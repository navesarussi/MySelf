import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCodingTaskPrefix, isCodingTaskMessage } from "../agent/coding/prefix";
import {
  evaluateCodingQuota,
  formatQuotaBlockedHebrew,
  jerusalemCalendarDate,
} from "../agent/coding/quota";
import type { CodingAgentJob } from "../agent/coding/types";

function job(partial: Partial<CodingAgentJob> & Pick<CodingAgentJob, "created_at">): CodingAgentJob {
  return {
    id: partial.id ?? "job-1",
    channel: partial.channel ?? "whatsapp",
    task_text: partial.task_text ?? "fix bug",
    status: partial.status ?? "launched",
    cursor_agent_id:
      partial.cursor_agent_id !== undefined ? partial.cursor_agent_id : "bc-1",
    cursor_run_id: partial.cursor_run_id ?? "run-1",
    agent_url: partial.agent_url ?? null,
    pr_url: partial.pr_url ?? null,
    blocked_reason: partial.blocked_reason ?? null,
    created_at: partial.created_at,
    updated_at: partial.updated_at ?? partial.created_at,
  };
}

describe("parseCodingTaskPrefix", () => {
  it("parses Hebrew קוד: prefix", () => {
    assert.equal(parseCodingTaskPrefix("קוד: תקן את מסך המשימות"), "תקן את מסך המשימות");
  });

  it("parses /dev prefix case-insensitively", () => {
    assert.equal(parseCodingTaskPrefix("/DEV add logging"), "add logging");
    assert.equal(parseCodingTaskPrefix("/dev: bump version"), "bump version");
  });

  it("returns empty string for prefix-only messages", () => {
    assert.equal(parseCodingTaskPrefix("קוד:"), "");
    assert.equal(parseCodingTaskPrefix("/dev"), "");
  });

  it("returns null for normal agent chat", () => {
    assert.equal(parseCodingTaskPrefix("מה יש לי היום?"), null);
    assert.equal(parseCodingTaskPrefix("developer mode"), null);
  });
});

describe("isCodingTaskMessage", () => {
  it("detects coding prefixes only", () => {
    assert.equal(isCodingTaskMessage("קוד: x"), true);
    assert.equal(isCodingTaskMessage("/dev x"), true);
    assert.equal(isCodingTaskMessage("hello"), false);
  });
});

describe("evaluateCodingQuota", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("blocks after daily limit", () => {
    const day = jerusalemCalendarDate(now);
    const sameDay = `${day}T08:00:00.000Z`;
    const jobs = [
      job({ created_at: sameDay, cursor_agent_id: "a1", status: "completed" }),
      job({ created_at: sameDay, cursor_agent_id: "a2", status: "completed" }),
      job({ created_at: sameDay, cursor_agent_id: "a3", status: "completed" }),
    ];
    const quota = evaluateCodingQuota(jobs, now);
    assert.equal(quota.blockReason, "daily_limit");
    assert.equal(quota.remainingToday, 0);
  });

  it("blocks when another job is in flight", () => {
    const jobs = [job({ created_at: now.toISOString(), status: "running" })];
    const quota = evaluateCodingQuota(jobs, now);
    assert.equal(quota.blockReason, "in_flight");
  });

  it("blocks during cooldown window", () => {
    const recent = new Date(now.getTime() - 10 * 60_000).toISOString();
    const jobs = [job({ created_at: recent, cursor_agent_id: "a1", status: "completed" })];
    const quota = evaluateCodingQuota(jobs, now);
    assert.equal(quota.blockReason, "cooldown");
    assert.ok(quota.cooldownMinutesLeft > 0);
  });

  it("allows launch when quota is available", () => {
    const old = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
    const jobs = [job({ created_at: old, cursor_agent_id: "a1", status: "completed" })];
    const quota = evaluateCodingQuota(jobs, now);
    assert.equal(quota.blockReason, null);
    assert.equal(quota.remainingToday, 2);
  });

  it("does not count blocked attempts toward daily usage", () => {
    const day = jerusalemCalendarDate(now);
    const jobs = [
      job({ created_at: `${day}T08:00:00.000Z`, status: "blocked", cursor_agent_id: null }),
      job({ created_at: `${day}T09:00:00.000Z`, cursor_agent_id: "a1" }),
    ];
    const quota = evaluateCodingQuota(jobs, now);
    assert.equal(quota.usedToday, 1);
    assert.equal(quota.remainingToday, 2);
  });
});

describe("formatQuotaBlockedHebrew", () => {
  it("mentions cooldown minutes", () => {
    const text = formatQuotaBlockedHebrew({
      dailyLimit: 3,
      usedToday: 1,
      remainingToday: 2,
      inFlight: false,
      cooldownMinutesLeft: 20,
      blockReason: "cooldown",
    });
    assert.match(text, /20/);
    assert.match(text, /נותרו היום: 2/);
  });
});
