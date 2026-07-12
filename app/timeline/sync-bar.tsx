import Link from "next/link";
import { getIntegrationToken, isGoogleConnected } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { triggerGoogleSync } from "@/app/settings/actions";
import { SubmitButton } from "@/components/ui";

function formatWhen(iso: string | null) {
  if (!iso) return "טרם סונכרן";
  return new Date(iso).toLocaleString("he-IL");
}

export async function TimelineSyncBar() {
  const connected = await isGoogleConnected();
  if (!connected) {
    return (
      <p className="mb-4 text-sm text-muted">
        <Link href="/settings" className="text-accent hover:underline">
          חבר יומן גוגל
        </Link>{" "}
        כדי לייבא אירועים לציר הזמן
      </p>
    );
  }

  const token = await getIntegrationToken(GOOGLE_PROVIDER);

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <span className="text-muted">סונכרן לאחרונה: {formatWhen(token?.last_sync_at ?? null)}</span>
      <form action={triggerGoogleSync}>
        <SubmitButton>סנכרון עכשיו</SubmitButton>
      </form>
    </div>
  );
}
