import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminShell from "@/components/admin/AdminShell";

// Spec section 14/35 — never indexed, never archived, never appears in
// public navigation/sitemap/footer (sitemap.js is an explicit allowlist
// of public routes and this was never added to it; robots.js additionally
// disallows /admin as a courtesy, not as security). This metadata is the
// noindex/nofollow/noarchive half of that; AdminAuthGate + requireAdmin.js
// (backend) are the actual access control.
export const metadata = {
  title: "Analytics",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export default function AdminAnalyticsLayout({ children }) {
  return (
    <AdminAuthGate>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGate>
  );
}
