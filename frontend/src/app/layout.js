import { Space_Grotesk, Bricolage_Grotesque } from "next/font/google";

import "./globals.css";

const titleFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-title",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

export const metadata = {
  title: "AI Mastering Studio",
  description: "Production-ready AI mastering workflow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${titleFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
