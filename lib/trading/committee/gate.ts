import { getCommitteeConfig } from "./config";
import { certificateId } from "./execution";
import { certificatePermitsExecution } from "./helpers";
import type { ExecutionIntent, OpportunityTicket, RiskCertificate } from "./types";

export type CertificateExecutionContext = {
  ticket: OpportunityTicket;
  intent?: ExecutionIntent;
  /** When set with maxAgeMs, stale certificates are rejected (fail-closed). */
  nowMs?: number;
  maxAgeMs?: number;
};

export type CertificateGateResult = { ok: true } | { ok: false; reason: string };

const QTY_EPS = 1e-9;
const PRICE_EPS = 1e-6;

/**
 * Age of a certificate, or null when it has no readable timestamp.
 *
 * `issued_at` is optional in the schema, so a certificate can arrive without
 * one — a row read back from the audit table, or a producer other than
 * `issueRiskCertificate`. The gate treats that as a denial rather than as
 * "no expiry to check": an unaged certificate that is allowed through is an
 * immortal one, which is the opposite of the stated invariant.
 */
function certAgeMs(cert: RiskCertificate, nowMs: number): number | null {
  if (!cert.issued_at) return null;
  const issued = Date.parse(cert.issued_at);
  if (!Number.isFinite(issued)) return null;
  return nowMs - issued;
}

/** Clock difference tolerated between the issuing and verifying runtime. */
const CLOCK_SKEW_MS = 30_000;

function intentMatchesCertificate(ticket: OpportunityTicket, cert: RiskCertificate, intent: ExecutionIntent): string | null {
  const expectedCertId = certificateId(cert, ticket.id);
  if (intent.ticket_id !== ticket.id) return "INTENT_TICKET_MISMATCH";
  if (intent.certificate_id !== expectedCertId) return "INTENT_CERTIFICATE_MISMATCH";
  if (Math.abs(intent.qty - cert.final_qty) > QTY_EPS) return "INTENT_QTY_MISMATCH";
  if (Math.abs(intent.stop - cert.final_stop) > PRICE_EPS) return "INTENT_STOP_MISMATCH";
  if (Math.abs(intent.target - cert.final_target) > PRICE_EPS) return "INTENT_TARGET_MISMATCH";
  if (intent.order_type === "LIMIT") {
    if (intent.limit_price === undefined) return "INTENT_LIMIT_PRICE_MISSING";
    if (Math.abs(intent.limit_price - cert.final_entry) > PRICE_EPS) return "INTENT_ENTRY_MISMATCH";
  }
  return null;
}

/**
 * Irrevocable hard-risk gate — no broker-bound order may proceed without passing this check.
 * Soft risk, debate, or LLM output cannot override a denied certificate.
 */
export function assertCertificateAllowsExecution(
  cert: RiskCertificate | null | undefined,
  ctx: CertificateExecutionContext,
): CertificateGateResult {
  if (!cert) return { ok: false, reason: "CERTIFICATE_MISSING" };
  if (!certificatePermitsExecution(cert)) {
    const block = cert.blocks[0] ?? "CERTIFICATE_DENIED";
    return { ok: false, reason: block };
  }

  const nowMs = ctx.nowMs ?? Date.now();
  const maxAgeMs = ctx.maxAgeMs ?? getCommitteeConfig().certMaxAgeMs;
  const ageMs = certAgeMs(cert, nowMs);
  if (ageMs === null) return { ok: false, reason: "CERTIFICATE_NO_ISSUED_AT" };
  if (ageMs > maxAgeMs) return { ok: false, reason: "CERTIFICATE_EXPIRED" };
  // A timestamp far in the future would otherwise buy unlimited extra life.
  if (ageMs < -CLOCK_SKEW_MS) return { ok: false, reason: "CERTIFICATE_NOT_YET_VALID" };

  if (ctx.intent) {
    const mismatch = intentMatchesCertificate(ctx.ticket, cert, ctx.intent);
    if (mismatch) return { ok: false, reason: mismatch };
  }

  return { ok: true };
}
