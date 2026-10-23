import { redirect } from "next/navigation";

// /admin has no page of its own; the dashboard starts at analytics.
export default function AdminIndex() {
  redirect("/admin/analytics");
}
