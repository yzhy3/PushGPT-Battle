"use client";
import { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/userService";
import { UserProfile } from "@/lib/types";
import { getRank } from "@/lib/ranks";
import { useAuth } from "@/lib/authContext";

export default function Leaderboard({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getLeaderboard(50);
        setRows(data);
      } catch (e) {
        console.error(e);
        setError("Could not load leaderboard. Check Firestore rules.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white text-sm font-bold"
        >
          ← BACK
        </button>
        <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
          LEADERBOARD
        </h2>
        <div className="w-12" />
      </div>

      {loading && <p className="text-center text-slate-400 py-12">Loading ranks...</p>}
      {error && <p className="text-center text-red-400 py-8">{error}</p>}

      {!loading && !error && (
        <div className="bg-surface border border-slate-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-bold text-slate-500 border-b border-slate-800">
            <div className="col-span-1">#</div>
            <div className="col-span-5">PLAYER</div>
            <div className="col-span-3">RANK</div>
            <div className="col-span-3 text-right">ELO</div>
          </div>
          {rows.length === 0 && (
            <p className="text-center text-slate-500 py-10">No players yet. Be the first!</p>
          )}
          {rows.map((u, i) => {
            const rank = getRank(u.elo);
            const isMe = profile?.uid === u.uid;
            return (
              <div
                key={u.uid}
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-slate-800/50 ${
                  isMe ? "bg-blue-primary/15" : ""
                }`}
              >
                <div className="col-span-1 font-display font-bold text-slate-400">
                  {i + 1}
                </div>
                <div className="col-span-5 min-w-0">
                  <div className="font-bold text-white truncate text-sm">
                    {u.username}
                    {isMe && <span className="text-blue-light text-xs ml-1">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    Lv.{u.level} · 🔥{u.streak}
                  </div>
                </div>
                <div className="col-span-3 text-sm font-bold" style={{ color: rank.color }}>
                  {rank.emoji} {rank.name}
                </div>
                <div className="col-span-3 text-right font-display font-bold text-green-light">
                  {u.elo}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
