"use server";

import { revalidatePath } from "next/cache";
import { deleteIntegrationToken } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { setFlash } from "@/lib/flash-actions";

export async function disconnectGoogle() {
  await deleteIntegrationToken(GOOGLE_PROVIDER);
  await setFlash("flash.googleDisconnected");
  revalidatePath("/settings");
  revalidatePath("/timeline");
}
