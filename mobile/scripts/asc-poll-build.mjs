#!/usr/bin/env node
/**
 * Poll App Store Connect until a build >= minVersion appears (or timeout).
 * Usage: node scripts/asc-poll-build.mjs [minBuildNumber]
 */
import fs from "fs";
import crypto from "crypto";

const keyPath = process.env.ASC_API_KEY_PATH
  ?? new URL("../asc-api-key.p8", import.meta.url).pathname;
const keyId = process.env.ASC_API_KEY_ID ?? "X3N8885G95";
const issuerId = process.env.ASC_API_KEY_ISSUER_ID ?? "3a825a1a-0b43-487a-9ba4-1ab24a88f553";
const appId = process.env.ASC_APP_ID ?? "6791144676";
const minBuild = Number(process.argv[2] ?? process.env.MIN_BUILD ?? "1");
const maxWaitMs = Number(process.env.ASC_POLL_MAX_MS ?? 600_000);
const intervalMs = Number(process.env.ASC_POLL_INTERVAL_MS ?? 30_000);

function jwt() {
  const key = fs.readFileSync(keyPath, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" })
  ).toString("base64url");
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${sig.toString("base64url")}`;
}

async function latestBuilds() {
  const url = `https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt()}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.data ?? [];
}

const start = Date.now();
while (Date.now() - start < maxWaitMs) {
  const builds = await latestBuilds();
  const hit = builds.find((b) => Number(b.attributes?.version) >= minBuild);
  if (hit) {
    const { version, processingState, uploadedDate } = hit.attributes ?? {};
    console.log(`ASC build ${version} ${processingState} (${uploadedDate})`);
    if (processingState === "VALID" || processingState === "PROCESSING") process.exit(0);
  }
  console.log(`Waiting for build >= ${minBuild}... (${Math.round((Date.now() - start) / 1000)}s)`);
  await new Promise((r) => setTimeout(r, intervalMs));
}

console.error(`Timeout: no ASC build >= ${minBuild} after ${maxWaitMs}ms`);
process.exit(1);
