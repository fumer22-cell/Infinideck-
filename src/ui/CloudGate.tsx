import { useEffect, useState } from 'react';
import { cloudStatus, onCloudStatus, onRemoteChange, resolveConflict, startCloud, type Conflict } from '../core/cloud';
import { App } from './App';

const CLOUD = import.meta.env.MODE === 'artifact';

/** In the claude.ai build, sync the save with Claude before the game starts. */
export function CloudGate() {
  const [phase, setPhase] = useState<'loading' | 'conflict' | 'ready'>(CLOUD ? 'loading' : 'ready');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [appKey, setAppKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!CLOUD) return;
    onRemoteChange(() => setAppKey((k) => k + 1));
    void startCloud().then((r) => {
      if (r.outcome === 'conflict' && r.conflict) {
        setConflict(r.conflict);
        setPhase('conflict');
      } else {
        if (r.outcome === 'pulled') setAppKey((k) => k + 1);
        setPhase('ready');
      }
    });
  }, []);

  const choose = async (keep: 'cloud' | 'device') => {
    setBusy(true);
    try {
      await resolveConflict(keep);
    } finally {
      setAppKey((k) => k + 1);
      setPhase('ready');
    }
  };

  if (phase === 'ready') return <App key={appKey} />;
  return (
    <div className="app">
      <div className="screen" style={{ justifyContent: 'center' }}>
        <div className="title-logo">GRIMRECALL</div>
        {phase === 'loading' && <div className="subtitle">Fetching your save from Claude…</div>}
        {phase === 'conflict' && conflict && (
          <div className="stone col">
            <h2>Two different saves</h2>
            <div className="serif" style={{ fontSize: 16 }}>
              Your save on Claude ({conflict.cloudCards} cards, updated {new Date(conflict.cloudUpdatedAt).toLocaleString()}) differs from the unsynced save in this browser ({conflict.localCards} cards). Which one do you want to keep?
            </div>
            <button className="btn block green" disabled={busy} onClick={() => choose('cloud')}>Keep the Claude save</button>
            <button className="btn block red" disabled={busy} onClick={() => choose('device')}>Keep this browser’s save</button>
            <div className="small muted">The other one is replaced.</div>
          </div>
        )}
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  synced: 'Saved to Claude',
  saving: 'Saving to Claude…',
  error: 'Not saved',
  unavailable: 'This browser only',
};

export function useCloudStatus() {
  const [s, setS] = useState(cloudStatus());
  useEffect(() => onCloudStatus(() => setS(cloudStatus())), []);
  return s;
}

export function CloudBadge() {
  const s = useCloudStatus();
  if (s.status === 'off') return null;
  const color = s.status === 'synced' ? 'var(--moss-hi)' : s.status === 'error' ? 'var(--blood-hi)' : 'var(--muted)';
  return (
    <span className="pill" title={s.error || undefined} style={{ color }}>
      ☁ {LABEL[s.status]}
    </span>
  );
}
