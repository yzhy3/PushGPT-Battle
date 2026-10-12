import express from "express";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// Health check (útil para Render/Railway y para "despertar" el servidor)
app.get("/", (_req, res) => {
  res.send("Battle Server OK");
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

interface User {
  id: string;
  username: string;
  elo: number;
  inMatch: boolean;
}

interface Match {
  id: string;
  players: [string, string];
  duration: number;
  scores: Record<string, number>;
  readyPlayers: string[];
  started: boolean; // true cuando ambos jugadores están listos (cuenta atrás en marcha)
  timers: ReturnType<typeof setTimeout>[];
}

interface QueueEntry {
  id: string;
  duration: number;
}

interface PendingChallenge {
  targetId: string;
  duration: number;
}

const ALLOWED_DURATIONS = [60, 180, 300];
const COUNTDOWN_MS = 4000; // 3-2-1-GO
const READY_TIMEOUT_MS = 60_000; // máximo de espera a que ambos tengan la cámara lista
const END_GRACE_MS = 1000; // margen para recibir las últimas reps

const users: Record<string, User> = {};
let matchQueue: QueueEntry[] = [];
const activeMatches: Record<string, Match> = {};
// challengerId -> desafío pendiente (un jugador solo puede tener uno a la vez)
const pendingChallenges: Record<string, PendingChallenge> = {};

const calculateElo = (winnerElo: number, loserElo: number) => {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
  return {
    winner: Math.round(24 * (1 - expectedWinner)),
    loser: Math.round(24 * (0 - expectedLoser))
  };
};

const getOnlineUsers = () =>
  Object.values(users)
    .filter(u => !u.inMatch)
    .map(u => ({ username: u.username, elo: u.elo }));

const broadcastOnlineUsers = () => {
  io.emit("online_users", getOnlineUsers());
};

const removeFromQueue = (id: string) => {
  matchQueue = matchQueue.filter(entry => entry.id !== id);
};

const clearMatchTimers = (match: Match) => {
  match.timers.forEach(clearTimeout);
  match.timers = [];
};

// Cancela el desafío que este usuario había enviado (si lo hay) y avisa al rival
const cancelPendingChallenge = (challengerId: string) => {
  const pending = pendingChallenges[challengerId];
  if (!pending) return;
  delete pendingChallenges[challengerId];
  const challenger = users[challengerId];
  if (challenger) {
    io.to(pending.targetId).emit("challenge_cancelled", { fromUsername: challenger.username });
  }
};

// Limpia todos los desafíos en los que participa un usuario (como retador o como objetivo)
const clearChallengesInvolving = (userId: string, reasonForChallengers: string) => {
  cancelPendingChallenge(userId);
  for (const [challengerId, pending] of Object.entries(pendingChallenges)) {
    if (pending.targetId === userId) {
      delete pendingChallenges[challengerId];
      io.to(challengerId).emit("challenge_failed", { message: reasonForChallengers });
    }
  }
};

// Cancela una partida que aún no empezó (nadie gana ni pierde ELO)
const abortMatch = (matchId: string, message: string, exceptId?: string) => {
  const match = activeMatches[matchId];
  if (!match) return;
  clearMatchTimers(match);
  delete activeMatches[matchId];

  for (const playerId of match.players) {
    const player = users[playerId];
    if (player) player.inMatch = false;
    if (playerId !== exceptId) io.to(playerId).emit("match_aborted", { message });
  }
  broadcastOnlineUsers();
};

const endMatch = (matchId: string) => {
  const match = activeMatches[matchId];
  if (!match) return;
  clearMatchTimers(match);
  delete activeMatches[matchId];

  const [p1, p2] = match.players;
  const p1Reps = match.scores[p1] || 0;
  const p2Reps = match.scores[p2] || 0;
  const user1 = users[p1];
  const user2 = users[p2];

  if (user1) user1.inMatch = false;
  if (user2) user2.inMatch = false;

  // Defensivo: las desconexiones ya se gestionan en forfeitMatch
  if (!user1 || !user2) {
    const survivor = user1 || user2;
    if (survivor) {
      io.to(survivor.id).emit("match_end", {
        myReps: match.scores[survivor.id] || 0,
        oppReps: 0,
        eloChange: 0,
        winner: survivor.username
      });
    }
    broadcastOnlineUsers();
    return;
  }

  let p1EloChange = 0;
  let p2EloChange = 0;
  let winner = "draw";

  if (p1Reps > p2Reps) {
    winner = user1.username;
    const elo = calculateElo(user1.elo, user2.elo);
    p1EloChange = elo.winner;
    p2EloChange = elo.loser;
  } else if (p2Reps > p1Reps) {
    winner = user2.username;
    const elo = calculateElo(user2.elo, user1.elo);
    p2EloChange = elo.winner;
    p1EloChange = elo.loser;
  }

  user1.elo += p1EloChange;
  user2.elo += p2EloChange;

  io.to(p1).emit("match_end", { myReps: p1Reps, oppReps: p2Reps, eloChange: p1EloChange, winner });
  io.to(p2).emit("match_end", { myReps: p2Reps, oppReps: p1Reps, eloChange: p2EloChange, winner });

  broadcastOnlineUsers();
};

// Un jugador abandona (botón EXIT) o se desconecta
const forfeitMatch = (matchId: string, leaverId: string) => {
  const match = activeMatches[matchId];
  if (!match || !match.players.includes(leaverId)) return;

  // Si la partida no había empezado, simplemente se cancela
  if (!match.started) {
    abortMatch(matchId, "Opponent left the match before it started.", leaverId);
    return;
  }

  const winnerId = match.players.find(id => id !== leaverId) as string;
  const winner = users[winnerId];
  const leaver = users[leaverId];

  clearMatchTimers(match);
  delete activeMatches[matchId];

  let winnerChange = 10;
  let leaverChange = 0;

  if (leaver) {
    leaver.inMatch = false;
  }

  if (winner) {
    winner.inMatch = false;

    if (leaver) {
      const elo = calculateElo(winner.elo, leaver.elo);
      winnerChange = elo.winner;
      leaverChange = elo.loser;
      leaver.elo += leaverChange;
    }
    winner.elo += winnerChange;

    io.to(winnerId).emit("match_end", {
      myReps: Math.max(1, match.scores[winnerId] || 0),
      oppReps: 0,
      eloChange: winnerChange,
      winner: winner.username
    });
  }

  // El que abandona ya está en el dashboard: solo actualizamos su ELO
  if (leaver && leaverChange !== 0) {
    io.to(leaverId).emit("elo_update", { eloChange: leaverChange });
  }

  broadcastOnlineUsers();
};

const startMatchLogic = (p1: User, p2: User, duration: number) => {
  const matchId = randomUUID();
  const match: Match = {
    id: matchId,
    players: [p1.id, p2.id],
    duration,
    scores: { [p1.id]: 0, [p2.id]: 0 },
    readyPlayers: [],
    started: false,
    timers: []
  };

  activeMatches[matchId] = match;
  p1.inMatch = true;
  p2.inMatch = true;

  // Ninguno de los dos puede seguir en cola ni tener desafíos pendientes
  removeFromQueue(p1.id);
  removeFromQueue(p2.id);
  clearChallengesInvolving(p1.id, `${p1.username} is already in a match.`);
  clearChallengesInvolving(p2.id, `${p2.username} is already in a match.`);

  console.log(`[Server] Emitting match_found to ${p1.username} and ${p2.username} (${duration}s)`);
  const startTime = Date.now();
  io.to(p1.id).emit("match_found", {
    matchId, opponentName: p2.username, opponentElo: p2.elo, duration, startTime
  });
  io.to(p2.id).emit("match_found", {
    matchId, opponentName: p1.username, opponentElo: p1.elo, duration, startTime
  });

  // La partida NO empieza por tiempo: espera a que ambos envíen "player_ready".
  // Si alguno nunca está listo, se cancela.
  match.timers.push(
    setTimeout(() => {
      abortMatch(matchId, "Your opponent never got ready. Match cancelled.");
    }, READY_TIMEOUT_MS)
  );

  broadcastOnlineUsers();
};

io.on("connection", (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("get_online_users", () => {
    socket.emit("online_users", getOnlineUsers());
  });

  socket.on("register", (rawName: unknown) => {
    // Registro idempotente
    const existing = users[socket.id];
    if (existing) {
      socket.emit("registered", { name: existing.username, elo: existing.elo });
      return;
    }

    const username = typeof rawName === "string" ? rawName.trim().slice(0, 20) : "";
    if (username.length < 3) {
      socket.emit("register_error", { message: "El usuario debe tener al menos 3 caracteres." });
      return;
    }

    const taken = Object.values(users).some(
      u => u.username.toLowerCase() === username.toLowerCase()
    );
    if (taken) {
      socket.emit("register_error", { message: "Ese nombre de usuario ya está en uso. Elige otro." });
      return;
    }

    users[socket.id] = { id: socket.id, username, elo: 1000, inMatch: false };
    socket.emit("registered", { name: username, elo: users[socket.id].elo });
    broadcastOnlineUsers();
  });

  // Matchmaking estándar (solo empareja jugadores que eligieron la misma duración)
  socket.on("find_match", (rawDuration: number) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit("session_expired");
      return;
    }
    if (user.inMatch) return;

    const duration = ALLOWED_DURATIONS.includes(rawDuration) ? rawDuration : 60;

    cancelPendingChallenge(socket.id);
    removeFromQueue(socket.id);

    const index = matchQueue.findIndex(
      entry =>
        entry.duration === duration &&
        entry.id !== socket.id &&
        users[entry.id] &&
        !users[entry.id].inMatch
    );

    if (index !== -1) {
      const [entry] = matchQueue.splice(index, 1);
      startMatchLogic(user, users[entry.id], duration);
    } else {
      matchQueue.push({ id: socket.id, duration });
      socket.emit("searching");
    }
  });

  // Sistema de desafíos directos
  socket.on("challenge_user", (data: { targetUsername: string; duration: number }) => {
    const challenger = users[socket.id];
    if (!challenger) {
      socket.emit("session_expired");
      return;
    }
    if (challenger.inMatch) {
      socket.emit("challenge_failed", { message: "You are already in a match." });
      return;
    }

    const target = Object.values(users).find(u => u.username === data?.targetUsername);
    if (!target) {
      socket.emit("challenge_failed", { message: "User is offline." });
      return;
    }
    if (target.id === challenger.id) {
      socket.emit("challenge_failed", { message: "You can't challenge yourself." });
      return;
    }
    if (target.inMatch) {
      socket.emit("challenge_failed", { message: `${target.username} is already in a match.` });
      return;
    }

    const duration = ALLOWED_DURATIONS.includes(data.duration) ? data.duration : 60;

    removeFromQueue(challenger.id);
    cancelPendingChallenge(challenger.id); // reemplaza un desafío anterior si existía
    pendingChallenges[challenger.id] = { targetId: target.id, duration };

    io.to(target.id).emit("challenge_received", {
      fromUsername: challenger.username,
      fromElo: challenger.elo,
      duration
    });
  });

  socket.on("respond_to_challenge", (data: { fromUsername: string; accepted: boolean }) => {
    const target = users[socket.id];
    if (!target) {
      socket.emit("session_expired");
      return;
    }

    const challenger = Object.values(users).find(u => u.username === data?.fromUsername);
    const pending = challenger ? pendingChallenges[challenger.id] : undefined;

    // El desafío debe seguir vigente y estar dirigido a este usuario
    if (!challenger || !pending || pending.targetId !== target.id) {
      socket.emit("challenge_failed", { message: "That challenge is no longer available." });
      return;
    }

    delete pendingChallenges[challenger.id];

    if (!data.accepted) {
      console.log(`[Server] Challenge declined by ${target.username}`);
      io.to(challenger.id).emit("challenge_declined", { by: target.username });
      return;
    }

    if (challenger.inMatch || target.inMatch) {
      const message = "Match failed to start. Someone is already playing.";
      io.to(target.id).emit("challenge_failed", { message });
      io.to(challenger.id).emit("challenge_failed", { message });
      return;
    }

    console.log(`[Server] Challenge accepted: ${challenger.username} vs ${target.username}`);
    startMatchLogic(challenger, target, pending.duration);
  });

  socket.on("cancel_matchmaking", () => {
    removeFromQueue(socket.id);
    cancelPendingChallenge(socket.id);
  });

  // Abandonar la partida (EXIT)
  socket.on("leave_match", (matchId: string) => {
    forfeitMatch(matchId, socket.id);
  });

  // Sincronización: esperar a que ambos jugadores tengan la cámara lista
  socket.on("player_ready", (matchId: string) => {
    const match = activeMatches[matchId];
    if (!match || match.started || !match.players.includes(socket.id)) return;

    if (!match.readyPlayers.includes(socket.id)) {
      match.readyPlayers.push(socket.id);
    }

    if (match.readyPlayers.length === 2) {
      match.started = true;
      clearMatchTimers(match); // cancela el timeout de "listos"

      match.players.forEach(playerId => io.to(playerId).emit("start_countdown"));

      match.timers.push(
        setTimeout(() => {
          if (activeMatches[matchId]) {
            match.players.forEach(playerId => io.to(playerId).emit("start_match"));
          }
        }, COUNTDOWN_MS)
      );

      match.timers.push(
        setTimeout(() => endMatch(matchId), COUNTDOWN_MS + match.duration * 1000 + END_GRACE_MS)
      );
    }
  });

  // Actualizaciones de repeticiones en tiempo real
  socket.on("rep_update", (matchId: string, reps: number) => {
    const match = activeMatches[matchId];
    if (!match || !match.started || !match.players.includes(socket.id)) return;
    if (typeof reps !== "number" || !Number.isFinite(reps) || reps < 0) return;

    match.scores[socket.id] = Math.floor(reps);
    const opponentId = match.players.find(id => id !== socket.id);
    if (opponentId) io.to(opponentId).emit("opponent_rep_update", match.scores[socket.id]);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const user = users[socket.id];

    removeFromQueue(socket.id);
    clearChallengesInvolving(socket.id, `${user ? user.username : "User"} is offline.`);

    const match = Object.values(activeMatches).find(m => m.players.includes(socket.id));
    if (match) forfeitMatch(match.id, socket.id); // antes de borrar al usuario

    delete users[socket.id];
    broadcastOnlineUsers();
  });
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Battle Server running on port ${PORT}`);
});
