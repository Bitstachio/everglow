import { cn } from "@/lib/cn";
import localFont from "next/font/local";
import { ReactNode } from "react";
import "./globals.css";

const funnelSans = localFont({
  src: [
    { path: "../fonts/funnel-sans/funnel-sans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/funnel-sans/funnel-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/funnel-sans/funnel-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-funnel-sans",
  display: "swap",
});

const funnelDisplay = localFont({
  src: [{ path: "../fonts/funnel-display/funnel-display-600.woff2", weight: "600", style: "normal" }],
  variable: "--font-funnel-display",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/plex-mono/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-mono/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

const nanumPen = localFont({
  src: [{ path: "../fonts/nanum-pen/NanumPenScript-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-nanum-pen",
  display: "swap",
});

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className="scroll-smooth">
    <body
      className={cn(
        funnelSans.variable,
        funnelDisplay.variable,
        plexMono.variable,
        nanumPen.variable,
        "bg-background text-foreground font-sans antialiased",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 bg-[url('/fx-noise.svg')] bg-size-[220px_220px] opacity-10 mix-blend-screen"
      />
      {children}
    </body>
  </html>
);

export default RootLayout;
