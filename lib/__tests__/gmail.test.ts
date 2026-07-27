import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compactEmailFromMessage,
  decodeBase64Url,
  extractEmailBody,
  headerValue,
} from "../integrations/gmail/decode";
import { gmailRedirectUri } from "../integrations/gmail/client";
import { taskTitleFromEmail } from "../agent/gmail";

describe("decodeBase64Url", () => {
  it("decodes Gmail base64url body", () => {
    const encoded = Buffer.from("שלום עולם", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    assert.equal(decodeBase64Url(encoded), "שלום עולם");
  });
});

describe("extractEmailBody", () => {
  it("prefers text/plain over html", () => {
    const body = extractEmailBody({
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("plain text").toString("base64") },
        },
        {
          mimeType: "text/html",
          body: { data: Buffer.from("<p>html</p>").toString("base64") },
        },
      ],
    });
    assert.equal(body, "plain text");
  });
});

describe("compactEmailFromMessage", () => {
  it("maps headers and internal date", () => {
    const compact = compactEmailFromMessage({
      id: "abc",
      threadId: "t1",
      snippet: "hi",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "a@b.com" },
          { name: "Subject", value: "Test" },
        ],
      },
    });
    assert.equal(compact.from, "a@b.com");
    assert.equal(compact.subject, "Test");
    assert.equal(compact.date, new Date(1700000000000).toISOString());
  });

  it("defaults missing subject", () => {
    const compact = compactEmailFromMessage({
      id: "x",
      threadId: "t",
      payload: { headers: [] },
    });
    assert.equal(compact.subject, "(ללא נושא)");
  });
});

describe("headerValue", () => {
  it("is case-insensitive", () => {
    assert.equal(headerValue([{ name: "Subject", value: "Hi" }], "subject"), "Hi");
  });
});

describe("taskTitleFromEmail", () => {
  it("uses override when provided", () => {
    assert.equal(taskTitleFromEmail("Subj", "a@b.com", "Custom"), "Custom");
  });

  it("builds title from subject and sender", () => {
    assert.equal(
      taskTitleFromEmail("Invoice due", "Boss <boss@co.com>"),
      "מייל: Invoice due (Boss)"
    );
  });
});

describe("gmailRedirectUri", () => {
  const keys = ["GOOGLE_GMAIL_REDIRECT_URI", "VERCEL_ENV", "VERCEL_URL"] as const;
  const prev: Record<string, string | undefined> = {};

  for (const k of keys) prev[k] = process.env[k];

  it("uses explicit redirect when set", () => {
    process.env.GOOGLE_GMAIL_REDIRECT_URI = "https://myselfapp.xyz/api/integrations/gmail/callback";
    assert.equal(gmailRedirectUri(), "https://myselfapp.xyz/api/integrations/gmail/callback");
  });

  for (const k of keys) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});
