/** Committee feature flags — env-driven; shadow is default-on until explicitly disabled. */

export type CommitteeConfig = {
  enabled: boolean;
  shadow: boolean;
  maxPerTick: number;
  timeoutMs: number;
  /** Max age of a RiskCertificate before execution gate rejects it (defaults to timeout budget). */
  certMaxAgeMs: number;
};

const DEFAULT_MAX_PER_TICK = 3;
const DEFAULT_TIMEOUT_MS = 120_000;

function envBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return v === "true" || v === "1";
}

function envInt(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

export function getCommitteeConfig(): CommitteeConfig {
  const timeoutMs = envInt("COMMITTEE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const certMaxAgeMs = envInt("COMMITTEE_CERT_MAX_AGE_MS", timeoutMs);
  return {
    enabled: envBool("COMMITTEE_ENABLED", false),
    shadow: envBool("COMMITTEE_SHADOW", true),
    maxPerTick: envInt("COMMITTEE_MAX_PER_TICK", DEFAULT_MAX_PER_TICK),
    timeoutMs,
    certMaxAgeMs,
  };
}

export const COMMITTEE_MODEL_STAGE_KEYS = Object.freeze([
  "technical",
  "fundamental",
  "debate",
  "softRisk",
] as const);

export type CommitteeModelStage = (typeof COMMITTEE_MODEL_STAGE_KEYS)[number];

export const COMMITTEE_PROMPT_VERSIONS = Object.freeze({
  technical: "committee-technical-v1",
  fundamental: "committee-fundamental-v1",
  bull: "committee-bull-v1",
  bear: "committee-bear-v1",
  facilitator: "committee-facilitator-v1",
  softRisk: "committee-soft-risk-v1",
});
