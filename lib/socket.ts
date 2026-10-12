import { io, Socket } from "socket.io-client";

// En producción (Vercel) usa NEXT_PUBLIC_SOCKET_URL apuntando al backend en Railway/Render/etc.
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
