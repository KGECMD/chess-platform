import { Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService, JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from '../games/games.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { DEFAULT_TIME_CONTROLS, TimeControl } from '@chess/shared';

interface SocketUser {
  userId: string;
  username: string;
  rating: number;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  path: '/socket.io',
})
export class PlayGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(PlayGateway.name);
  private sockets = new Map<string, SocketUser>(); // socketId -> user
  private userToSocket = new Map<string, string>(); // userId -> active socketId

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  afterInit() {
    this.logger.log('Play gateway initialized');
  }

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    if (!token) {
      client.emit('server', { type: 'error', message: 'Missing token' });
      client.disconnect(true);
      return;
    }
    let payload: JwtPayload;
    try {
      payload = this.auth.verify(token);
    } catch {
      client.emit('server', { type: 'error', message: 'Invalid token' });
      client.disconnect(true);
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      client.emit('server', { type: 'error', message: 'User not found' });
      client.disconnect(true);
      return;
    }
    this.sockets.set(client.id, { userId: user.id, username: user.username, rating: user.rating });
    this.userToSocket.set(user.id, client.id);
    client.emit('server', { type: 'welcome', user: { id: user.id, username: user.username, rating: user.rating } });
  }

  async handleDisconnect(client: Socket) {
    const u = this.sockets.get(client.id);
    this.sockets.delete(client.id);
    if (u) {
      if (this.userToSocket.get(u.userId) === client.id) this.userToSocket.delete(u.userId);
      await this.matchmaking.dequeue(u.userId).catch(() => undefined);
    }
  }

  private getUser(client: Socket): SocketUser | undefined {
    return this.sockets.get(client.id);
  }

  @SubscribeMessage('queue')
  async onQueue(@ConnectedSocket() client: Socket, @MessageBody() body: { mode: string; custom?: TimeControl }) {
    const u = this.getUser(client);
    if (!u) return;
    const tc = body.mode === 'custom' && body.custom ? body.custom : DEFAULT_TIME_CONTROLS[body.mode];
    if (!tc) {
      client.emit('server', { type: 'error', message: 'Invalid time control' });
      return;
    }
    const match = await this.matchmaking.enqueue({
      userId: u.userId,
      username: u.username,
      rating: u.rating,
      socketId: client.id,
      mode: body.mode,
      initial: tc.initial,
      increment: tc.increment,
      enqueuedAt: Date.now(),
    });
    if (match) {
      const whiteFirst = Math.random() > 0.5;
      const whiteId = whiteFirst ? match.a.userId : match.b.userId;
      const blackId = whiteFirst ? match.b.userId : match.a.userId;
      const state = await this.games.createHumanGame({ whiteId, blackId, timeControl: tc });
      const roomId = `game:${state.id}`;
      client.join(roomId);
      const opponentSocketId = this.userToSocket.get(match.a.userId === u.userId ? match.b.userId : match.a.userId);
      if (opponentSocketId) {
        this.server.sockets.sockets.get(opponentSocketId)?.join(roomId);
      }
      this.server.to(roomId).emit('server', { type: 'match_found', game: state });
    } else {
      client.emit('server', { type: 'queued', mode: body.mode });
    }
  }

  @SubscribeMessage('queue_cancel')
  async onQueueCancel(@ConnectedSocket() client: Socket) {
    const u = this.getUser(client);
    if (!u) return;
    await this.matchmaking.dequeue(u.userId);
    client.emit('server', { type: 'queued', mode: 'cancelled' });
  }

  @SubscribeMessage('join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string }) {
    const u = this.getUser(client);
    if (!u) return;
    const state = await this.games.get(body.gameId);
    const roomId = `game:${body.gameId}`;
    client.join(roomId);
    client.emit('server', { type: 'game_state', game: state });

    // Kick off the first AI move if the AI plays white (or if for any reason
    // the AI's turn is pending when the human joined).
    if (state.vsAi && state.status === 'in_progress') {
      const aiIsWhite = state.players.white.username === 'StockfishAI';
      const aiIsTurn = (state.turn === 'white' && aiIsWhite) || (state.turn === 'black' && !aiIsWhite);
      if (aiIsTurn) {
        this.triggerAiMove(body.gameId).catch((err) =>
          this.logger.error(`AI first-move failed: ${(err as Error).message}`),
        );
      }
    }
  }

  @SubscribeMessage('move')
  async onMove(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string; move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } }) {
    const u = this.getUser(client);
    if (!u) return;
    try {
      const state = await this.games.playMove(body.gameId, u.userId, body.move);
      const roomId = `game:${body.gameId}`;
      this.server.to(roomId).emit('server', { type: 'game_state', game: state });
      if (['white_win', 'black_win', 'draw', 'aborted'].includes(state.status)) {
        this.server.to(roomId).emit('server', { type: 'game_over', game: state });
        return;
      }
      if (state.vsAi && state.status === 'in_progress') {
        // Kick off AI reply asynchronously.
        this.triggerAiMove(body.gameId).catch((err) => this.logger.error(`AI move failed: ${(err as Error).message}`));
      }
    } catch (err) {
      client.emit('server', { type: 'error', message: (err as Error).message });
    }
  }

  private async triggerAiMove(gameId: string) {
    const { state } = await this.games.aiMove(gameId);
    const roomId = `game:${gameId}`;
    this.server.to(roomId).emit('server', { type: 'game_state', game: state });
    if (['white_win', 'black_win', 'draw', 'aborted'].includes(state.status)) {
      this.server.to(roomId).emit('server', { type: 'game_over', game: state });
    }
  }

  @SubscribeMessage('resign')
  async onResign(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string }) {
    const u = this.getUser(client);
    if (!u) return;
    const state = await this.games.resign(body.gameId, u.userId);
    const roomId = `game:${body.gameId}`;
    this.server.to(roomId).emit('server', { type: 'game_over', game: state });
  }

  @SubscribeMessage('offer_draw')
  async onOfferDraw(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string }) {
    const u = this.getUser(client);
    if (!u) return;
    const color = await this.games.offerDraw(body.gameId, u.userId);
    const roomId = `game:${body.gameId}`;
    this.server.to(roomId).emit('server', { type: 'draw_offered', gameId: body.gameId, by: color });
  }

  @SubscribeMessage('accept_draw')
  async onAcceptDraw(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string }) {
    const u = this.getUser(client);
    if (!u) return;
    const state = await this.games.acceptDraw(body.gameId, u.userId);
    const roomId = `game:${body.gameId}`;
    this.server.to(roomId).emit('server', { type: 'game_over', game: state });
  }

  @SubscribeMessage('decline_draw')
  async onDeclineDraw(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string }) {
    await this.games.declineDraw(body.gameId);
    const roomId = `game:${body.gameId}`;
    this.server.to(roomId).emit('server', { type: 'chat', gameId: body.gameId, from: 'system', text: 'Draw declined', at: new Date().toISOString() });
  }

  @SubscribeMessage('chat')
  async onChat(@ConnectedSocket() client: Socket, @MessageBody() body: { gameId: string; text: string }) {
    const u = this.getUser(client);
    if (!u) return;
    const text = (body.text ?? '').toString().slice(0, 500);
    if (!text.trim()) return;
    const roomId = `game:${body.gameId}`;
    this.server.to(roomId).emit('server', {
      type: 'chat',
      gameId: body.gameId,
      from: u.username,
      text,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('ping')
  onPing(@ConnectedSocket() client: Socket) {
    client.emit('server', { type: 'pong' });
  }

  /** Periodic: pair matchmaking entries whose tolerance has widened; flag expired clocks. */
  @Interval(1500)
  async tick() {
    try {
      const matches = await this.matchmaking.sweep();
      for (const m of matches) {
        const whiteFirst = Math.random() > 0.5;
        const whiteId = whiteFirst ? m.a.userId : m.b.userId;
        const blackId = whiteFirst ? m.b.userId : m.a.userId;
        const state = await this.games.createHumanGame({
          whiteId,
          blackId,
          timeControl: { initial: m.a.initial, increment: m.a.increment },
        });
        const roomId = `game:${state.id}`;
        const aSocket = this.userToSocket.get(m.a.userId);
        const bSocket = this.userToSocket.get(m.b.userId);
        if (aSocket) this.server.sockets.sockets.get(aSocket)?.join(roomId);
        if (bSocket) this.server.sockets.sockets.get(bSocket)?.join(roomId);
        this.server.to(roomId).emit('server', { type: 'match_found', game: state });
      }

      // Auto-fallback to Stockfish after the configured wait threshold. Keeps the
      // lobby feeling alive when no human opponents are online.
      const fallbackMs = Number(process.env.BOT_FALLBACK_MS ?? 15_000);
      if (fallbackMs > 0) {
        const fallbacks = await this.matchmaking.takeBotFallbacks(fallbackMs);
        for (const entry of fallbacks) {
          const level = Number(process.env.BOT_FALLBACK_LEVEL ?? 6);
          const userPlaysWhite = Math.random() > 0.5;
          const state = await this.games.createAiGame({
            userId: entry.userId,
            userPlaysWhite,
            aiLevel: level,
            timeControl: { initial: entry.initial, increment: entry.increment },
          });
          const roomId = `game:${state.id}`;
          const socketId = this.userToSocket.get(entry.userId);
          if (socketId) {
            this.server.sockets.sockets.get(socketId)?.join(roomId);
          }
          this.server.to(roomId).emit('server', { type: 'match_found', game: state });
        }
      }

      const flagged = await this.games.checkFlags();
      for (const gameId of flagged) {
        const state = await this.games.get(gameId);
        this.server.to(`game:${gameId}`).emit('server', { type: 'game_over', game: state });
      }
    } catch (err) {
      this.logger.error(`tick error: ${(err as Error).message}`);
    }
  }
}
