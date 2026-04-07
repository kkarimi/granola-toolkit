import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { IBM_Plex_Sans } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { docsSearchPublicRoute, docsSiteUrl } from "@/lib/shared";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Granola Toolkit Docs",
    template: "%s | Granola Toolkit Docs",
  },
  description:
    "Documentation for Granola Toolkit, the unofficial open-source Swiss army knife for syncing, browsing, exporting, and automating Granola meetings locally.",
  metadataBase: new URL(docsSiteUrl),
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={ibmPlexSans.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            options: {
              api: docsSearchPublicRoute,
              type: "static",
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
