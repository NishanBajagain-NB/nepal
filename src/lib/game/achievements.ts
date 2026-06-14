import type { LeaderboardEntry, Player, ZoneOwnership } from "./types";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  goal: number;
  progress: (ctx: AchievementCtx) => number;
}

export interface AchievementCtx {
  user: Player | null;
  zones: Map<string, ZoneOwnership>;
  leaderboard: LeaderboardEntry[];
  loopsClosed: number;
  defendCount: number;
}

const ownedCount = (ctx: AchievementCtx) =>
  ctx.user ? Array.from(ctx.zones.values()).filter((z) => z.ownerId === ctx.user!.id).length : 0;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_claim",
    title: "First Stake",
    description: "Claim your very first zone.",
    icon: "🚩",
    goal: 1,
    progress: ownedCount,
  },
  {
    id: "hold_ten",
    title: "Land Baron",
    description: "Hold 10 zones simultaneously.",
    icon: "🏞️",
    goal: 10,
    progress: ownedCount,
  },
  {
    id: "hold_fifty",
    title: "Province Pioneer",
    description: "Hold 50 zones simultaneously.",
    icon: "🗺️",
    goal: 50,
    progress: ownedCount,
  },
  {
    id: "hold_hundred",
    title: "Centurion",
    description: "Hold 100 zones simultaneously.",
    icon: "💯",
    goal: 100,
    progress: ownedCount,
  },
  {
    id: "night_owl",
    title: "Night Owl",
    description: "Play between 10pm and 4am.",
    icon: "🌙",
    goal: 1,
    progress: () => {
      const h = new Date().getHours();
      return h >= 22 || h < 4 ? 1 : 0;
    },
  },
  {
    id: "streak_three",
    title: "Triple Strike",
    description: "Claim 3 zones in a row.",
    icon: "⚡",
    goal: 3,
    progress: (ctx) => Math.min(3, ownedCount(ctx)),
  },
  {
    id: "capital_capture",
    title: "Capital Capture",
    description: "Hold any zone — claim your first capital.",
    icon: "🛕",
    goal: 1,
    progress: (ctx) => (ownedCount(ctx) >= 1 ? 1 : 0),
  },
  {
    id: "top_ten",
    title: "Leaderboard Top 10",
    description: "Reach the top 10 by points.",
    icon: "🏆",
    goal: 1,
    progress: (ctx) => {
      if (!ctx.user) return 0;
      const idx = ctx.leaderboard.findIndex((e) => e.player.id === ctx.user!.id);
      return idx >= 0 && idx < 10 ? 1 : 0;
    },
  },
  {
    id: "cross_province",
    title: "Cross-Province Conqueror",
    description: "Hold 25 zones across the map.",
    icon: "🧭",
    goal: 25,
    progress: ownedCount,
  },
  {
    id: "loop_master",
    title: "Loop Master",
    description: "Close a loop to capture an enclosed area.",
    icon: "🔄",
    goal: 1,
    progress: (ctx) => Math.min(1, ctx.loopsClosed),
  },
  {
    id: "loop_veteran",
    title: "Loop Veteran",
    description: "Close 5 loops total.",
    icon: "🌀",
    goal: 5,
    progress: (ctx) => Math.min(5, ctx.loopsClosed),
  },
  {
    id: "defender",
    title: "Defender",
    description: "Defend a zone you own at least once.",
    icon: "🛡️",
    goal: 1,
    progress: (ctx) => Math.min(1, ctx.defendCount),
  },
];

export function evaluateAchievements(ctx: AchievementCtx): Set<string> {
  const unlocked = new Set<string>();
  for (const a of ACHIEVEMENTS) {
    if (a.progress(ctx) >= a.goal) unlocked.add(a.id);
  }
  return unlocked;
}
