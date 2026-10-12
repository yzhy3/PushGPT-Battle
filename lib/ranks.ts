export type RankId =
  | "rookie"
  | "fighter"
  | "warrior"
  | "elite"
  | "champion"
  | "legend"
  | "mythic";

export interface RankInfo {
  id: RankId;
  name: string;
  minElo: number;
  color: string;
  emoji: string;
}

export const RANKS: RankInfo[] = [
  { id: "rookie", name: "Rookie", minElo: 0, color: "#94a3b8", emoji: "🥉" },
  { id: "fighter", name: "Fighter", minElo: 1000, color: "#22c55e", emoji: "🥊" },
  { id: "warrior", name: "Warrior", minElo: 1200, color: "#3b82f6", emoji: "⚔️" },
  { id: "elite", name: "Elite", minElo: 1400, color: "#a855f7", emoji: "💎" },
  { id: "champion", name: "Champion", minElo: 1600, color: "#f59e0b", emoji: "🏆" },
  { id: "legend", name: "Legend", minElo: 1800, color: "#ef4444", emoji: "🔥" },
  { id: "mythic", name: "Mythic", minElo: 2000, color: "#ec4899", emoji: "👑" },
];

export function getRank(elo: number): RankInfo {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (elo >= r.minElo) current = r;
  }
  return current;
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.45));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    if (level > 100) break;
  }
  return level;
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; pct: number } {
  let remaining = xp;
  let level = 1;
  while (true) {
    const need = xpForLevel(level);
    if (remaining < need) {
      return {
        level,
        current: remaining,
        needed: need,
        pct: Math.min(100, Math.round((remaining / need) * 100)),
      };
    }
    remaining -= need;
    level++;
    if (level > 100) {
      return { level: 100, current: need, needed: need, pct: 100 };
    }
  }
}
