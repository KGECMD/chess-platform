'use client';

import { io, Socket } from 'socket.io-client';
import { WS_URL } from './config';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(WS_URL, {
    // Allow polling fallback for providers / networks that block raw websockets
    // (e.g. corporate proxies, some free tiers). Socket.IO will still upgrade
    // to a websocket whenever possible.
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10_000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
