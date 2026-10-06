import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ArrowRight, Server, Cloud } from "lucide-react";
import { WebsiteShell } from "@/components/WebsiteShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "Get Started - OpenLedgerApp" },
      {
        name: "description",
        content:
          "Download OpenLedgerApp development source and choose a cloud-hosted or self-hosted backend setup.",
      },
      { property: "og:title", content: "Get Started - OpenLedgerApp" },
      {
        property: "og:description",
        content:
          "Development source and setup guidance for running your own OpenLedgerApp web application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GetStartedPage,
});

function GetStartedPage() {
  return (
    <WebsiteShell>
      <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="website-eyebrow">Development source / Web edition</p>
        <h1 className="mt-5 font-display text-4xl sm:text-5xl">Make it your own.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          OpenLedgerApp is available as source code today. This is a web application you set up—not
          a one-click desktop installer.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button size="lg" asChild>
            <a href="/downloads/open-ledger-source.zip" download>
              <Download /> Download source ZIP
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/changelog">
              Read the changelog <ArrowRight />
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Includes the README setup guide and Markdown changelog. Private environment files and
          installed dependencies are excluded.
        </p>
        <section className="mt-12 border-t border-border pt-9">
          <h2 className="font-display text-2xl">Two ways to set up the web app</h2>
          <div className="mt-7 grid gap-8 sm:grid-cols-2">
            <div>
              <Cloud className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">Cloud-hosted backend</h3>
              <p className="mt-3 leading-7 text-muted-foreground">
                Run the web app on your server, with a cloud-hosted database and sign-in service.
                Follow Path 1 in the included README.
              </p>
            </div>
            <div>
              <Server className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">Fully self-hosted</h3>
              <p className="mt-3 leading-7 text-muted-foreground">
                Run the web app and its database services on your own infrastructure using Docker.
                Allow at least 4 GB RAM. Follow Path 2 in the README.
              </p>
            </div>
          </div>
        </section>
        <section className="mt-12 border-t border-border pt-9">
          <h2 className="font-display text-2xl">Before you begin</h2>
          <ol className="mt-6 space-y-5">
            {[
              "Extract the ZIP and open README.md. You'll need Git, Node.js 20 or newer, and npm for the documented setup.",
              "Choose one backend setup path, configure your own environment, and apply the database migrations before starting the app.",
              "Follow the shared npm installation and deployment steps. Set up backups and test with non-sensitive records first.",
            ].map((text, index) => (
              <li key={text} className="flex gap-4 leading-7">
                <span className="font-mono text-primary">0{index + 1}</span>
                <span className="text-muted-foreground">{text}</span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="mt-10 border-l-2 border-primary bg-muted/50 p-5">
          <h2 className="font-semibold">Early software. Real responsibility.</h2>
          <p className="mt-2 leading-7 text-muted-foreground">
            Review calculations and reports, keep independent backups, and consult a qualified
            professional when needed. Desktop packaging and optional synchronization are future
            work.
          </p>
        </aside>
      </div>
    </WebsiteShell>
  );
}
