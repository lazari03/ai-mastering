import LoginClient from "./LoginClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Sign In — Auralith Forge AI Mastering",
  description: "Sign in or create a free account to start mastering tracks with Auralith Forge's adaptive DSP engine.",
  path: "/login",
  keywords: ["AI mastering sign up", "mastering studio login"],
});

export default function LoginPage() {
  return <LoginClient />;
}
