/**
 * Exactly-once consumption of a trade proposal.
 *
 * "Enter now" places a real (paper) order. Reading the status and writing it
 * back at the end of the handler leaves a wide window — live price, account
 * load, two inserts, the broker call, fill polling — in which a second request
 * for the same proposal passes the same read and places a second order. The
 * risk envelope cannot catch that: at the moment both requests check
 * ALREADY_IN_SYMBOL, neither trade exists.
 *
 * So the proposal is claimed in a single conditional statement before any work
 * starts. `UPDATE … WHERE id = ? AND status = 'PROPOSED' RETURNING id` either
 * returns the row — this caller owns it — or returns nothing, and the caller
 * stops. The same shape as the intraday tick's lock and `tryStartSync`.
 */

type UpdateBuilder = {
  eq(column: string, value: unknown): UpdateBuilder;
  /** NULL needs `is`; PostgREST's `eq` never matches a null column. */
  is(column: string, value: null): UpdateBuilder;
  // PostgREST builders are thenables, not Promises — PromiseLike is what they satisfy.
  select(columns?: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type ProposalClaimClient = {
  from(table: string): { update(patch: Record<string, unknown>): UpdateBuilder };
};

const TABLE = "trading_proposals";

/**
 * Take ownership of a proposal. True means this caller — and only this caller —
 * may open the trade. The row goes straight to ENTERED rather than to an
 * intermediate state so no migration is needed for the status CHECK; a crash
 * mid-entry therefore leaves a consumed proposal with no trade, which is the
 * safe direction (a lost proposal, never a duplicate order).
 */
export async function claimProposal(client: ProposalClaimClient, id: string): Promise<boolean> {
  const { data, error } = await client
    .from(TABLE)
    .update({ status: "ENTERED" })
    .eq("id", id)
    .eq("status", "PROPOSED")
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Record which trade consumed the proposal, once it exists. */
export async function attachProposalTrade(client: ProposalClaimClient, id: string, tradeId: string): Promise<void> {
  await client.from(TABLE).update({ trade_id: tradeId }).eq("id", id).select("id");
}

/**
 * Hand a claimed proposal back after an attempt that opened nothing, so the
 * user can fix the input and retry. Conditional on `trade_id` still being null:
 * once a trade exists the proposal is spent, whatever went wrong afterwards.
 */
export async function releaseProposal(client: ProposalClaimClient, id: string): Promise<void> {
  await client
    .from(TABLE)
    .update({ status: "PROPOSED" })
    .eq("id", id)
    .eq("status", "ENTERED")
    .is("trade_id", null)
    .select("id");
}
