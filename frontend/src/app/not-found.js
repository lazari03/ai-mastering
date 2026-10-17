import NotFoundContent from "@/components/site/NotFoundContent";
import { PageShell } from "@/components/site/Page";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <NotFoundContent />
    </PageShell>
  );
}
