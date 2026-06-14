import { useState } from "react";
import { Trophy, ChevronUp, ChevronDown } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { TERRITORY_HEX } from "@/lib/game/types";

export function Leaderboard() {
  const [open, setOpen] = useState(false);
  const lb = useGame((s) => s.leaderboard);
  const user = useGame((s) => s.user);
  const top = lb.slice(0, 10);
  const myEntry = user ? lb.find((e) => e.player.id === user.id) : null;
  const myOwned = useGame((s) =>
    user ? Array.from(s.zones.values()).filter((z) => z.ownerId === user.id).length : 0,
  );
  const showSelfSticky = !!user && !myEntry && myOwned > 0;

  return (
    <div className="pointer-events-none fixed bottom-4 right-3 z-30 w-[min(380px,calc(100vw-1.5rem))]">
      <div className="pointer-events-auto glass-panel no-tap overflow-hidden rounded-2xl shadow-2xl">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber" />
            <span className="text-sm font-semibold uppercase tracking-widest">Leaderboard</span>
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        <div
          className={`${open ? "max-h-[480px]" : "max-h-0 collapsed-cv"} transition-[max-height] duration-300 ease-out overflow-hidden`}
        >
          <div className="border-t border-border/60">
            <div className="grid grid-cols-[28px_1fr_72px_64px] gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Area km²</span>
              <span className="text-right">Pts</span>
            </div>
            <ul className="max-h-[360px] overflow-y-auto">
              {top.map((e) => (
                <Row key={e.player.id} entry={e} highlight={e.player.id === user?.id} />
              ))}
            </ul>
            {showSelfSticky && user && (
              <div className="border-t border-border/60 bg-background/30">
                <Row
                  entry={{
                    rank: lb.length + 1,
                    player: user,
                    zones: myOwned,
                    areaKm2: myOwned * 30,
                    points: myOwned * 12,
                  }}
                  highlight
                />
              </div>
            )}
            {user && !myEntry && myOwned === 0 && (
              <div className="border-t border-border/60 px-4 py-3 text-center text-[11px] text-muted-foreground">
                Claim a zone to enter the ranks.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  entry,
  highlight,
}: {
  entry: ReturnType<typeof useGame.getState>["leaderboard"][number];
  highlight?: boolean;
}) {
  return (
    <li
      className={`grid grid-cols-[28px_1fr_72px_64px] items-center gap-2 px-4 py-2 text-sm ${
        highlight ? "bg-foreground/[0.06]" : ""
      }`}
    >
      <span className="font-mono text-xs text-muted-foreground tabular">
        {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : entry.rank}
      </span>
      <span className="flex items-center gap-2 truncate">
        <span
          className="grid h-6 w-6 place-items-center rounded-md text-sm"
          style={{ background: TERRITORY_HEX[entry.player.color] + "33" }}
        >
          {entry.player.avatar}
        </span>
        <span className="truncate font-medium">{entry.player.username}</span>
        {highlight && (
          <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-foreground animate-in fade-in duration-500">
            YOU
          </span>
        )}
      </span>
      <span className="text-right font-mono text-xs tabular">{entry.areaKm2.toFixed(0)}</span>
      <span className="text-right font-mono text-xs font-semibold tabular">{entry.points}</span>
    </li>
  );
}
