import { createFileRoute } from "@tanstack/react-router";
import { WebsiteShell } from "@/components/WebsiteShell";
import changelog from "../../CHANGELOG.md?raw";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog - OpenLedgerApp" },
      {
        name: "description",
        content: "Release notes and development changes for OpenLedgerApp open-source accounting.",
      },
      { property: "og:title", content: "Changelog - OpenLedgerApp" },
      {
        property: "og:description",
        content:
          "What's changed in OpenLedgerApp, from the first usable web release to the public website.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChangelogPage,
});

function ChangelogPage() {
  return (
    <WebsiteShell>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="release-notes">
          {changelog.split("\n").map((line, index) => {
            if (line.startsWith("# "))
              return (
                <h1 key={index} className="font-display text-4xl">
                  {line.slice(2)}
                </h1>
              );
            if (line.startsWith("## "))
              return (
                <h2 key={index} className="mt-12 border-t border-border pt-8 font-display text-2xl">
                  {line.slice(3).replace(/\[([^\]]+)\]/g, "$1")}
                </h2>
              );
            if (line.startsWith("### "))
              return (
                <h3 key={index} className="mb-3 mt-7 font-semibold">
                  {line.slice(4)}
                </h3>
              );
            if (line.startsWith("- "))
              return (
                <p key={index} className="relative my-2 pl-5 leading-7 text-muted-foreground">
                  <span aria-hidden="true" className="absolute left-0 text-primary">
                    •
                  </span>
                  {line.slice(2)}
                </p>
              );
            return line.trim() ? (
              <p key={index} className="mt-5 leading-7 text-muted-foreground">
                {line}
              </p>
            ) : null;
          })}
        </div>
      </div>
    </WebsiteShell>
  );
}
