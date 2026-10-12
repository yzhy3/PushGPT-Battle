"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Dashboard from "@/components/Dashboard";
import MatchScreen, { MatchData } from "@/components/MatchScreen";
import ResultsScreen, { ResultsData } from "@/components/ResultsScreen";
import AuthScreen from "@/components/AuthScreen";
import Leaderboard from "@/components/Leaderboard";
import SoloWorkout, { BotDifficulty } from "@/components/SoloWorkout";
import GlobalNotifications from "@/components/GlobalNotifications";
import { socket } from "@/lib/socket";
import { useAuth } from "@/lib/authContext";
import { AppScreen } from "@/lib/types";
import {
  applyMatchResult,
  applyTrainingResult,
  applyBotResult,
} from "@/lib/userService";

export default function Home() {
  const { firebaseUser, profile, loading, setProfile, refreshProfile } = useAuth();
  const [screen, setScreen] = useState<AppScreen>("auth");
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [soloDuration, setSoloDuration] = useState(60);
  const [botDiff, setBotDiff] = useState<BotDifficulty>("medium");
  const [error, setError] = useState<string | null>(null);

  const handleExitMatch = useCallback(() => setScreen("dashboard"), []);

  // Navigate when auth state ready
  useEffect(() => {
    if (loading) return;
    if (firebaseUser && profile) {
      setScreen((s) => (s === "auth" ? "dashboard" : s));
    } else if (!firebaseUser) {
      setScreen("auth");
    }
  }, [firebaseUser, profile, loading]);

  // Socket events for PvP
  useEffect(() => {
    if (!profile) return;

    socket.connect();

    socket.on("connect_error", () => {
      // non-blocking for solo modes
      console.warn("Socket connect error — PvP may be unavailable");
    });

    socket.on("match_found", (data: MatchData) => {
      setMatchData(data);
      setScreen("match");
    });

    socket.on("match_end", async (data: ResultsData) => {
      setResults(data);
      setScreen("results");

      if (profile) {
        let result: "win" | "loss" | "draw" = "draw";
        if (data.winner === profile.username) result = "win";
        else if (data.winner !== "draw") result = "loss";

        const xpGain = Math.max(10, data.myReps * 2 + (result === "win" ? 25 : 5));
        try {
          const updated = await applyMatchResult(profile.uid, {
            eloChange: data.eloChange,
            myReps: data.myReps,
            result,
            xpGain,
          });
          if (updated) setProfile(updated);
        } catch (e) {
          console.error("applyMatchResult", e);
        }
      }
    });

    socket.on("match_aborted", () => {
      alert("Opponent left before the match started.");
      setMatchData(null);
      setScreen("dashboard");
    });

    return () => {
      socket.off("connect_error");
      socket.off("match_found");
      socket.off("match_end");
      socket.off("match_aborted");
    };
  }, [profile?.uid, profile?.username, setProfile]);

  const handleFindMatch = (duration: number) => {
    socket.emit("find_match", duration);
  };

  const handleTraining = (duration: number) => {
    setSoloDuration(duration);
    setScreen("training");
  };

  const handleBot = (duration: number, difficulty: BotDifficulty) => {
    setSoloDuration(duration);
    setBotDiff(difficulty);
    setScreen("bot");
  };

  const handleSoloFinish = async (result: {
    myReps: number;
    botReps: number;
    duration: number;
  }) => {
    if (!profile) {
      setScreen("dashboard");
      return;
    }

    if (screen === "training") {
      try {
        const updated = await applyTrainingResult(profile.uid, result.myReps, result.duration);
        if (updated) setProfile(updated);
      } catch (e) {
        console.error(e);
      }
      setResults({
        myReps: result.myReps,
        oppReps: 0,
        eloChange: 0,
        winner: "training",
      });
      setScreen("results");
      return;
    }

    // Bot
    const won = result.myReps > result.botReps;
    const draw = result.myReps === result.botReps;
    const eloChange = draw ? 0 : won ? (botDiff === "hard" ? 16 : botDiff === "medium" ? 12 : 8) : (botDiff === "hard" ? -6 : botDiff === "medium" ? -10 : -12);
    const xpGain = Math.max(10, result.myReps * 2 + (won ? 20 : 5));

    try {
      const updated = await applyBotResult(profile.uid, {
        won: won && !draw,
        myReps: result.myReps,
        eloChange,
        xpGain,
      });
      if (updated) setProfile(updated);
    } catch (e) {
      console.error(e);
    }

    setResults({
      myReps: result.myReps,
      oppReps: result.botReps,
      eloChange,
      winner: draw ? "draw" : won ? profile.username : "BOT",
    });
    setScreen("results");
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 font-display font-bold animate-pulse">Loading Arena...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <GlobalNotifications />

      {screen === "auth" && <AuthScreen />}

      {screen === "dashboard" && profile && (
        <Dashboard
          onFindMatch={handleFindMatch}
          onTraining={handleTraining}
          onBot={handleBot}
          onLeaderboard={() => setScreen("leaderboard")}
        />
      )}

      {screen === "leaderboard" && (
        <Leaderboard onBack={() => setScreen("dashboard")} />
      )}

      {screen === "match" && matchData && profile && (
        <MatchScreen
          user={{ name: profile.username, elo: profile.elo }}
          duration={matchData.duration}
          matchData={matchData}
          onMatchEnd={() => {}}
          onExit={handleExitMatch}
        />
      )}

      {(screen === "training" || screen === "bot") && profile && (
        <SoloWorkout
          mode={screen === "training" ? "training" : "bot"}
          duration={soloDuration}
          difficulty={botDiff}
          userName={profile.username}
          onFinish={handleSoloFinish}
          onExit={() => setScreen("dashboard")}
        />
      )}

      {screen === "results" && results && profile && (
        <ResultsScreen
          results={results}
          user={{ name: profile.username, elo: profile.elo }}
          onFindNewMatch={() => {
            setResults(null);
            setScreen("dashboard");
          }}
          onDashboard={() => {
            setResults(null);
            setScreen("dashboard");
            refreshProfile();
          }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto bg-red-500/20 border border-red-500 text-red-200 text-sm p-3 rounded-lg text-center z-50">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}
    </main>
  );
}
