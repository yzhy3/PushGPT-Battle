import {
  ref,
  get,
  set,
  update,
  query,
  orderByChild,
  limitToLast,
} from "firebase/database";
import { rtdb } from "./firebase";
import { UserProfile } from "./types";
import { levelFromXp } from "./ranks";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function createUserProfile(
  uid: string,
  username: string,
  email: string
): Promise<UserProfile> {
  const profile: UserProfile = {
    uid,
    username: username.trim().slice(0, 20),
    email,
    elo: 1000,
    xp: 0,
    level: 1,
    streak: 0,
    bestStreak: 0,
    lastActiveDate: "",
    wins: 0,
    losses: 0,
    draws: 0,
    totalReps: 0,
    trainingSessions: 0,
    botWins: 0,
    botLosses: 0,
    createdAt: Date.now(),
  };
  await set(ref(rtdb, `users/${uid}`), profile);
  return profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(ref(rtdb, `users/${uid}`));
  if (!snap.exists()) return null;
  return snap.val() as UserProfile;
}

export async function touchStreak(uid: string, profile: UserProfile): Promise<UserProfile> {
  const today = todayStr();
  if (profile.lastActiveDate === today) return profile;

  let streak = profile.streak;
  if (profile.lastActiveDate === yesterdayStr()) {
    streak = profile.streak + 1;
  } else {
    streak = 1;
  }
  const bestStreak = Math.max(profile.bestStreak || 0, streak);
  const updates = { lastActiveDate: today, streak, bestStreak };
  await update(ref(rtdb, `users/${uid}`), updates);
  return { ...profile, ...updates };
}

export async function applyMatchResult(
  uid: string,
  data: {
    eloChange: number;
    myReps: number;
    result: "win" | "loss" | "draw";
    xpGain: number;
  }
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  const elo = Math.max(0, (profile.elo || 1000) + data.eloChange);
  const xp = (profile.xp || 0) + data.xpGain;
  const level = levelFromXp(xp);
  const totalReps = (profile.totalReps || 0) + data.myReps;

  const updates: Partial<UserProfile> = {
    elo,
    xp,
    level,
    totalReps,
    wins: (profile.wins || 0) + (data.result === "win" ? 1 : 0),
    losses: (profile.losses || 0) + (data.result === "loss" ? 1 : 0),
    draws: (profile.draws || 0) + (data.result === "draw" ? 1 : 0),
  };

  await update(ref(rtdb, `users/${uid}`), updates);
  return touchStreak(uid, { ...profile, ...updates } as UserProfile);
}

export async function applyTrainingResult(
  uid: string,
  reps: number,
  durationSec: number
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  const xpGain = Math.max(5, Math.floor(reps * 2 + durationSec / 10));
  const xp = (profile.xp || 0) + xpGain;
  const level = levelFromXp(xp);

  const updates: Partial<UserProfile> = {
    xp,
    level,
    totalReps: (profile.totalReps || 0) + reps,
    trainingSessions: (profile.trainingSessions || 0) + 1,
  };
  await update(ref(rtdb, `users/${uid}`), updates);
  return touchStreak(uid, { ...profile, ...updates } as UserProfile);
}

export async function applyBotResult(
  uid: string,
  data: { won: boolean; myReps: number; eloChange: number; xpGain: number }
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  const elo = Math.max(0, (profile.elo || 1000) + data.eloChange);
  const xp = (profile.xp || 0) + data.xpGain;
  const level = levelFromXp(xp);

  const updates: Partial<UserProfile> = {
    elo,
    xp,
    level,
    totalReps: (profile.totalReps || 0) + data.myReps,
    botWins: (profile.botWins || 0) + (data.won ? 1 : 0),
    botLosses: (profile.botLosses || 0) + (data.won ? 0 : 1),
    wins: (profile.wins || 0) + (data.won ? 1 : 0),
    losses: (profile.losses || 0) + (data.won ? 0 : 1),
  };
  await update(ref(rtdb, `users/${uid}`), updates);
  return touchStreak(uid, { ...profile, ...updates } as UserProfile);
}

export async function getLeaderboard(limitN = 50): Promise<UserProfile[]> {
  try {
    const q = query(ref(rtdb, "users"), orderByChild("elo"), limitToLast(limitN));
    const snap = await get(q);
    if (!snap.exists()) return [];
    const list: UserProfile[] = [];
    snap.forEach((child) => {
      list.push(child.val() as UserProfile);
    });
    // limitToLast returns ascending; reverse for highest ELO first
    return list.reverse();
  } catch (e) {
    // Fallback without index: load all users (fine for small apps)
    console.warn("Leaderboard query failed, using fallback", e);
    const snap = await get(ref(rtdb, "users"));
    if (!snap.exists()) return [];
    const list: UserProfile[] = [];
    snap.forEach((child) => list.push(child.val() as UserProfile));
    return list.sort((a, b) => (b.elo || 0) - (a.elo || 0)).slice(0, limitN);
  }
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const snap = await get(ref(rtdb, `usernames/${username.toLowerCase()}`));
  return snap.exists();
}

export async function claimUsername(uid: string, username: string): Promise<void> {
  await set(ref(rtdb, `usernames/${username.toLowerCase()}`), {
    uid,
    username,
    createdAt: Date.now(),
  });
}
