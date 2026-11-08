import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-deva",
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fees · Company A Coaching",
  description: "Fee ledger, parent portal and reminders",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fcfcfb" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${devanagari.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: "var(--font-inter), var(--font-deva), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
