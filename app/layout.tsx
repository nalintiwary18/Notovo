import type { Metadata } from "next";
import { Geist, Geist_Mono, Gochi_Hand } from "next/font/google";

import "./globals.css";
import "katex/dist/katex.min.css";
import { AuthProvider } from "@/hooks/AuthContext";
import React from "react";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gochiHand = Gochi_Hand({
  variable: "--font-gochi-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Notovo"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${gochiHand.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      <SpeedInsights />
      </body>
    </html>
  );
}

