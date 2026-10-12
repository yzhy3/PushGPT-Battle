"use client";
import { useState } from "react";
import { useAuth } from "@/lib/authContext";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, username.trim());
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.replace("Firebase: ", "").replace(/\(auth\/.*\)\.?/, "").trim()
          : "Something went wrong";
      setError(msg || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <h1 className="text-3xl sm:text-5xl font-display font-extrabold text-white mb-2 tracking-tight text-center">
        PUSH<span className="text-green-primary">UP</span> ARENA
      </h1>
      <p className="text-slate-400 mb-8 text-sm sm:text-base text-center">
        1v1 Fitness Esports · Level up · Climb the ranks
      </p>

      <div className="w-full max-w-sm bg-surface border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex mb-6 rounded-lg overflow-hidden border border-slate-700">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex-1 py-2 text-sm font-bold transition-colors ${
              mode === "login" ? "bg-blue-primary text-white" : "bg-transparent text-slate-400"
            }`}
          >
            LOGIN
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError(null); }}
            className={`flex-1 py-2 text-sm font-bold transition-colors ${
              mode === "register" ? "bg-blue-primary text-white" : "bg-transparent text-slate-400"
            }`}
          >
            REGISTER
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              maxLength={20}
              required
              className="bg-background border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-primary"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="bg-background border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-primary"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6)"
            minLength={6}
            required
            className="bg-background border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-blue-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-blue-primary hover:bg-blue-light text-white font-display font-bold text-lg py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "PLEASE WAIT..." : mode === "login" ? "ENTER ARENA" : "CREATE ACCOUNT"}
          </button>
          {error && (
            <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
