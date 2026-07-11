import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ToastLoader } from "@/components/toast-loader";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "מרכז השליטה | נוה סרוסי",
  description: "בסיס הידע האישי — ציר זמן, משימות, הרגלים ומטרות, קשרים, ספריית תוכן",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased">
        <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-16 pt-6 sm:px-6">
          <Nav />
          <main className="mt-6 flex-1">{children}</main>
        </div>
        <ToastLoader />
      </body>
    </html>
  );
}
