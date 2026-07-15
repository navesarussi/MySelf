import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSession } from "../src/session";
import { Loading } from "../src/components/ui";

/** Deep-link landing: myself://auth?token=… (or exp://…/--/auth in Expo Go) */
export default function AuthCallbackScreen() {
  const { token: paramToken } = useLocalSearchParams<{ token?: string }>();
  const { signIn } = useSession();
  const router = useRouter();

  useEffect(() => {
    const token = typeof paramToken === "string" ? paramToken : "";
    if (!token) {
      router.replace("/login");
      return;
    }
    signIn(token)
      .then(() => router.replace("/"))
      .catch(() => router.replace("/login"));
  }, [paramToken, signIn, router]);

  return <Loading />;
}
