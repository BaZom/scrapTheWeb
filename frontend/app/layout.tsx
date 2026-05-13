import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SentryInit } from "./sentry-init";

export const metadata: Metadata = {
  title: "ScrapTheWeb",
  description: "Turn public listing pages into structured records, alerts, and exports."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="font-sans">
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
