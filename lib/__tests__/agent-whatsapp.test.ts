import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
