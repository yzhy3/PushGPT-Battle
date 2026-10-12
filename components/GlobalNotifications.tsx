"use client";
import { useState, useEffect } from "react";
import { socket } from "@/lib/socket";

interface Challenge {
  fromUsername: string;
  fromElo: number;
  duration: number;
}

export default function GlobalNotifications() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    const handleChallenge = (data: Challenge) => {
      setChallenge(data);
    };

    const handleFailed = (data: { message: string }) => {
      alert(data.message);
      setChallenge(null);
    };

    // El retador canceló o se desconectó: retira el aviso
    const handleCancelled = (data: { fromUsername: string }) => {
      setChallenge((prev) => (prev && prev.fromUsername === data.fromUsername ? null : prev));
    };

    socket.on("challenge_received", handleChallenge);
    socket.on("challenge_failed", handleFailed);
    socket.on("challenge_cancelled", handleCancelled);

    return () => {
      socket.off("challenge_received", handleChallenge);
      socket.off("challenge_failed", handleFailed);
      socket.off("challenge_cancelled", handleCancelled);
    };
  }, []);

  const handleAccept = () => {
    if (challenge) {
      console.log("[Client] Accept clicked! Emitting respond_to_challenge for", challenge.fromUsername);  
      socket.emit("respond_to_challenge", { 
        fromUsername: challenge.fromUsername, 
        accepted: true, 
        duration: challenge.duration 
      });
    }
    setChallenge(null);
  };

  const handleDecline = () => {
    if (challenge) {
      socket.emit("respond_to_challenge", { 
        fromUsername: challenge.fromUsername, 
        accepted: false, 
        duration: challenge.duration 
      });
    }
    setChallenge(null);
  };

  if (!challenge) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 left-4 sm:left-auto z-[100] animate-slide-in-right">
      <div className="bg-surface border-2 border-blue-primary rounded-xl shadow-2xl p-4 sm:p-6 w-full sm:w-80 flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-3 w-3 bg-blue-light rounded-full animate-pulse flex-shrink-0"></div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Challenge Incoming!</h3>
        </div>

        <div className="bg-background p-3 rounded-lg border border-slate-700">
          <div className="flex justify-between items-center">
            <span className="font-bold text-white text-base sm:text-lg truncate mr-2">{challenge.fromUsername}</span>
            <span className="text-sm text-slate-400 font-bold flex-shrink-0">{challenge.fromElo} ELO</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Duration: {challenge.duration} seconds</div>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded-lg transition-colors text-sm sm:text-base"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 bg-green-primary hover:bg-green-light text-white font-bold py-2 rounded-lg transition-colors text-sm sm:text-base"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}