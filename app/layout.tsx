import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/components/locale-provider";
import { getLocale, getMessages, isRtl } from "@/lib/i18n";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0c10",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = getMessages(locale);
  return {
    title: m.meta.title,
    description: m.meta.description,
    robots: { index: false, follow: false },
    icons: {
      icon: "/logo.png",
      apple: "/logo.png",
    },
  };
}

/** Minimal root layout for /privacy and non-legacy routes. Expo SPA is served via middleware. */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={heebo.variable}>
      <body className="font-sans antialiased overflow-x-hidden">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
