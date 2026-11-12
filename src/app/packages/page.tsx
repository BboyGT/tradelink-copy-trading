import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Cable, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingSite, SectionHeading } from "@/components/marketing-site";

export const metadata: Metadata = {
  title: "Packages | TRADE LINK",
  description: "Explore the connection, replication, and monitoring capabilities available in TRADE LINK.",
};

const packages = [
  {
    icon: Cable,
    number: "01",
    title: "Connect",
    summary: "Bring supported source and destination accounts into one workspace.",
    features: ["Deriv and cTrader authorization", "MT4 and MT5 terminal bridge", "Account status and connection health"],
  },
  {
    icon: Workflow,
    number: "02",
    title: "Copy",
    summary: "Configure supported trade replication with explicit sizing and guardrails.",
    features: ["Source and destination account selection", "Position sizing and risk limits", "Pause, resume, and emergency controls"],
  },
  {
    icon: BarChart3,
    number: "03",
    title: "Review",
    summary: "Understand account activity and strategy history from the same workspace.",
    features: ["Live position monitoring and history", "Provider analytics and comparisons", "Backtesting and audit records"],
  },
];

export default function PackagesPage() {
  return (
    <MarketingSite>
      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(235,180,62,0.12),transparent_55%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="Platform packages"
            title="Connect. Copy. Review."
            description="The TRADE LINK workspace groups account setup, replication controls, and monitoring into a clear trading workflow."
          />
          <div className="mt-8">
            <Button asChild className="gap-2"><Link href="/">Open the workspace <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-3">
          {packages.map(({ icon: Icon, number, title, summary, features }) => (
            <article key={title} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-primary">PACKAGE {number}</span>
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="mt-7 text-2xl font-semibold">{title}</h2>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">{summary}</p>
              <ul className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm text-muted-foreground">
                {features.map((feature) => <li key={feature} className="flex gap-3"><span className="text-primary">+</span><span>{feature}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-muted-foreground">
          These cards describe product capabilities, not paid subscription tiers. Billing, package limits, and prices have not been configured, so no prices or account limits are advertised here.
        </p>
      </section>
    </MarketingSite>
  );
}
