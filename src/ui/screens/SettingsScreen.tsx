import { useRef, useState } from 'react';
import { exportSave, importSave } from '../../core/backup';
import { db } from '../../core/db';
import type { Settings } from '../../core/settings';
import { syncNow } from '../../core/cloud';
import { TopBar } from '../common';
import { useCloudStatus } from '../CloudGate';
import { useApp } from '../context';

/** Hosted inside a claude.ai artifact: downloads are blocked, so backups go through copy/paste. */
const IS_ARTIFACT = import.meta.env.MODE === 'artifact';

export function SettingsScreen() {
  const { settings, setSettings, toast, ask } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const cloud = useCloudStatus();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });

  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportSave();
      if (IS_ARTIFACT) {
        setExported(json);
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `grimrecall-save-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setBusy(false);
    }
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exported!);
      toast('Save copied. Paste it somewhere safe.');
    } catch {
      const ta = document.getElementById('export-json') as HTMLTextAreaElement | null;
      ta?.select();
      toast('Copy blocked here. The text is selected: copy it manually.');
    }
  };

  const restore = async (json: string) => {
    if (!json.trim()) return;
    if (!(await ask('Restoring replaces ALL current decks, cards, progress and settings.', 'Restore'))) return;
    setBusy(true);
    try {
      await importSave(json);
      toast('Save restored.');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast(`Restore failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (!(await ask('Erase EVERYTHING? Export a backup first.', 'Erase'))) return;
    if (!(await ask('All cards and progress will be lost forever.', 'Erase for good'))) return;
    await db.delete();
    location.reload();
  };

  const num = (k: 'newPerDay' | 'maxReviewsPerDay' | 'dayStartHour', lo: number, hi: number) => (
    <input id={`set-${k}`} type="number" inputMode="numeric" min={lo} max={hi} value={settings[k]} onChange={(e) => set(k, Math.max(lo, Math.min(hi, Number(e.target.value) || 0)))} style={{ width: 90 }} />
  );

  return (
    <>
      <TopBar title="Settings" />
      <div className="screen">
        <div className="stone col">
          <h3>Game</h3>
          <label className="toggle">
            <span>Sound effects</span>
            <input id="set-sound" type="checkbox" checked={!settings.muted} onChange={(e) => set('muted', !e.target.checked)} />
          </label>
          <label className="toggle">
            <span>Speed bonus (+25% if revealed within 6s; never for new cards)</span>
            <input id="set-speed" type="checkbox" checked={settings.speedBonus} onChange={(e) => set('speedBonus', e.target.checked)} />
          </label>
        </div>
        <div className="stone col">
          <h3>Scheduling (FSRS)</h3>
          <label className="toggle"><span>New cards / day</span>{num('newPerDay', 0, 9999)}</label>
          <label className="toggle"><span>Max reviews / day</span>{num('maxReviewsPerDay', 0, 99999)}</label>
          <label className="toggle"><span>Next day starts at (hour)</span>{num('dayStartHour', 0, 23)}</label>
          <label className="toggle">
            <span>Desired retention</span>
            <select id="set-retention" value={settings.retention} onChange={(e) => set('retention', Number(e.target.value))} style={{ width: 110 }}>
              {[0.8, 0.85, 0.9, 0.93, 0.95, 0.97].map((r) => (
                <option key={r} value={r}>{Math.round(r * 100)}%</option>
              ))}
            </select>
          </label>
        </div>
        {cloud.status !== 'off' && (
          <div className="stone col">
            <h3>Save on Claude</h3>
            <div className="serif" style={{ fontSize: 15 }}>
              {cloud.status === 'unavailable'
                ? 'Claude storage is not available in this view, so your cards are only saved in this browser. Open the artifact signed in to claude.ai to save them to your account.'
                : 'Your cards, progress and images save to your Claude account automatically, so they follow you to any device where you open this page. Only you can see them.'}
            </div>
            {cloud.status !== 'unavailable' && (
              <>
                <div className="small muted">
                  {cloud.error || (cloud.lastSyncAt ? `Last saved ${new Date(cloud.lastSyncAt).toLocaleString()}` : 'Not saved yet')}
                </div>
                <button className="btn block" disabled={cloud.status === 'saving' || cloud.status === 'connecting'} onClick={() => void syncNow()}>
                  {cloud.status === 'saving' ? 'Saving…' : 'Sync now'}
                </button>
              </>
            )}
          </div>
        )}
        <div className="stone col">
          <h3>Backup</h3>
          <div className="serif muted" style={{ fontSize: 15 }}>
            Everything lives only in this browser. {IS_ARTIFACT ? 'Copy your save regularly and keep it somewhere safe.' : 'Export regularly.'}
          </div>
          <button className="btn block" disabled={busy} onClick={doExport}>{IS_ARTIFACT ? 'Show save text' : 'Export save (.json)'}</button>
          {exported != null && (
            <>
              <textarea id="export-json" readOnly value={exported} style={{ minHeight: 120, fontSize: 12 }} onFocus={(e) => e.target.select()} />
              <button className="btn block green" onClick={copyExport}>Copy save</button>
            </>
          )}
          <button className="btn block stone" disabled={busy} onClick={() => fileRef.current?.click()}>Restore from file…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await restore(await f.text()); }} />
          {IS_ARTIFACT && (
            <>
              <label htmlFor="paste-json">Or paste a save</label>
              <textarea id="paste-json" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"app":"grimrecall", …}' style={{ minHeight: 70, fontSize: 12 }} />
              <button className="btn block stone" disabled={busy || !pasted.trim()} onClick={() => restore(pasted)}>Restore pasted save</button>
            </>
          )}
          <button className="btn block red" onClick={wipe}>Erase all data</button>
        </div>
        <div className="small muted center">Grimrecall · scheduling by FSRS (ts-fsrs)</div>
      </div>
    </>
  );
}
