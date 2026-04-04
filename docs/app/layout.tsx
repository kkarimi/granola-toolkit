import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { IBM_Plex_Sans } from "next/font/google";
import type { Metadata } from "next";

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
    "Documentation for Granola Toolkit, a toolkit for working with Granola meetings, notes, transcripts, folders, and local workspaces.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_DOCS_SITE_URL ?? "http://localhost:3000"),
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={ibmPlexSans.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
