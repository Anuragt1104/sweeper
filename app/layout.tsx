import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sweeper × N+1 Machine · Agent Desk",
  description:
    "Autonomous multi-agent trading desk on TxLINE — Arena, Causal rail, Horizon, shadow PnL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
