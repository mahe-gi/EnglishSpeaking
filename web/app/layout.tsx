import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ntalo — Speak. Connect. Grow.",
  description: "Mobile-first spoken English practice for job interviews and workplace conversations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
