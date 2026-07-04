import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIゲーム工房 | Japan Game Source Pack Console",
  description:
    "Operator console for Japan game campaigns. Supported languages: English and Japanese.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
