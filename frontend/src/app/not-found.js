import StatePanel from "@/components/site/StatePanel";
import { LinkList, PageShell } from "@/components/site/Page";

export const metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <StatePanel
        eyebrow="404"
        title="This page doesn't exist"
        body="The link might be broken, or the page may have moved. Let's get you back on track."
        headingLevel={1}
        actions={[
          { href: "/", label: "Go home" },
          { href: "/app", label: "Open the app" },
        ]}
      />
      <div className="mx-auto mt-4 grid max-w-[720px] gap-10 border-t border-border-subtle pt-10 sm:grid-cols-2">
        <LinkList
          title="Popular tools"
          links={[
            { href: "/ai-mastering-online", label: "AI mastering online" },
            { href: "/chord-detector", label: "Chord detector" },
            { href: "/lufs-meter", label: "LUFS meter" },
            { href: "/tools", label: "All free tools" },
          ]}
        />
        <LinkList
          title="Read"
          links={[
            { href: "/blog", label: "Mastering guides" },
            { href: "/mastering-loudness-targets", label: "Loudness targets by genre" },
          ]}
        />
      </div>
    </PageShell>
  );
}
