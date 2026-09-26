import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MondayGraphqlError } from "@/lib/integrations/task-sources/monday/graphql";

describe("MondayGraphqlError extensions", () => {
  it("parses GraphQL extension code and status_code", () => {
    const body = JSON.stringify({
      errors: [
        {
          message: "User unauthorized to perform action",
          path: ["change_simple_column_value"],
          extensions: { code: "UserUnauthorizedException", status_code: 403 },
        },
      ],
    });
    const err = new MondayGraphqlError(200, body, [
      {
        message: "User unauthorized to perform action",
        path: ["change_simple_column_value"],
        extensions: { code: "UserUnauthorizedException", status_code: 403 },
      },
    ]);
    assert.equal(err.graphqlCodes[0], "UserUnauthorizedException");
    assert.equal(err.graphqlStatusCodes[0], 403);
    assert.match(err.message, /unauthorized/i);
  });
});
