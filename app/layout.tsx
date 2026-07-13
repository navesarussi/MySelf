import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { GlobalAddMenu } from "@/components/global-add-menu";
import { MobileNav } from "@/components/mobile-nav";
import { NoZoom } from "@/components/no-zoom";
import { ToastLoader } from "@/components/toast-loader";
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
        <LocaleProvider locale={locale}>
          <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 pt-6 sm:px-6 sm:pb-16">
            <Nav />
            <main className="mt-6 flex-1">{children}</main>
          </div>
          <ToastLoader />
          <GlobalAddMenu />
          <MobileNav />
          <NoZoom />
        </LocaleProvider>
      </body>
    </html>
  );
}
