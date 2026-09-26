const SECRET_KEY = /(token|secret|password|authorization|api[_-]?key|refresh|access|bearer|cookie|session)/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function redactString(value: string): string {
  return value.replace(BEARER, "Bearer [REDACTED]").replace(JWT, "[REDACTED_JWT]");
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactValue(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redactUpstreamBody(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === "string") {
    const trimmed = body.slice(0, 4000);
    try {
      return redactValue(JSON.parse(trimmed));
    } catch {
      return redactString(trimmed);
    }
  }
  return redactValue(body);
}
