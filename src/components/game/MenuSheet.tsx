import { X, Trophy, LogOut, Map as MapIcon, Swords, Heart } from "lucide-react";
import { useState } from "react";
import { useGame } from "@/lib/game/store";
import { useNavigate } from "@tanstack/react-router";
import { TERRITORY_HEX } from "@/lib/game/types";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { AchievementsSheet } from "./AchievementsSheet";

export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useGame((s) => s.user);
  const logout = useGame((s) => s.logout);
  const zones = useGame((s) => s.zones);
  const unlocked = useGame((s) => s.unlockedAchievements);
  const navigate = useNavigate();
  const [achOpen, setAchOpen] = useState(false);

  const myZones = user ? Array.from(zones.values()).filter((z) => z.ownerId === user.id).length : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="absolute left-0 top-0 h-full w-[min(320px,85vw)] glass-panel rounded-r-3xl p-5 shadow-2xl animate-in slide-in-from-left duration-300">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Profile</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {user && (
          <div className="mt-3 flex items-center gap-3">
            <div
              className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
              style={{ background: TERRITORY_HEX[user.color] + "33" }}
            >
              {user.avatar}
            </div>
            <div>
              <div className="font-semibold">{user.username}</div>
              <div className="text-xs text-muted-foreground capitalize">{user.color} faction</div>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat label="Zones" value={myZones} icon={<MapIcon className="h-3 w-3" />} />
          <Stat
            label="Battles"
            value={Math.round(myZones * 1.4)}
            icon={<Swords className="h-3 w-3" />}
          />
        </div>

        <div className="mt-6 space-y-1">
          <button
            onClick={() => {
              onClose();
              navigate({ to: "/donate" });
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-foreground/5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground/5">
              <Heart className="h-4 w-4 text-crimson" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">Support the dev</div>
              <div className="text-[11px] text-muted-foreground">eSewa · Buy Me a Coffee</div>
            </div>
          </button>
          <button
            onClick={() => setAchOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-foreground/5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground/5">
              <Trophy className="h-4 w-4 text-amber" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">Achievements</div>
              <div className="text-[11px] text-muted-foreground">
                {unlocked.size} of {ACHIEVEMENTS.length} unlocked
              </div>
            </div>
            <span className="rounded-md bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] tabular">
              {unlocked.size}
            </span>
          </button>
        </div>
        <AchievementsSheet open={achOpen} onClose={() => setAchOpen(false)} />

        <button
          onClick={() => {
            logout();
            navigate({ to: "/" });
          }}
          className="absolute inset-x-5 bottom-5 flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium hover:bg-foreground/5"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular">{value}</div>
    </div>
  );
}

function Item({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-foreground/5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground/5">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}
