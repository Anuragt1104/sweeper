import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sweeper × N+1 Machine · Live Horizon Deck",
  description:
    "Live TxLINE next-event Horizons with an autonomous market-quality sentinel, trading agents, and proof-backed replay.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
