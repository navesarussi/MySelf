import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickAccountForSender } from "../agent/account-by-phone";

describe("pickAccountForSender", () => {
  const rows = [
    { user_id: "a@example.com", whatsapp_phone: "+972501234567" },
    { user_id: "b@example.com", whatsapp_phone: "+972529876543" },
  ];

  it("finds the account registered for the number, in any format", () => {
    assert.equal(pickAccountForSender("972501234567", rows), "a@example.com");
    assert.equal(pickAccountForSender("0529876543", rows), "b@example.com");
  });

  it("ignores an unknown number", () => {
    assert.equal(pickAccountForSender("972500000000", rows), null);
  });

  it("refuses a number registered on two accounts", () => {
    const shared = [...rows, { user_id: "c@example.com", whatsapp_phone: "+972501234567" }];
    assert.equal(pickAccountForSender("972501234567", shared), null);
  });
});
