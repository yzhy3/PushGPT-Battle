import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
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
  await setDoc(doc(db, "users", uid), profile);
  return profile;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

/** Update streak if user is active today; call on login / activity */
export async function touchStreak(uid: string, profile: UserProfile): Promise<UserProfile> {
  const today = todayStr();
  if (profile.lastActiveDate === today) return profile;

  let streak = profile.streak;
  if (profile.lastActiveDate === yesterdayStr()) {
    streak = profile.streak + 1;
  } else {
    streak = 1;
  }
  const bestStreak = Math.max(profile.bestStreak, streak);
  const updates = { lastActiveDate: today, streak, bestStreak };
  await updateDoc(doc(db, "users", uid), updates);
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

  const elo = Math.max(0, profile.elo + data.eloChange);
  const xp = profile.xp + data.xpGain;
  const level = levelFromXp(xp);
  const totalReps = profile.totalReps + data.myReps;

  const updates: Partial<UserProfile> = {
    elo,
    xp,
    level,
    totalReps,
    wins: profile.wins + (data.result === "win" ? 1 : 0),
    losses: profile.losses + (data.result === "loss" ? 1 : 0),
    draws: profile.draws + (data.result === "draw" ? 1 : 0),
  };

  await updateDoc(doc(db, "users", uid), updates);
  const touched = await touchStreak(uid, { ...profile, ...updates } as UserProfile);
  return touched;
}

export async function applyTrainingResult(
  uid: string,
  reps: number,
  durationSec: number
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  const xpGain = Math.max(5, Math.floor(reps * 2 + durationSec / 10));
  const xp = profile.xp + xpGain;
  const level = levelFromXp(xp);

  const updates: Partial<UserProfile> = {
    xp,
    level,
    totalReps: profile.totalReps + reps,
    trainingSessions: profile.trainingSessions + 1,
  };
  await updateDoc(doc(db, "users", uid), updates);
  return touchStreak(uid, { ...profile, ...updates } as UserProfile);
}

export async function applyBotResult(
  uid: string,
  data: { won: boolean; myReps: number; eloChange: number; xpGain: number }
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  const elo = Math.max(0, profile.elo + data.eloChange);
  const xp = profile.xp + data.xpGain;
  const level = levelFromXp(xp);

  const updates: Partial<UserProfile> = {
    elo,
    xp,
    level,
    totalReps: profile.totalReps + data.myReps,
    botWins: profile.botWins + (data.won ? 1 : 0),
    botLosses: profile.botLosses + (data.won ? 0 : 1),
    wins: profile.wins + (data.won ? 1 : 0),
    losses: profile.losses + (data.won ? 0 : 1),
  };
  await updateDoc(doc(db, "users", uid), updates);
  return touchStreak(uid, { ...profile, ...updates } as UserProfile);
}

export async function getLeaderboard(limitN = 50): Promise<UserProfile[]> {
  const q = query(collection(db, "users"), orderBy("elo", "desc"), limit(limitN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as UserProfile);
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  // Simple scan of top users isn't enough — use a usernames collection
  const ref = doc(db, "usernames", username.toLowerCase());
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function claimUsername(uid: string, username: string): Promise<void> {
  await setDoc(doc(db, "usernames", username.toLowerCase()), {
    uid,
    username,
    createdAt: Date.now(),
  });
}
