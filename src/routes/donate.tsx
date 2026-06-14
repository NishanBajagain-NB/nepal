import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Coffee,
  Copy,
  Heart,
  MapPinned,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [
      { title: "Support the Developer · Nepal Territory Conquest" },
      {
        name: "description",
        content:
          "Support continued development of Nepal Territory Conquest through eSewa or Buy Me a Coffee.",
      },
      { property: "og:title", content: "Support Nepal Territory Conquest" },
      {
        property: "og:description",
        content: "Help keep the map alive with eSewa or Buy Me a Coffee.",
      },
    ],
  }),
  component: DonatePage,
});

const ESEWA_ID = "98XXXXXXXX";
const BMC_URL = "https://www.buymeacoffee.com/yourname";

function DonatePage() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ESEWA_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 donation-field" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          to="/play"
          className="glass-panel grid h-10 w-10 place-items-center rounded-xl hover:bg-foreground/5"
          aria-label="Back to game"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="glass-panel rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Support Nepal Territory
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl content-center gap-5 px-4 pb-8 md:grid-cols-[1fr_1.05fr] md:gap-6">
        <section className="flex flex-col justify-center py-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-amber" />
            Player funded build
          </div>
          <h1 className="mt-5 max-w-xl text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
            Help keep the conquest alive.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
            Donations support map tiles, testing devices, server work, and the late-night polish
            that makes Nepal Territory Conquest feel fast and worth opening again.
          </p>

          <div className="mt-6 grid max-w-lg grid-cols-3 gap-2">
            <Impact label="Map work" value="Nepal" />
            <Impact label="Latency" value="Faster" />
            <Impact label="Updates" value="Weekly" />
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-4 shadow-2xl sm:p-5">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-crimson/15">
              <Heart className="h-6 w-6 text-crimson" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold leading-tight">Choose a support path</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Quick local wallet or international card support.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-border/60 bg-background/45 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-volt/20">
                  <Smartphone className="h-5 w-5 text-volt" />
                </div>
                <div>
                  <div className="text-sm font-semibold">eSewa</div>
                  <div className="text-xs text-muted-foreground">Fastest for Nepal</div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono text-lg tabular">{ESEWA_ID}</span>
                <button
                  onClick={copy}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold uppercase tracking-widest text-background hover:opacity-90"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/45 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber/20">
                  <Coffee className="h-5 w-5 text-amber" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Buy Me a Coffee</div>
                  <div className="text-xs text-muted-foreground">Card, PayPal, Apple Pay</div>
                </div>
              </div>
              <a
                href={BMC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber text-sm font-semibold uppercase tracking-widest text-background hover:opacity-90"
              >
                <Coffee className="h-4 w-4" /> Support build
              </a>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/60 bg-background/35 p-3">
            <MapPinned className="h-5 w-5 shrink-0 text-cyan" />
            <p className="text-xs leading-5 text-muted-foreground">
              Every support action helps improve Nepal-only map detail, smoother claiming, and
              better mobile performance.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Impact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
