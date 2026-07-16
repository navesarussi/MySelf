import { Nav } from "@/components/nav";
import { GlobalAddMenu } from "@/components/global-add-menu";
import { MobileNav } from "@/components/mobile-nav";
import { NoZoom } from "@/components/no-zoom";
import { ToastLoader } from "@/components/toast-loader";

/** Chrome for the preserved Next.js website under /legacy (root layout owns html/body). */
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 pt-6 sm:px-6 sm:pb-16">
        <Nav />
        <main className="mt-6 flex-1">{children}</main>
      </div>
      <ToastLoader />
      <GlobalAddMenu />
      <MobileNav />
      <NoZoom />
    </>
  );
}
