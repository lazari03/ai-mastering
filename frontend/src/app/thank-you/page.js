import { buildMetadata } from "@/lib/seo";
import ThankYouPageClient from "./ThankYouPageClient";

export const metadata = buildMetadata({
  title: "Thank you",
  description: "Your purchase is confirmed.",
  path: "/thank-you",
  noindex: true,
});

export default function ThankYouPage({ searchParams }) {
  return <ThankYouPageClient plan={searchParams?.plan} item={searchParams?.item} price={searchParams?.price} />;
}
