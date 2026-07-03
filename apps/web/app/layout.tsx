import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SalesOS — S.O.S. Command Center",
  description: "Multi-agent AI Operating System for S.O.S.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
