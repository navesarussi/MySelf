import { createHash } from "crypto";
import { assertCertificateAllowsExecution } from "./gate";
import type { ExecutionBroker, ExecutionIntent, OpportunityTicket, RiskCertificate } from "./types";
import { parseExecutionIntent, type ParseResult } from "./helpers";

export function certificateId(cert: RiskCertificate, ticketId: string): string {
  const raw = `${ticketId}|${cert.final_entry}|${cert.final_stop}|${cert.final_qty}|${cert.ok}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function buildExecutionIntent(input: {
  ticket: OpportunityTicket;
  certificate: RiskCertificate;
  auditRef: string;
  broker: ExecutionBroker;
  orderType?: "LIMIT" | "MARKET";
  nowMs?: number;
}): ParseResult<ExecutionIntent> {
  const gate = assertCertificateAllowsExecution(input.certificate, { ticket: input.ticket, nowMs: input.nowMs });
  if (!gate.ok) return { ok: false, error: gate.reason };

  const certId = certificateId(input.certificate, input.ticket.id);
  const order_type = input.orderType ?? "LIMIT";
  const intentR = parseExecutionIntent({
    ticket_id: input.ticket.id,
    certificate_id: certId,
    broker: input.broker,
    order_type,
    qty: input.certificate.final_qty,
    limit_price: order_type === "LIMIT" ? input.certificate.final_entry : undefined,
    stop: input.certificate.final_stop,
    target: input.certificate.final_target,
    client_order_id: `${input.auditRef.slice(0, 18)}-cm-in`,
    audit_ref: input.auditRef,
  });
  if (!intentR.ok) return intentR;

  const intentGate = assertCertificateAllowsExecution(input.certificate, {
    ticket: input.ticket,
    intent: intentR.data,
    nowMs: input.nowMs,
  });
  if (!intentGate.ok) return { ok: false, error: intentGate.reason };
  return intentR;
}

/**
 * Stub for a future non-shadow executor — builds intent only when hard-risk gate passes.
 * Does not submit to any broker (Phase D remains shadow-default).
 */
export function buildCommitteeExecutionIntent(input: {
  ticket: OpportunityTicket;
  certificate: RiskCertificate;
  auditRef: string;
  broker?: ExecutionBroker;
  orderType?: "LIMIT" | "MARKET";
  nowMs?: number;
}): ParseResult<ExecutionIntent> {
  return buildExecutionIntent({
    ...input,
    broker: input.broker ?? "ALPACA_PAPER",
  });
}
