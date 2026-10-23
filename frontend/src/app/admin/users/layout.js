import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminShell from "@/components/admin/AdminShell";

// Same non-indexed/non-authorized shape as admin/analytics/layout.js —
// AdminAuthGate is UX only, requireAdmin.js on the backend is the real
// boundary for every /users/admin/* call this subtree makes.
export const metadata = {
  title: "Users",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export default function AdminUsersLayout({ children }) {
  return (
    <AdminAuthGate>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGate>
  );
}
