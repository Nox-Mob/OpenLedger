import { createFileRoute } from "@tanstack/react-router";
import { WebsiteShell } from "@/components/WebsiteShell";
import changelog from "../../CHANGELOG.md?raw";

export const Route = createFileRoute("/changelog")({
  head: () => ({ meta: [
    { title: "Changelog — Open Ledger" }, { name: "description", content: "Release notes and development changes for Open Ledger open-source accounting." },
    { property: "og:title", content: "Changelog — Open Ledger" }, { property: "og:description", content: "What's changed in Open Ledger, from the first usable web release to the public website." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: ChangelogPage,
});

function ChangelogPage() {
  return <WebsiteShell><div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20"><p className="website-eyebrow">The project, in progress</p><div className="release-notes mt-5">{changelog.split("\n").map((line, index) => {
    if (line.startsWith("# ")) return <h1 key={index} className="font-display text-4xl">{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={index} className="mt-12 border-t border-border pt-8 font-display text-2xl">{line.slice(3).replace(/\[([^\]]+)\]/g, "$1")}</h2>;
    if (line.startsWith("### ")) return <h3 key={index} className="mb-3 mt-7 font-semibold">{line.slice(4)}</h3>;
    if (line.startsWith("- ")) return <p key={index} className="relative my-2 pl-5 leading-7 text-muted-foreground"><span aria-hidden="true" className="absolute left-0 text-primary">•</span>{line.slice(2)}</p>;
    return line.trim() ? <p key={index} className="mt-5 leading-7 text-muted-foreground">{line}</p> : null;
  })}</div></div></WebsiteShell>;
}