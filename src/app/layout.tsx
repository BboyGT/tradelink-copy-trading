import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "TRADE LINK - Copy-Trading Terminal",
  description:
    "Multi-page copy-trading dashboard with routed analytics, portfolio, risk controls, MT4 and MT5 terminal monitoring, and trade history.",
  keywords: ["copy trading", "multi-broker", "trade replication", "signal providers", "Deriv", "cTrader", "MetaTrader", "position terminal"],
  authors: [{ name: "TRADE LINK" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground rm-scanlines">
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster />
        </Providers>
      </body>
    </html>
  );
}
