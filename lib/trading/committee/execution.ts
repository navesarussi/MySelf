import { createHash } from "crypto";
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
}): ParseResult<ExecutionIntent> {
  const certId = certificateId(input.certificate, input.ticket.id);
  const order_type = input.orderType ?? "LIMIT";
  return parseExecutionIntent({
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
}
