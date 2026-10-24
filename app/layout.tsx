import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header, Footer } from "@/components/site-shell";
import "./globals.css";
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
export const metadata: Metadata = {
  title: {
    default: "Second Look — A fresh perspective on your dating profile",
    template: "%s · Second Look",
  },
  description:
    "Real people. Honest feedback. Upload your dating profile screenshots and find out what to keep, what to change, and how to make a better first impression.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
