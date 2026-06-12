import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SentryInit } from "./sentry-init";

export const metadata: Metadata = {
  title: "Skrowt",
  description: "Turn websites into structured data — records, alerts, and exports."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@300..700&family=Geist+Mono:wght@400..600&display=swap"
        />
      </head>
      <body className="font-sans">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
