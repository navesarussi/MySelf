type GraphqlResponse<T> = { data?: T; errors?: { message: string }[] };

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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`monday_http_${res.status}:${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as GraphqlResponse<T>;
  if (json.errors?.length) {
    throw new Error(`monday_graphql:${json.errors[0].message}`);
  }
  if (!json.data) throw new Error("monday_graphql_empty");
  return json.data;
}
