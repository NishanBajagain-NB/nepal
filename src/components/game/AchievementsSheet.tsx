import { Lock, Trophy, X } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/game/achievements";
import { useGame } from "@/lib/game/store";
import { TERRITORY_HEX } from "@/lib/game/types";

export function AchievementsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useGame((s) => s.user);
  const zones = useGame((s) => s.zones);
  const leaderboard = useGame((s) => s.leaderboard);
  const unlocked = useGame((s) => s.unlockedAchievements);
  const loopsClosed = useGame((s) => s.loopsClosed);
  const defendCount = useGame((s) => s.defendCount);

  if (!open) return null;

  const ctx = { user, zones, leaderboard, loopsClosed, defendCount };
  const tint = user ? TERRITORY_HEX[user.color] : "#32D7FF";
  const completion = (unlocked.size / ACHIEVEMENTS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <button
        aria-label="Close achievements"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <section className="glass-panel no-tap relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300 sm:h-full sm:max-h-none sm:w-[min(520px,92vw)] sm:rounded-l-2xl sm:rounded-tr-none sm:p-5 sm:slide-in-from-right">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber" />
              <h2 className="text-sm font-semibold uppercase tracking-widest">Achievements</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {unlocked.size} of {ACHIEVEMENTS.length} unlocked
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-foreground/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background/35 p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono tabular">{completion.toFixed(0)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${completion}%`, background: tint }}
            />
          </div>
        </div>

        <ul className="mt-4 grid flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {ACHIEVEMENTS.map((achievement) => {
            const progress = Math.min(achievement.goal, achievement.progress(ctx));
            const done = unlocked.has(achievement.id);
            const pct = (progress / achievement.goal) * 100;

            return (
              <li
                key={achievement.id}
                className={`min-w-0 rounded-xl border p-2.5 sm:p-3 transition ${
                  done
                    ? "border-foreground/20 bg-foreground/[0.05]"
                    : "border-border/60 bg-background/30"
                }`}
              >
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <div
                    className={`grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl text-xl sm:text-2xl ${
                      done ? "" : "grayscale opacity-60"
                    }`}
                    style={
                      done
                        ? { background: tint + "22", boxShadow: `0 0 0 1px ${tint}55` }
                        : { background: "transparent" }
                    }
                  >
                    {done ? achievement.icon : <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                      <h3 className="min-w-0 text-[13px] sm:text-sm font-semibold leading-tight break-words">
                        {achievement.title}
                      </h3>
                      <span className="shrink-0 font-mono text-[10px] sm:text-[11px] text-muted-foreground tabular pt-0.5">
                        {progress}/{achievement.goal}
                      </span>
                    </div>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] leading-snug text-muted-foreground line-clamp-2 sm:line-clamp-none">
                      {achievement.description}
                    </p>
                    <div className="mt-2 sm:mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: done ? tint : "var(--muted-foreground)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
