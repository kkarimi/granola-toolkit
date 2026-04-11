import Link from "next/link";
import { ArrowRight, BookOpen, Code2, Globe, RefreshCw, Zap } from "lucide-react";

const surfaces = [
  {
    title: "Start from a real workflow",
    description:
      "Open the practical paths first: local workspace, Obsidian publishing, raw exports, and terminal-first use.",
    href: "/docs/workflows",
    icon: BookOpen,
  },
  {
    title: "Own your archive locally",
    description:
      "Keep a local Granola runtime warm, sync once, and stop depending on a single brittle app path.",
    href: "/docs/server-web-and-tui",
    icon: RefreshCw,
  },
  {
    title: "Publish into your knowledge base",
    description:
      "Send meetings into folders you control or straight into an Obsidian vault without leaving Gran.",
    href: "/docs/exporting",
    icon: Globe,
  },
  {
    title: "Work anywhere locally",
    description:
      "Use the same local meeting state from the CLI, browser workspace, terminal UI, and attached clients.",
    href: "/docs/getting-started",
    icon: RefreshCw,
  },
  {
    title: "Build with the SDK",
    description:
      "Reuse Gran's local-first runtime, exports, and service connection model directly from Node and TypeScript.",
    href: "/docs/sdk",
    icon: Code2,
  },
  {
    title: "Pipe Gran into other tools",
    description:
      "Follow the local event stream and fetch meeting payloads without tightly coupling Gran to another local tool.",
    href: "/docs/integrations",
    icon: Zap,
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-16">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
            Gran 👵🏻
          </p>
          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-fd-foreground sm:text-6xl">
              The local workspace for your Granola archive.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-fd-muted-foreground">
              Gran 👵🏻 syncs your meetings locally, gives you a browser and terminal workspace, and
              lets you publish them into folders or Obsidian vaults you control.
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
              href="/docs/workflows"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-5 py-3 text-sm font-medium text-fd-foreground transition hover:bg-fd-accent"
            >
              Workflows and examples
              <BookOpen className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <aside className="rounded-3xl border border-fd-border bg-gradient-to-br from-fd-card to-fd-card/60 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-fd-muted-foreground">
            Why people use it
          </p>
          <ul className="mt-4 space-y-4 text-sm text-fd-muted-foreground">
            <li>
              <strong className="block text-fd-foreground">Local archive</strong>
              Keep a usable local copy of your meetings, notes, transcripts, and folders.
            </li>
            <li>
              <strong className="block text-fd-foreground">Fast browsing and search</strong>
              Open the same archive from the browser, terminal, or CLI without re-fetching
              everything every time.
            </li>
            <li>
              <strong className="block text-fd-foreground">Durable exports</strong>
              Publish notes and transcripts into folders and Obsidian vaults you own.
            </li>
            <li>
              <strong className="block text-fd-foreground">Clean local seams</strong>
              Events, hooks, and JSON fetch commands are there when you want to build on top.
            </li>
          </ul>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
