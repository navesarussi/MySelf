import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapDeviceContact } from "../device-contact-map";

describe("mapDeviceContact", () => {
  it("prefers display name and first phone/email", () => {
    assert.deepEqual(
      mapDeviceContact({
        name: "דני כהן",
        phoneNumbers: [{ number: "050-111-2222" }, { number: "03-1234567" }],
        emails: [{ email: "dani@example.com" }, { email: "other@x.com" }],
      }),
      { name: "דני כהן", phone: "050-111-2222", email: "dani@example.com" }
    );
  });

  it("builds name from first+last when name missing", () => {
    assert.deepEqual(
      mapDeviceContact({ firstName: "Dana", lastName: "Levi", phoneNumbers: [], emails: [] }),
      { name: "Dana Levi", phone: "", email: "" }
    );
  });

  it("returns empty strings when fields missing", () => {
    assert.deepEqual(mapDeviceContact({}), { name: "", phone: "", email: "" });
  });
});
