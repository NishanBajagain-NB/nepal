import { MapPin, Shield, Zap } from "lucide-react";

interface Props {
  onAllow: () => void;
  onSkip: () => void;
}

export function OnboardingModal({ onAllow, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan/20">
          <MapPin className="h-6 w-6 text-cyan" />
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Claim your ground.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nepal Territory Conquest needs your live location to mark which zones you stand on. Your
          position never leaves this device in mock mode.
        </p>

        <ul className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-volt" />
            <span>
              Walk into a zone to <strong>conquer</strong> it for your color.
            </span>
          </li>
          <li className="flex gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <span>
              Stay nearby to <strong>defend</strong> against rival players.
            </span>
          </li>
        </ul>

        <button
          onClick={onAllow}
          className="mt-6 w-full rounded-xl bg-foreground py-3 text-sm font-semibold uppercase tracking-widest text-background hover:opacity-90 active:scale-[0.99] transition"
        >
          Enable Location
        </button>
        <button
          onClick={onSkip}
          className="mt-2 w-full rounded-xl py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Not now · explore the map
        </button>
      </div>
    </div>
  );
}
