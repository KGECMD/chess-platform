import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';

export interface EngineMoveOptions {
  fen: string;
  depth?: number;
  movetime?: number; // ms
  skill?: number; // 0..20
}

export interface EngineEvalResult {
  bestMove: string | null;
  ponder?: string;
  score: number; // centipawns (positive = side-to-move). Mate => large clamped.
  mate?: number;
  depth: number;
  pv: string[];
  raw: string[];
}

const DEFAULT_CANDIDATES = [
  process.env.STOCKFISH_PATH,
  '/usr/games/stockfish',
  '/usr/local/bin/stockfish',
  '/usr/bin/stockfish',
  'stockfish',
].filter(Boolean) as string[];

function resolveStockfishPath(): string {
  for (const c of DEFAULT_CANDIDATES) {
    if (c && (c === 'stockfish' || existsSync(c))) return c;
  }
  return 'stockfish';
}

interface PendingGo {
  resolve: (r: EngineEvalResult) => void;
  reject: (err: unknown) => void;
  lastInfo: { score: number; mate?: number; depth: number; pv: string[] };
  raw: string[];
  timer: NodeJS.Timeout;
}

/**
 * Persistent UCI session — one Stockfish subprocess that can handle many
 * `go` commands sequentially. Much faster than spawn-per-call for analysis.
 * The session is not thread-safe; callers must await each `analyze` call.
 */
export class EngineSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private pending: PendingGo | null = null;
  private closed = false;
  private buf = '';
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private currentSkill: number | null = null;

  constructor(path: string, private readonly logger: Logger) {
    this.child = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', (d: Buffer) => this.onData(d));
    this.child.stderr.on('data', (d: Buffer) => this.logger.debug(`stockfish stderr: ${d.toString('utf8').trim()}`));
    this.child.on('exit', () => {
      this.closed = true;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.reject(new Error('Stockfish exited'));
      }
    });
    this.send('uci');
    this.send('isready');
  }

  private send(line: string) {
    if (this.closed) throw new Error('Engine session closed');
    try {
      this.child.stdin.write(line + '\n');
    } catch (err) {
      this.logger.warn(`stdin write failed: ${(err as Error).message}`);
    }
  }

  private onData(d: Buffer) {
    this.buf += d.toString('utf8');
    const lines = this.buf.split('\n');
    this.buf = lines.pop() ?? '';
    for (const line of lines) this.onLine(line.trim());
  }

  private onLine(line: string) {
    if (line === 'readyok' || line === 'uciok') {
      this.ready = true;
      const ws = this.readyWaiters.splice(0);
      for (const w of ws) w();
      return;
    }
    if (!this.pending) return;
    const p = this.pending;
    p.raw.push(line);
    if (line.startsWith('info')) {
      const m = /depth (\d+).*score (cp|mate) (-?\d+).*\spv\s+(.+)$/.exec(line);
      if (m) {
        const d = Number(m[1]);
        const kind = m[2];
        const val = Number(m[3]);
        const pv = m[4].split(/\s+/).filter(Boolean);
        if (kind === 'cp') {
          p.lastInfo = { score: val, depth: d, pv };
        } else {
          const cp = val > 0 ? 100000 - val * 10 : -100000 - val * 10;
          p.lastInfo = { score: cp, mate: val, depth: d, pv };
        }
      }
    } else if (line.startsWith('bestmove')) {
      const parts = line.split(/\s+/);
      const best = parts[1];
      const ponderIdx = parts.indexOf('ponder');
      const ponder = ponderIdx >= 0 ? parts[ponderIdx + 1] : undefined;
      const result: EngineEvalResult = {
        bestMove: best && best !== '(none)' ? best : null,
        ponder,
        score: p.lastInfo.score,
        mate: p.lastInfo.mate,
        depth: p.lastInfo.depth,
        pv: p.lastInfo.pv,
        raw: p.raw,
      };
      clearTimeout(p.timer);
      this.pending = null;
      p.resolve(result);
    }
  }

  private waitReady(timeoutMs = 5000): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Engine not ready')), timeoutMs);
      this.readyWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }

  async analyze(opts: EngineMoveOptions): Promise<EngineEvalResult> {
    if (this.closed) throw new Error('Engine session closed');
    if (this.pending) throw new Error('Engine session busy');
    await this.waitReady().catch(() => undefined);

    const { fen, depth = 12, movetime, skill } = opts;
    if (typeof skill === 'number' && skill !== this.currentSkill) {
      const clamped = Math.max(0, Math.min(20, Math.round(skill)));
      this.send(`setoption name Skill Level value ${clamped}`);
      if (clamped < 20) {
        this.send(`setoption name UCI_LimitStrength value true`);
        this.send(`setoption name UCI_Elo value ${800 + clamped * 100}`);
      } else {
        this.send(`setoption name UCI_LimitStrength value false`);
      }
      this.currentSkill = clamped;
    }

    return new Promise<EngineEvalResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          try { this.child.stdin.write('stop\n'); } catch { /* ignore */ }
        }
      }, (movetime ?? depth * 250) + 4000);

      this.pending = {
        resolve,
        reject,
        lastInfo: { score: 0, depth: 0, pv: [] },
        raw: [],
        timer,
      };

      this.send(`position fen ${fen}`);
      if (movetime) this.send(`go movetime ${movetime}`);
      else this.send(`go depth ${depth}`);
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.child.stdin.write('quit\n'); } catch { /* ignore */ }
    try { this.child.kill(); } catch { /* ignore */ }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const p = this.pending;
      this.pending = null;
      p.reject(new Error('Engine session closed'));
    }
  }
}

@Injectable()
export class EngineService implements OnModuleDestroy {
  private readonly logger = new Logger(EngineService.name);
  private readonly path = resolveStockfishPath();
  private readonly sessions = new Set<EngineSession>();

  isAvailable(): boolean {
    return Boolean(this.path);
  }

  onModuleDestroy() {
    for (const s of this.sessions) {
      try { s.close(); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }

  createSession(): EngineSession {
    const s = new EngineSession(this.path, this.logger);
    this.sessions.add(s);
    return s;
  }

  /** One-shot analysis — spawns a fresh engine, runs one `go`, then exits. */
  async analyze(opts: EngineMoveOptions): Promise<EngineEvalResult> {
    const s = this.createSession();
    try {
      return await s.analyze(opts);
    } finally {
      this.sessions.delete(s);
      s.close();
    }
  }
}
