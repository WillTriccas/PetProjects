import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wine & Words",
  description: "A private book club companion — events, reviews, and nostalgia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cream font-sans text-burgundy-dark antialiased">
        {children}
      </body>
    </html>
  );
}
