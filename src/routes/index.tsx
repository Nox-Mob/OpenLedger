import { desktopEntryRedirect } from "@/lib/desktop/entry-redirect";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowDown, Download, Monitor, Server, Cloud } from "lucide-react";
import { WebsiteShell } from "@/components/WebsiteShell";
import { Button } from "@/components/ui/button";
import deskImage from "@/assets/open-ledger-desk.jpg";

export const Route = createFileRoute("/")({
  beforeLoad: desktopEntryRedirect,
  head: () => ({
    meta: [
      { title: "OpenLedgerApp" },
      {
        name: "description",
        content:
          "Open-source double-entry accounting for small businesses, freelancers, and nonprofits. Explore the development source and our self-hosted and future desktop vision.",
      },
      { property: "og:title", content: "OpenLedgerApp" },
      {
        property: "og:description",
        content:
          "Approachable, open-source accounting for small teams. Development source available; standalone desktop is planned.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <WebsiteShell>
      <section className="website-hero relative isolate overflow-hidden">
        <img
          src={deskImage}
          alt="An open ledger, calculator, pen, and coffee on a green workspace"
          width={1920}
          height={1024}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="website-hero-shade absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h1 className="font-display text-5xl leading-tight text-hero-foreground sm:text-6xl">
            OpenLedgerApp
          </h1>
          <p className="mt-5 max-w-lg text-2xl leading-snug text-hero-foreground sm:text-3xl">
            Your books.
            <br />
            Your understanding. Your control.
          </p>
          <p className="mt-6 max-w-md text-base leading-7 text-hero-muted">
            Open-source double-entry accounting for small businesses, freelancers, and nonprofits.
            Built for the people doing the work, not just the people who speak accounting.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-hero-accent text-hero-accent-foreground hover:bg-hero-accent/90"
            >
              <Link to="/get-started">
                <Download /> Get the source <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground"
            >
              <a href="#why">
                Why we're building it <ArrowDown />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section
        id="why"
        className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[1fr_1.15fr] md:gap-20"
      >
        <div>
          <h2 className="font-display text-3xl leading-snug sm:text-4xl">
            Small teams deserve
            <br className="hidden sm:block" /> better books.
          </h2>
        </div>
        <div className="space-y-5 text-lg leading-8 text-muted-foreground">
          <p>
            A freelancer shouldn't need an enterprise system to understand a good month. A community
            nonprofit shouldn't need to become an accounting department to keep honest records.
          </p>
          <p>
            We're building a smaller, clearer alternative: proper accounting underneath, language
            you understand on top, and source code you can inspect. Software that works for your
            organization, not the other way around.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[1fr_1.15fr] md:gap-20">
          <div>
            <h2 className="font-display text-3xl leading-snug sm:text-4xl">
              A ledger.
              <br />
              Not a magic wand.
            </h2>
            <p className="mt-5 max-w-sm leading-7 text-muted-foreground">
              Good software starts with being clear about what it doesn't do.
            </p>
          </div>
          <div className="divide-y divide-border">
            {[
              [
                "Not your accountant",
                "It organizes records and produces reports. It doesn't provide financial, tax, or legal advice, or replace your judgment.",
              ],
              [
                "Not an everything-suite",
                "No payroll, automated tax filing, or live bank feeds today. Nonprofit funds are basic tags, not full fund accounting.",
              ],
              [
                "Not a finished product",
                "This is pre-1.0 software under active development. Review every result and keep independent backups before relying on it for real books.",
              ],
            ].map(([title, description]) => (
              <div key={title} className="py-5 first:pt-0">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl">One ledger. Your way to run it.</h2>
          </div>
          <p className="max-w-sm leading-7 text-muted-foreground">
            Three editions are the goal. Today, we're building the web foundation.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Monitor,
              title: "On your desktop",
              label: "Planned",
              detail:
                "Free, standalone accounting for freelancers and solo operators. Local to your computer, designed to work offline, without a server to set up.",
              note: "No desktop installer yet.",
            },
            {
              icon: Server,
              title: "On your server",
              label: "Development source available",
              detail:
                "The open-source community edition on infrastructure you control. Run the web app for yourself or your team, with your own backups and updates.",
              note: "Setup instructions available now.",
            },
            {
              icon: Cloud,
              title: "In the cloud",
              label: "Evolving",
              detail:
                "A managed option for people who want the same approachable books without operating a server. The current hosted app remains in development.",
              note: "Commercial offering and pricing to come.",
            },
          ].map((edition) => (
            <article
              key={edition.title}
              className="flex flex-col rounded-lg border border-border p-6"
            >
              <edition.icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
              <p className="mt-5 text-xs font-medium text-primary">{edition.label}</p>
              <h3 className="mt-2 text-xl font-semibold">{edition.title}</h3>
              <p className="mt-4 flex-1 text-sm leading-7 text-muted-foreground">
                {edition.detail}
              </p>
              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                {edition.note}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">
          The desktop edition is intended to be free. Optional donations may help sustain the
          project later; there is no donation program or cloud price announced today.
        </p>
      </section>

      <section className="border-t border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-16 sm:px-8 sm:py-20 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-3xl">Start with the source.</h2>
            <p className="mt-4 max-w-xl leading-7 opacity-85">
              Download the development version, follow the setup guide, and help shape what comes
              next. A more self-contained app is on the roadmap.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link to="/get-started">
              Download & get started <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </WebsiteShell>
  );
}
