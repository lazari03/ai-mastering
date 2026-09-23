import { buildMetadata } from "@/lib/seo";
import ThankYouPageClient from "./ThankYouPageClient";

export const metadata = buildMetadata({
  title: "Thank you",
  description: "Your purchase is confirmed.",
  path: "/thank-you",
  noindex: true,
});

export default async function ThankYouPage({ searchParams }) {
  const { plan, item, price } = (await searchParams) || {};
  return <ThankYouPageClient plan={plan} item={item} price={price} />;
}
