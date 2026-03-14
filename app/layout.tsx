import type { Metadata } from "next";
import { Geist, Geist_Mono,Pangolin } from "next/font/google";

import "./globals.css";
import "katex/dist/katex.min.css";
import { AuthProvider } from "@/hooks/AuthContext";
import React from "react";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next";
<script
   async
   defer
   src="https://www.faurya.com/js/script.js"
   data-domain="notovo.in"
   data-website-id="cmmap2t4k0002l404c23aooj7">
</script>

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pangolin = Pangolin({
  variable: "--font-pangolin",
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
        className={`${geistSans.variable} ${geistMono.variable} ${pangolin.variable} antialiased`}
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

