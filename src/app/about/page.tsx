import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Cable, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingSite, SectionHeading } from "@/components/marketing-site";

export const metadata: Metadata = {
  title: "About TRADE LINK",
  description: "Learn how TRADE LINK connects owner-authorized trading accounts with monitoring and risk-limited copy controls.",
};

const principles = [
  {
    icon: Cable,
    title: "Your accounts, your authorization",
    text: "Connect through official authorization where available, or install the MT4 or MT5 bridge in a terminal you control.",
  },
  {
    icon: ShieldCheck,
    title: "Risk controls before automation",
    text: "Set sizing and replication rules, review account capabilities, and pause a strategy when you need to.",
  },
  {
    icon: BarChart3,
    title: "Clear account activity",
    text: "Review monitored positions, replication activity, account history, analytics, and audit records in one workspace.",
  },
];

export default function AboutPage() {
  return (
    <MarketingSite>
      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(235,180,62,0.12),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading
            eyebrow="About TRADE LINK"
            title="A clearer way to manage connected trading accounts."
            description="TRADE LINK brings account connections, copy controls, monitoring, and performance review into one workspace for traders who want to manage their own broker relationships."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="gap-2"><Link href="/">Open the workspace <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild variant="outline"><Link href="/packages">Explore platform packages</Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {principles.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-[0.7fr_1fr] md:py-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Supported connections</p>
            <h2 className="mt-3 text-2xl font-semibold">Built around real account workflows</h2>
          </div>
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p><strong className="text-foreground">MT4 and MT5:</strong> use an Expert Advisor bridge installed in your own terminal. FXCM accounts on MT4 can use that same bridge.</p>
            <p><strong className="text-foreground">cTrader and Deriv:</strong> connect through their supported authorization flows. Deriv copying is limited to supported Deriv contract types and matching account currencies.</p>
            <p><strong className="text-foreground">FXCM Trading Station:</strong> requires approved FXCM integration credentials and a session adapter that are not included yet.</p>
            <p>Some marketplace examples are generated demo data. They are not verified live trading records or a promise of returns.</p>
          </div>
        </div>
      </section>
    </MarketingSite>
  );
}
