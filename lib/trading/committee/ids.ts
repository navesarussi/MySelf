import { createHash } from "crypto";
import type { CommitteeStrategy } from "./types";

/** Deterministic ticket id: uppercase symbol + strategy + bar close ISO time. */
export function opportunityTicketId(symbol: string, strategy: CommitteeStrategy | string, barTimeIso: string): string {
  const raw = `${symbol.toUpperCase()}|${strategy}|${barTimeIso}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
