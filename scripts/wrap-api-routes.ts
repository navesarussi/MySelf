/**
 * One-shot codemod: wrap App Router handlers with withRouteHandler().
 * Safe to re-run — skips files that already import the helper.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORT = 'import { withRouteHandler } from "@/lib/api/with-route-handler";';
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function listRouteFiles(): string[] {
  const dir = path.join(ROOT, "app/api");
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (name === "route.ts") out.push(full);
    }
  }
  return out.sort();
}

function findFunctionEnd(lines: string[], startIdx: number): number {
  const startLine = lines[startIdx];
  const bodyBraceIdx = startLine.lastIndexOf("{");
  if (bodyBraceIdx < 0) return -1;

  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const from = i === startIdx ? bodyBraceIdx : 0;
    for (let j = from; j < line.length; j++) {
      const ch = line[j];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function wrapExportAsyncFunction(source: string): string {
  let changed = false;
  const lines = source.split("\n");
  const skip = source.includes("withRouteHandler");

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/);
    if (!m || skip) continue;

    const method = m[1];
    const end = findFunctionEnd(lines, i);
    if (end < 0) continue;

    lines[i] = lines[i].replace(
      /^export async function (GET|POST|PUT|PATCH|DELETE)/,
      `export const ${method} = withRouteHandler(async function ${method}`
    );
    lines[end] = `${lines[end]});`;
    changed = true;
  }

  if (!changed || skip) return source;

  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("import ")) continue;
    let j = i;
    while (j + 1 < lines.length && !lines[j].includes(" from ")) j += 1;
    insertAt = j + 1;
    i = j;
  }
  lines.splice(insertAt, 0, IMPORT);
  return lines.join("\n");
}

function wrapConstHandler(source: string): string {
  if (source.includes("withRouteHandler")) return source;

  const exportMatch = source.match(
    new RegExp(`^export const (${METHODS.join("|")}) = (\\w+);`, "m")
  );
  if (!exportMatch) return source;

  const handlerName = exportMatch[2];
  const lines = source.split("\n");
  const fnLine = lines.findIndex((l) => l.match(new RegExp(`^async function ${handlerName}\\s*\\(`)));
  if (fnLine < 0) return source;

  const end = findFunctionEnd(lines, fnLine);
  if (end < 0) return source;

  lines[fnLine] = lines[fnLine].replace(
    new RegExp(`^async function ${handlerName}`),
    `const ${handlerName} = withRouteHandler(async function ${handlerName}`
  );
  lines[end] = `${lines[end]});`;

  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("import ")) continue;
    let j = i;
    while (j + 1 < lines.length && !lines[j].includes(" from ")) j += 1;
    insertAt = j + 1;
    i = j;
  }
  lines.splice(insertAt, 0, IMPORT);
  return lines.join("\n");
}

function transformFile(file: string): boolean {
  const before = readFileSync(file, "utf8");
  if (before.includes("withRouteHandler")) return false;

  let after = wrapExportAsyncFunction(before);
  after = wrapConstHandler(after);
  if (after === before) return false;
  writeFileSync(file, after, "utf8");
  return true;
}

const files = listRouteFiles();
let changed = 0;
for (const file of files) {
  if (file.endsWith("client-errors/route.ts")) continue;
  if (transformFile(file)) {
    changed += 1;
    console.log("wrapped", path.relative(ROOT, file));
  }
}
console.log(`done — wrapped ${changed} route files`);
