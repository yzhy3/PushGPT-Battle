export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  elo: number;
  xp: number;
  level: number;
  streak: number;
  bestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  wins: number;
  losses: number;
  draws: number;
  totalReps: number;
  trainingSessions: number;
  botWins: number;
  botLosses: number;
  createdAt: number;
}

export type AppScreen =
  | "auth"
  | "dashboard"
  | "match"
  | "results"
  | "training"
  | "bot"
  | "leaderboard";
