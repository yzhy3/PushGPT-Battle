"use client";
import { useState, useEffect } from "react";
import { socket } from "@/lib/socket";
import { useAuth } from "@/lib/authContext";
import { getRank, xpProgress } from "@/lib/ranks";
import { UserProfile } from "@/lib/types";
import { BotDifficulty } from "./SoloWorkout";

interface OnlineUser {
  username: string;
  elo: number;
}

interface DashboardProps {
  onFindMatch: (duration: number) => void;
  onTraining: (duration: number) => void;
  onBot: (duration: number, difficulty: BotDifficulty) => void;
  onLeaderboard: () => void;
}

export default function Dashboard({
  onFindMatch,
  onTraining,
  onBot,
  onLeaderboard,
}: DashboardProps) {
  const { profile, logout } = useAuth();
  const [tab, setTab] = useState<"pvp" | "train" | "bot">("pvp");
  const [duration, setDuration] = useState(60);
  const [botDiff, setBotDiff] = useState<BotDifficulty>("medium");
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!profile) return;
    // Register on socket with username + elo from Firebase profile
    socket.connect();
    socket.emit("register", { username: profile.username, elo: profile.elo });

    const handleOnline = (users: OnlineUser[]) => setOnlineUsers(users);
    const handleDeclined = (data: { by: string }) => {
      alert(`${data.by} declined your challenge.`);
      setIsSearching(false);
    };
    const handleFailed = () => setIsSearching(false);

    socket.on("online_users", handleOnline);
    socket.on("challenge_declined", handleDeclined);
    socket.on("challenge_failed", handleFailed);
    socket.emit("get_online_users");

    return () => {
      socket.off("online_users", handleOnline);
      socket.off("challenge_declined", handleDeclined);
      socket.off("challenge_failed", handleFailed);
    };
  }, [profile?.username]);

  // Clear searching when parent navigates away (match found)
  useEffect(() => {
    const onFound = () => setIsSearching(false);
    socket.on("match_found", onFound);
    return () => {
      socket.off("match_found", onFound);
    };
  }, []);

  if (!profile) return null;

  const rank = getRank(profile.elo);
  const xp = xpProgress(profile.xp);

  const handleFindMatch = () => {
    setIsSearching(true);
    onFindMatch(duration);
  };

  const handleCancelSearch = () => {
    socket.emit("cancel_matchmaking");
    setIsSearching(false);
  };

  const handleSendChallenge = (targetUsername: string) => {
    socket.emit("challenge_user", { targetUsername, duration });
    setIsSearching(true);
  };

  const filteredUsers = onlineUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) &&
      u.username !== profile.username
  );

  const durations = [
    { label: "1 Min", value: 60 },
    { label: "3 Min", value: 180 },
    { label: "5 Min", value: 300 },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pb-24">
      {/* Navbar */}
      <nav className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <h1 className="text-lg sm:text-2xl font-display font-extrabold tracking-tight text-white">
          PUSH<span className="text-green-primary">UP</span> ARENA
        </h1>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={onLeaderboard}
            className="text-xs sm:text-sm font-bold text-slate-300 hover:text-white border border-slate-700 px-2 sm:px-3 py-1.5 rounded-lg"
          >
            🏆 RANKING
          </button>
          <button
            onClick={() => logout()}
            className="text-xs sm:text-sm font-bold text-slate-500 hover:text-red-400"
          >
            LOGOUT
          </button>
        </div>
      </nav>

      {/* Profile card */}
      <div className="bg-surface border border-slate-800 rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl sm:text-2xl font-display font-extrabold text-white">
              {profile.username}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold" style={{ color: rank.color }}>
                {rank.emoji} {rank.name}
              </span>
              <span className="text-slate-500 text-sm">·</span>
              <span className="text-sm text-slate-400">Level {profile.level}</span>
            </div>
          </div>
          <div className="flex gap-3 sm:gap-5">
            <Stat label="ELO" value={String(profile.elo)} accent="text-green-light" />
            <Stat label="STREAK" value={`🔥${profile.streak}`} accent="text-orange-400" />
            <Stat label="W/L" value={`${profile.wins}/${profile.losses}`} accent="text-blue-light" />
          </div>
        </div>
        {/* XP bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>XP {xp.current}/{xp.needed}</span>
            <span>Lv.{xp.level}</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-primary to-green-primary rounded-full transition-all"
              style={{ width: `${xp.pct}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span>Total reps: {profile.totalReps}</span>
          <span>Training: {profile.trainingSessions}</span>
          <span>Bot W/L: {profile.botWins}/{profile.botLosses}</span>
          <span>Best streak: {profile.bestStreak}</span>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-6">
        {(
          [
            ["pvp", "1v1 PvP"],
            ["train", "Training"],
            ["bot", "vs Bot"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2.5 rounded-lg font-display font-bold text-sm transition-colors ${
              tab === id
                ? "bg-blue-primary text-white"
                : "bg-surface border border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Duration */}
      <div className="flex gap-2 mb-4">
        {durations.map((d) => (
          <button
            key={d.value}
            onClick={() => setDuration(d.value)}
            disabled={isSearching}
            className={`flex-1 py-2 rounded-lg font-bold text-sm border-2 transition-all ${
              duration === d.value
                ? "border-blue-primary bg-blue-primary/20 text-white"
                : "border-slate-700 text-slate-400"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* PvP */}
      {tab === "pvp" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-surface border border-slate-800 rounded-xl p-4 sm:p-6">
            <h3 className="font-display font-bold text-white mb-2">Matchmaking</h3>
            <p className="text-slate-400 text-sm mb-4">
              Find a live opponent. Need 2 players searching.
            </p>
            <button
              onClick={isSearching ? handleCancelSearch : handleFindMatch}
              className={`w-full font-display font-extrabold text-lg py-3 rounded-lg ${
                isSearching
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-blue-primary hover:bg-blue-light text-white"
              }`}
            >
              {isSearching ? "CANCEL SEARCH" : "FIND MATCH"}
            </button>
          </div>

          <div className="bg-surface border border-slate-800 rounded-xl p-4 sm:p-6">
            <h3 className="font-display font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-primary animate-pulse" />
              Challenge a player
            </h3>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-background border border-slate-700 text-white text-sm px-3 py-2 rounded-lg mb-3 focus:outline-none focus:border-blue-primary"
            />
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No players online</p>
              ) : (
                filteredUsers.map((p) => (
                  <div
                    key={p.username}
                    className="flex items-center justify-between bg-background p-2 rounded-lg border border-slate-800"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">{p.username}</div>
                      <div className="text-xs text-slate-400">{p.elo} ELO</div>
                    </div>
                    <button
                      onClick={() => handleSendChallenge(p.username)}
                      disabled={isSearching}
                      className="bg-green-primary/20 border border-green-primary text-green-light text-xs font-bold px-3 py-1 rounded hover:bg-green-primary hover:text-white disabled:opacity-50"
                    >
                      CHALLENGE
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Training */}
      {tab === "train" && (
        <div className="bg-surface border border-slate-800 rounded-xl p-6 text-center">
          <h3 className="font-display font-bold text-xl text-white mb-2">Solo Training</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Practice with AI form tracking. Earn XP for every rep. Counts toward your daily streak.
          </p>
          <button
            onClick={() => onTraining(duration)}
            className="bg-green-primary hover:bg-green-light text-white font-display font-extrabold text-lg px-10 py-3 rounded-lg"
          >
            START TRAINING
          </button>
        </div>
      )}

      {/* Bot */}
      {tab === "bot" && (
        <div className="bg-surface border border-slate-800 rounded-xl p-6">
          <h3 className="font-display font-bold text-xl text-white mb-2 text-center">
            Battle vs AI Bot
          </h3>
          <p className="text-slate-400 text-sm mb-4 text-center">
            Compete against a simulated opponent. Affects ELO & XP.
          </p>
          <div className="flex gap-2 mb-6 max-w-md mx-auto">
            {(["easy", "medium", "hard"] as BotDifficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setBotDiff(d)}
                className={`flex-1 py-2 rounded-lg font-bold text-sm capitalize border-2 ${
                  botDiff === d
                    ? "border-green-primary bg-green-primary/20 text-white"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="text-center">
            <button
              onClick={() => onBot(duration, botDiff)}
              className="bg-blue-primary hover:bg-blue-light text-white font-display font-extrabold text-lg px-10 py-3 rounded-lg"
            >
              FIGHT BOT
            </button>
          </div>
        </div>
      )}

      {/* Camera tips */}
      <div className="mt-6 bg-blue-primary/10 border border-blue-primary/40 rounded-xl p-4 text-sm text-slate-300">
        <strong className="text-blue-light">Camera tips:</strong> Place phone 2–2.5 m away at ground
        level, full body visible, start in plank with arms extended.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className={`text-lg sm:text-xl font-display font-bold ${accent}`}>{value}</div>
    </div>
  );
}
