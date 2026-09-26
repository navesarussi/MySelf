import { execFileSync } from "node:child_process";

export type ExecRunOptions = {
  cwd?: string;
  inherit?: boolean;
};

/**
 * Run a subprocess and return trimmed stdout. When stdio is inherited, execFileSync
 * returns null — callers that only need side effects (npm ci, eas update) get "".
 */
export function execRun(
  cmd: string,
  args: string[],
  opts: ExecRunOptions = {},
  defaultCwd?: string,
): string {
  const output = execFileSync(cmd, args, {
    cwd: opts.cwd ?? defaultCwd,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}
