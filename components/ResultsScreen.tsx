"use client";

export interface ResultsData {
  myReps: number;
  oppReps: number;
  eloChange: number;
  winner: string;
}

export default function ResultsScreen({
  results,
  user,
  onFindNewMatch,
  onDashboard,
}: {
  results: ResultsData;
  user: { name: string; elo: number };
  onFindNewMatch: () => void;
  onDashboard: () => void;
}) {
  const isTraining = results.winner === "training";
  const isDraw = results.winner === "draw";
  const iWon = results.winner === user.name;

  let title = "DRAW";
  let titleColor = "text-slate-300";
  if (isTraining) {
    title = "SESSION COMPLETE";
    titleColor = "text-green-light";
  } else if (iWon) {
    title = "VICTORY";
    titleColor = "text-green-light";
  } else if (!isDraw) {
    title = "DEFEAT";
    titleColor = "text-red-400";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <h2 className={`text-4xl sm:text-6xl font-display font-extrabold mb-6 ${titleColor}`}>
        {title}
      </h2>

      <div className="bg-surface border border-slate-800 rounded-2xl p-6 sm:p-8 w-full max-w-md mb-8">
        <div className="flex justify-around items-center mb-6">
          <div className="text-center">
            <div className="text-xs text-slate-400 font-bold uppercase mb-1">You</div>
            <div className="text-5xl font-display font-extrabold text-green-light">
              {results.myReps}
            </div>
            <div className="text-xs text-slate-500 mt-1">reps</div>
          </div>
          {!isTraining && (
            <>
              <div className="text-slate-600 font-bold text-xl">VS</div>
              <div className="text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-1">
                  {results.winner === "BOT" || results.oppReps >= 0 ? "Opponent" : "Opp"}
                </div>
                <div className="text-5xl font-display font-extrabold text-blue-light">
                  {results.oppReps}
                </div>
                <div className="text-xs text-slate-500 mt-1">reps</div>
              </div>
            </>
          )}
        </div>

        {!isTraining && (
          <div className="text-center border-t border-slate-800 pt-4">
            <span className="text-slate-400 text-sm">ELO </span>
            <span
              className={`font-display font-bold text-lg ${
                results.eloChange > 0
                  ? "text-green-light"
                  : results.eloChange < 0
                  ? "text-red-400"
                  : "text-slate-400"
              }`}
            >
              {results.eloChange > 0 ? "+" : ""}
              {results.eloChange}
            </span>
          </div>
        )}

        {isTraining && (
          <p className="text-center text-slate-400 text-sm border-t border-slate-800 pt-4">
            XP earned from this session has been added to your profile.
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <button
          onClick={onFindNewMatch}
          className="flex-1 bg-blue-primary hover:bg-blue-light text-white font-display font-bold py-3 rounded-lg"
        >
          {isTraining ? "TRAIN AGAIN" : "PLAY AGAIN"}
        </button>
        <button
          onClick={onDashboard}
          className="flex-1 bg-surface border border-slate-700 hover:border-slate-500 text-white font-display font-bold py-3 rounded-lg"
        >
          DASHBOARD
        </button>
      </div>
    </div>
  );
}
