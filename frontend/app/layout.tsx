import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SentryInit } from "./sentry-init";

export const metadata: Metadata = {
  title: "ScrapTheWeb",
  description: "Visual recipe builder for public listing pages"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
