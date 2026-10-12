"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Dashboard from "@/components/Dashboard";
import MatchScreen, { MatchData } from "@/components/MatchScreen";
import ResultsScreen, { ResultsData } from "@/components/ResultsScreen";
import UsernameScreen from "@/components/UsernameScreen";
import GlobalNotifications from "@/components/GlobalNotifications";
import { socket } from "@/lib/socket";

export default function Home() {
  const [screen, setScreen] = useState<"username" | "dashboard" | "match" | "results">("username");
  const [user, setUser] = useState<{ name: string; elo: number } | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estable entre renders: MatchScreen lo usa como dependencia de un effect (cámara/IA)
  const handleExitMatch = useCallback(() => setScreen("dashboard"), []);

  useEffect(() => {
    socket.connect();

    // Vuelve a la pantalla de usuario (la sesión del servidor se pierde al reconectar)
    const resetSession = (message: string) => {
      if (registerTimeoutRef.current) {
        clearTimeout(registerTimeoutRef.current);
        registerTimeoutRef.current = null;
      }
      setIsConnecting(false);
      setUser(null);
      setMatchData(null);
      setResults(null);
      setScreen("username");
      setError(message);
    };

    socket.on("connect", () => {
      console.log("[Client] Socket connected");
      // Solo limpia el error de "no se pudo conectar", no el de sesión perdida
      setError((prev) => (prev && prev.startsWith("No se pudo conectar") ? null : prev));
    });

    socket.on("disconnect", (reason: string) => {
      console.log("[Client] Socket disconnected:", reason);
      if (reason === "io client disconnect") return;
      resetSession("Se perdió la conexión con el servidor. Vuelve a entrar con tu usuario.");
    });

    socket.on("session_expired", () => {
      resetSession("Tu sesión expiró. Vuelve a entrar con tu usuario.");
    });

    socket.on("register_error", (data: { message: string }) => {
      if (registerTimeoutRef.current) {
        clearTimeout(registerTimeoutRef.current);
        registerTimeoutRef.current = null;
      }
      setIsConnecting(false);
      setError(data.message);
    });

    socket.on("elo_update", (data: { eloChange: number }) => {
      setUser((prev) => (prev ? { ...prev, elo: prev.elo + data.eloChange } : prev));
    });

    socket.on("connect_error", (err) => {
      console.error("[Client] Socket connect_error:", err.message);
      setIsConnecting(false);
      setError(
        "No se pudo conectar al servidor de batalla. Revisa que el backend esté desplegado y NEXT_PUBLIC_SOCKET_URL esté bien configurada en Vercel."
      );
    });

    socket.on("registered", (data: { name: string; elo: number }) => {
      console.log("[Client] Registered successfully");
      if (registerTimeoutRef.current) {
        clearTimeout(registerTimeoutRef.current);
        registerTimeoutRef.current = null;
      }
      setIsConnecting(false);
      setError(null);
      setUser(data);
      setScreen("dashboard");
    });

    socket.on("match_found", (data: MatchData) => {
      console.log("[Client] match_found received!", data);
      setMatchData(data);
      setScreen("match");
    });

    socket.on("match_end", (data: ResultsData) => {
      console.log("[Client] match_end received!");
      setResults(data);
      setScreen("results");
      setUser((prev) => (prev ? { ...prev, elo: prev.elo + data.eloChange } : prev));
    });

    socket.on("match_aborted", (data?: { message?: string }) => {
      console.log("[Client] match_aborted received!");
      alert(data?.message ?? "Opponent left the match before it started.");
      setMatchData(null);
      setScreen("dashboard");
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("session_expired");
      socket.off("register_error");
      socket.off("elo_update");
      socket.off("registered");
      socket.off("match_found");
      socket.off("match_end");
      socket.off("match_aborted");
      if (registerTimeoutRef.current) clearTimeout(registerTimeoutRef.current);
    };
  }, []);

  const handleRegister = (username: string) => {
    setError(null);
    setIsConnecting(true);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("register", username);

    // Si en 8s no llega "registered", mostrar error
    if (registerTimeoutRef.current) clearTimeout(registerTimeoutRef.current);
    registerTimeoutRef.current = setTimeout(() => {
      setIsConnecting(false);
      setError(
        "El servidor no respondió. Despliega el backend (Railway/Render) y configura NEXT_PUBLIC_SOCKET_URL en Vercel."
      );
    }, 8000);
  };

  const handleFindMatch = (duration: number) => {
    socket.emit("find_match", duration);
  };

  const handleFindNewMatch = () => {
    setResults(null);
    setScreen("dashboard");
  };

  return (
    <main className="min-h-screen">
      <GlobalNotifications />

      {screen === "username" && (
        <UsernameScreen
          onRegister={handleRegister}
          isConnecting={isConnecting}
          error={error}
        />
      )}
      {screen === "dashboard" && user && (
        <Dashboard user={user} onFindMatch={handleFindMatch} />
      )}
      {screen === "match" && matchData && user && (
        <MatchScreen
          user={user}
          duration={matchData.duration}
          matchData={matchData}
          onMatchEnd={() => {}}
          onExit={handleExitMatch}
        />
      )}
      {screen === "results" && results && user && (
        <ResultsScreen
          results={results}
          user={user}
          onFindNewMatch={handleFindNewMatch}
          onDashboard={() => setScreen("dashboard")}
        />
      )}
    </main>
  );
}
