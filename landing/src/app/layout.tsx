import { cn } from "@/lib/cn";
import { Outfit } from "next/font/google";
import { ReactNode } from "react";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className="scroll-smooth">
    <body className={cn(outfit.variable, "font-sans antialiased")}>{children}</body>
  </html>
);

export default RootLayout;
