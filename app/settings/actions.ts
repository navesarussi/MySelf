"use server";

import { revalidatePath } from "next/cache";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { deleteIntegrationToken } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { setFlash } from "@/lib/flash-actions";

export async function triggerGoogleSync() {
  try {
    const { imported } = await syncGoogleCalendar();
    await setFlash(`יומן גוגל סונכרן — ${imported} אירועים`);
  } catch {
    await setFlash("סנכרון נכשל — נסה שוב", "error");
  }
  revalidatePath("/settings");
  revalidatePath("/timeline");
  revalidatePath("/");
}

export async function disconnectGoogle() {
  await deleteIntegrationToken(GOOGLE_PROVIDER);
  await setFlash("נותק מיומן גוגל");
  revalidatePath("/settings");
  revalidatePath("/timeline");
}
