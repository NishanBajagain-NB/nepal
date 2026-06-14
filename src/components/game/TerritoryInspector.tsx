import { useMemo } from "react";
import { Shield, Swords, X, MapPin } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { TERRITORY_HEX } from "@/lib/game/types";
import { haversineMeters } from "@/lib/game/grid";

export function TerritoryInspector() {
  const id = useGame((s) => s.selectedZoneId);
  const close = () => useGame.getState().setSelectedZone(null);
  const zones = useGame((s) => s.zones);
  const lb = useGame((s) => s.leaderboard);
  const user = useGame((s) => s.user);
  const position = useGame((s) => s.position);
  const claimZone = useGame((s) => s.claimZone);
  const patches = useGame((s) => s.territoryPatches);

  const patch = useMemo(() => {
    if (!id) return null;
    return patches.find((p) => p.id === id) ?? null;
  }, [id, patches]);

  if (!id || !patch) return null;

  const ownership = zones.get(id);
  const ownerEntry = ownership ? lb.find((e) => e.player.id === ownership.ownerId) : null;
  const ownerName = ownership
    ? ownership.ownerId === user?.id
      ? "You"
      : (ownerEntry?.player.username ?? "Unknown")
    : "Unclaimed";
  const defense = ownership?.defense ?? 0;
  const center: [number, number] = [patch.lng, patch.lat];
  const distance = position ? haversineMeters([position.lng, position.lat], center) : Infinity;
  const inRange = distance <= Math.max(120, patch.radiusMeters * 1.15);
  const isMine = ownership?.ownerId === user?.id;
  const color = ownership ? TERRITORY_HEX[ownerEntry?.player.color ?? user?.color ?? "cyan"] : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:bottom-4">
      <div className="pointer-events-auto glass-panel no-tap w-full max-w-md rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Territory
            </div>
            <div className="font-mono text-lg font-semibold tracking-tight">
              {Math.round(patch.radiusMeters)}m paint
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-lg text-lg"
            style={{ background: (color ?? "#888") + "33" }}
          >
            {ownership ? (ownerEntry?.player.avatar ?? (isMine ? user?.avatar : "👤")) : "·"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Overlord
            </div>
            <div className="truncate font-semibold">{ownerName}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> Defense
            </span>
            <span className="font-mono tabular">{defense.toFixed(0)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full transition-all"
              style={{ width: `${defense}%`, background: color ?? "var(--cyan)" }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {isFinite(distance) ? `${distance.toFixed(0)}m away` : "GPS waiting"}
          </span>
          <span className="font-mono tabular">
            {center[1].toFixed(3)}, {center[0].toFixed(3)}
          </span>
        </div>

        <button
          disabled={!inRange || !user}
          onClick={() => {
            claimZone(id);
            close();
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold uppercase tracking-widest text-background transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Swords className="h-4 w-4" />
          {isMine ? "Defend Zone" : "Conquer Zone"}
        </button>
        {!inRange && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Move closer to this painted territory to take action.
          </p>
        )}
      </div>
    </div>
  );
}
