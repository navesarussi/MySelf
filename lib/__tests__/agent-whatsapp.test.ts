import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { userFacingAgentError, outboundRef } from "../agent/whatsapp-outbound";
import { isAuthorizedWhatsAppSender } from "../whatsapp/phone-match";
import {
  parseInboundWhatsAppMessage,
  parseInboundWhatsAppText,
  verifyWhatsAppWebhook,
} from "../whatsapp/client";

describe("whatsapp webhook verify", () => {
  it("accepts matching verify token", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "my-secret";
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "my-secret",
      "hub.challenge": "12345",
    });
    assert.equal(verifyWhatsAppWebhook(params), "12345");
  });

  it("rejects wrong token", () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "my-secret";
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "12345",
    });
    assert.equal(verifyWhatsAppWebhook(params), null);
  });
});

describe("parseInboundWhatsAppText", () => {
  it("extracts text message from meta payload", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "972501234567",
                    id: "wamid.abc",
                    type: "text",
                    text: { body: "מה יש לי היום?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseInboundWhatsAppText(payload);
    assert.deepEqual(parsed, {
      from: "972501234567",
      messageId: "wamid.abc",
      text: "מה יש לי היום?",
    });
  });
});

describe("parseInboundWhatsAppMessage audio", () => {
  it("extracts voice note media id", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "972501234567",
                    id: "wamid.audio1",
                    type: "audio",
                    audio: { id: "media123", mime_type: "audio/ogg; codecs=opus" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const parsed = parseInboundWhatsAppMessage(payload);
    assert.deepEqual(parsed, {
      from: "972501234567",
      messageId: "wamid.audio1",
      kind: "audio",
      audioMediaId: "media123",
      audioMimeType: "audio/ogg; codecs=opus",
    });
  });
});

describe("isAuthorizedWhatsAppSender", () => {
  it("matches normalized israeli numbers", () => {
    assert.equal(isAuthorizedWhatsAppSender("972501234567", "0501234567"), true);
    assert.equal(isAuthorizedWhatsAppSender("972501234567", null), false);
  });
});

describe("userFacingAgentError", () => {
  it("maps whatsapp_not_configured to Hebrew", () => {
    assert.match(userFacingAgentError("whatsapp_not_configured"), /WhatsApp/);
  });
  it("never returns empty", () => {
    assert.ok(userFacingAgentError("agent_timeout").length > 5);
  });
});

describe("normalizeAudioMime", () => {
  it("strips codec suffix from ogg", async () => {
    const { normalizeAudioMime } = await import("../whatsapp/transcribe");
    assert.equal(normalizeAudioMime("audio/ogg; codecs=opus"), "audio/ogg");
  });
});

describe("buildInboundLogContent", () => {
  it("prefixes voice transcripts", async () => {
    const { buildInboundLogContent } = await import("../agent/whatsapp-process");
    assert.equal(buildInboundLogContent("audio", "שלום"), "[voice] שלום");
  });
});

describe("outboundRef", () => {
  it("prefixes inbound wamid", () => {
    assert.equal(outboundRef("wamid.abc"), "out:wamid.abc");
  });
});

describe("whatsapp dedup ref ids", () => {
  it("uses stable dig ref keys per motivation kind", () => {
    const kinds = ["morning", "midday", "evening"] as const;
    const refs = kinds.map((k) => `dig:${k}`);
    assert.equal(new Set(refs).size, 3);
    assert.deepEqual(refs, ["dig:morning", "dig:midday", "dig:evening"]);
  });
});
