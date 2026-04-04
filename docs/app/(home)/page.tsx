import Link from "next/link";
import { ArrowRight, BookOpen, FolderTree, Globe, TerminalSquare } from "lucide-react";

const surfaces = [
  {
    title: "Export and automate",
    description:
      "Batch CLI commands for notes, transcripts, folders, export jobs, and single-meeting workflows.",
    href: "/docs/exporting",
    icon: TerminalSquare,
  },
  {
    title: "Browse meetings by folder",
    description:
      "Move through folders and meetings instead of one flat global list, in both scripts and interactive clients.",
    href: "/docs/meetings-and-folders",
    icon: FolderTree,
  },
  {
    title: "Run shared local workspaces",
    description:
      "Serve one local Granola Toolkit app instance to the browser, terminal UI, and attached clients.",
    href: "/docs/server-web-and-tui",
    icon: Globe,
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-16">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
            Granola Toolkit
          </p>
          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-fd-foreground sm:text-6xl">
              Work with Granola meetings beyond a flat export CLI.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-fd-muted-foreground">
              Granola Toolkit pulls together exports, meeting browsing, folders, a shared local
              server, a browser workspace, and a full-screen terminal UI on one TypeScript core.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 rounded-full bg-fd-foreground px-5 py-3 text-sm font-medium text-fd-background transition hover:opacity-90"
            >
              Start here
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-5 py-3 text-sm font-medium text-fd-foreground transition hover:bg-fd-accent"
            >
              Browse docs
              <BookOpen className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <aside className="rounded-3xl border border-fd-border bg-gradient-to-br from-fd-card to-fd-card/60 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
            Core surfaces
          </p>
          <ul className="mt-4 space-y-4 text-sm text-fd-muted-foreground">
            <li>
              <strong className="block text-fd-foreground">CLI</strong>
              Batch exports, auth, meetings, folders, server, and attach flows.
            </li>
            <li>
              <strong className="block text-fd-foreground">Web</strong>
              Local browser workspace with folder-aware meeting navigation and exports.
            </li>
            <li>
              <strong className="block text-fd-foreground">TUI</strong>
              Keyboard-first terminal workspace built on `pi-tui`.
            </li>
          </ul>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {surfaces.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-3xl border border-fd-border bg-fd-card p-6 transition hover:-translate-y-0.5 hover:border-fd-foreground/30 hover:shadow-sm"
          >
            <Icon className="h-5 w-5 text-fd-muted-foreground transition group-hover:text-fd-foreground" />
            <h2 className="mt-4 text-xl font-semibold text-fd-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
