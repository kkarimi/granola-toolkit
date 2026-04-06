import Link from "next/link";
import { ArrowRight, BookOpen, Bot, Globe, RefreshCw } from "lucide-react";

const surfaces = [
  {
    title: "Sync and own your archive",
    description:
      "Keep a local Granola runtime warm, cache meetings aggressively, and stop depending on a single brittle app path.",
    href: "/docs/server-web-and-tui",
    icon: RefreshCw,
  },
  {
    title: "Bring your own agents",
    description:
      "Run your own prompts, harnesses, and reviewable pipelines against Granola transcripts with OpenRouter, OpenAI-compatible APIs, or Codex.",
    href: "/docs/automation",
    icon: Bot,
  },
  {
    title: "Work anywhere locally",
    description:
      "Use the same local meeting state from the CLI, browser workspace, terminal UI, and attached clients.",
    href: "/docs/getting-started",
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
              The unofficial open-source swiss army knife for Granola.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-fd-muted-foreground">
              Granola Toolkit gives you a local-first way to sync, search, export, review, and
              automate Granola meetings with your own tools and your own agents instead of living
              inside one closed workflow.
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
            Why people use it
          </p>
          <ul className="mt-4 space-y-4 text-sm text-fd-muted-foreground">
            <li>
              <strong className="block text-fd-foreground">Local-first control</strong>
              Keep a local copy of your meeting archive, not just whatever the Granola app exposes
              today.
            </li>
            <li>
              <strong className="block text-fd-foreground">BYOA pipelines</strong>
              Turn transcripts into reviewable notes and follow-ups with your own prompts and
              providers.
            </li>
            <li>
              <strong className="block text-fd-foreground">Three surfaces, one core</strong>
              CLI, browser, and TUI all ride on the same local runtime instead of drifting apart.
            </li>
            <li>
              <strong className="block text-fd-foreground">Open-source escape hatch</strong>
              Exports, folders, search, automation, and integrations live in one hackable TypeScript
              codebase.
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
