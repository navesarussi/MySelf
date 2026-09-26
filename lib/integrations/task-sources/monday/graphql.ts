type GraphqlError = {
  message: string;
  path?: string[];
  extensions?: { code?: string; status_code?: number; [key: string]: unknown };
};
type GraphqlResponse<T> = { data?: T; errors?: GraphqlError[] };

/** Structured Monday GraphQL failure with the upstream body for logging. */
export class MondayGraphqlError extends Error {
  readonly status: number;
  readonly body: string;
  readonly graphqlMessages: string[];
  readonly graphqlCodes: string[];
  readonly graphqlStatusCodes: number[];

  constructor(
    status: number,
    body: string,
    errors: GraphqlError[] = []
  ) {
    const graphqlMessages = errors.map((e) => e.message).filter(Boolean);
    const detail = graphqlMessages[0] ?? body.slice(0, 300);
    super(`monday_graphql:${detail}`);
    this.name = "MondayGraphqlError";
    this.status = status;
    this.body = body;
    this.graphqlMessages = graphqlMessages;
    this.graphqlCodes = errors
      .map((e) => (typeof e.extensions?.code === "string" ? e.extensions.code : ""))
      .filter(Boolean);
    this.graphqlStatusCodes = errors
      .map((e) =>
        typeof e.extensions?.status_code === "number" ? e.extensions.status_code : 0
      )
      .filter((n) => n > 0);
  }
}

export async function mondayGraphql<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new MondayGraphqlError(res.status, body);
  }
  let json: GraphqlResponse<T>;
  try {
    json = JSON.parse(body) as GraphqlResponse<T>;
  } catch {
    throw new MondayGraphqlError(res.status, body);
  }
  if (json.errors?.length) {
    throw new MondayGraphqlError(res.status, body, json.errors);
  }
  if (!json.data) throw new MondayGraphqlError(res.status, body, [{ message: "monday_graphql_empty" }]);
  return json.data;
}
