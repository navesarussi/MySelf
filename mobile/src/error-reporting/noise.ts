export function shouldSkipClientReport(input: { message: string; httpStatus?: number; route?: string }): boolean {
  if (input.httpStatus === 401) return true;
  const msg = input.message.toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("aborted") ||
    msg.includes("no_server") ||
    input.message === "not_connected" ||
    input.message === "no_price" ||
    input.message.startsWith("token_refresh_failed")
  );
}
