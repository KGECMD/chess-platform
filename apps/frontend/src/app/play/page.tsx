'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/store';
import { getSocket } from '@/lib/socket';
import type { ServerEvent } from '@chess/shared';

const MODES = [
  { key: 'bullet', label: '1+0', initial: 60, increment: 0 },
  { key: 'blitz', label: '3+2', initial: 180, increment: 2 },
  { key: 'rapid', label: '10+5', initial: 600, increment: 5 },
  { key: 'classical', label: '30+30', initial: 1800, increment: 30 },
];

export default function PlayLobby() {
  const { token, user, hydrate } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [queuedMode, setQueuedMode] = useState<string | null>(null);

  useEffect(() => { hydrate(); }, [hydrate]);

  const queue = useCallback((mode: string) => {
    if (!token) return;
    const sock = getSocket(token);
    setQueuedMode(mode);
    setStatus(`Searching opponent for ${mode}…`);
    const onServer = (evt: ServerEvent) => {
      if (evt.type === 'queued') setStatus(evt.mode === 'cancelled' ? 'Cancelled' : `Queued for ${evt.mode} — if nobody joins we'll match you with Stockfish.`);
      else if (evt.type === 'match_found') {
        sock.off('server', onServer);
        router.push(`/game/${evt.game.id}`);
      } else if (evt.type === 'error') setStatus(evt.message);
    };
    sock.on('server', onServer);
    sock.emit('queue', { mode });
  }, [token, router]);

  const cancel = useCallback(() => {
    if (!token) return;
    const sock = getSocket(token);
    sock.emit('queue_cancel');
    setQueuedMode(null);
    setStatus('');
  }, [token]);

  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Find a match</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Pick a time control. We&apos;ll pair you with an opponent of similar rating — if nobody shows up within ~15s,
          you&apos;ll get a Stockfish game instead so you never wait around.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {MODES.map((m) => (
          <button
            key={m.key}
            disabled={!token || queuedMode !== null}
            onClick={() => queue(m.key)}
            className="card hover:border-brand transition text-left disabled:opacity-50"
          >
            <div className="text-lg font-semibold text-white">{m.label}</div>
            <div className="text-xs text-neutral-400 mt-1 uppercase tracking-wide">{m.key}</div>
          </button>
        ))}
      </div>
      {queuedMode && (
        <div className="card flex items-center justify-between">
          <span>{status}</span>
          <button onClick={cancel} className="btn-outline text-sm">Cancel</button>
        </div>
      )}
      {!queuedMode && status && <div className="text-sm text-neutral-400">{status}</div>}
      {!user && <div className="text-sm text-neutral-500">Connecting…</div>}
    </section>
  );
}
