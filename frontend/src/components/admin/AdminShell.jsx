"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import NotificationBell from "./NotificationBell";
import { useLanguage } from "@/lib/i18n";
import {
  IconGrid,
  IconRadio,
  IconList,
  IconFunnel,
  IconTarget,
  IconFileText,
  IconSearch,
  IconDollar,
  IconAlertTriangle,
  IconRefresh,
  IconUsers,
} from "./icons";

// Internal business dashboard (spec section 37) — clarity/density/speed
// over decoration. One horizontal scrollable tab strip works identically
// at every width (phone through desktop) rather than maintaining two
// separate nav layouts, and never overflows awkwardly on a narrow screen —
// it just scrolls, same convention as a native app's tab bar.
const NAV = [
  { href: "/admin/analytics/behavior", labelKey: "admin.nav.behavior", Icon: IconTarget },
  { href: "/admin/analytics", labelKey: "admin.nav.overview", Icon: IconGrid },
  { href: "/admin/analytics/live", labelKey: "admin.nav.live", Icon: IconRadio },
  { href: "/admin/analytics/sessions", labelKey: "admin.nav.sessions", Icon: IconList },
  { href: "/admin/analytics/funnel", labelKey: "admin.nav.funnel", Icon: IconFunnel },
  { href: "/admin/analytics/acquisition", labelKey: "admin.nav.acquisition", Icon: IconTarget },
  { href: "/admin/analytics/pages", labelKey: "admin.nav.pages", Icon: IconFileText },
  { href: "/admin/analytics/seo", labelKey: "admin.nav.seo", Icon: IconSearch },
  { href: "/admin/analytics/sales", labelKey: "admin.nav.sales", Icon: IconDollar },
  { href: "/admin/analytics/errors", labelKey: "admin.nav.errors", Icon: IconAlertTriangle },
  { href: "/admin/analytics/retention", labelKey: "admin.nav.retention", Icon: IconRefresh },
  { href: "/admin/users", labelKey: "admin.nav.users", Icon: IconUsers },
];

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#0b0d10] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0d10]/95 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 pt-3 sm:px-6">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.16em] text-brass">{t("admin.badge")}</p>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link href="/app" className="text-[11px] text-zinc-500 hover:text-zinc-300">
              ← {t("admin.nav.backToApp")}
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 pb-2 pt-3 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => {
            const active = item.href === "/admin/analytics" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                  active ? "bg-brass text-[#100b08]" : "border border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                }`}
              >
                <Icon width={13} height={13} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto min-w-0 max-w-[1200px] px-4 pb-16 pt-5 sm:px-6">{children}</main>
    </div>
  );
}
