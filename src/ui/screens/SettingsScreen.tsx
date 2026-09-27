import { useRef, useState } from 'react';
import { exportSave, importSave } from '../../core/backup';
import { db } from '../../core/db';
import type { Settings } from '../../core/settings';
import { TopBar } from '../common';
import { useApp } from '../context';

export function SettingsScreen() {
  const { settings, setSettings, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });

  const doExport = async () => {
    setBusy(true);
    try {
      const json = await exportSave();
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

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (!confirm('Restoring replaces ALL current decks, cards, progress and settings. Continue?')) return;
    setBusy(true);
    try {
      await importSave(await f.text());
      toast('Save restored.');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast(`Restore failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (!confirm('Erase EVERYTHING? Export a backup first!')) return;
    if (!confirm('Really? All cards and progress will be lost forever.')) return;
    await db.delete();
    location.reload();
  };

  const num = (k: 'newPerDay' | 'maxReviewsPerDay' | 'dayStartHour', lo: number, hi: number) => (
    <input type="number" inputMode="numeric" min={lo} max={hi} value={settings[k]} onChange={(e) => set(k, Math.max(lo, Math.min(hi, Number(e.target.value) || 0)))} style={{ width: 90 }} />
  );

  return (
    <>
      <TopBar title="Settings" />
      <div className="screen">
        <div className="stone col">
          <h3>Game</h3>
          <label className="toggle">
            <span>Sound effects</span>
            <input type="checkbox" checked={!settings.muted} onChange={(e) => set('muted', !e.target.checked)} />
          </label>
          <label className="toggle">
            <span>Speed bonus (+25% if revealed within 6s; never for new cards)</span>
            <input type="checkbox" checked={settings.speedBonus} onChange={(e) => set('speedBonus', e.target.checked)} />
          </label>
        </div>
        <div className="stone col">
          <h3>Scheduling (FSRS)</h3>
          <label className="toggle"><span>New cards / day</span>{num('newPerDay', 0, 9999)}</label>
          <label className="toggle"><span>Max reviews / day</span>{num('maxReviewsPerDay', 0, 99999)}</label>
          <label className="toggle"><span>Next day starts at (hour)</span>{num('dayStartHour', 0, 23)}</label>
          <label className="toggle">
            <span>Desired retention</span>
            <select value={settings.retention} onChange={(e) => set('retention', Number(e.target.value))} style={{ width: 110 }}>
              {[0.8, 0.85, 0.9, 0.93, 0.95, 0.97].map((r) => (
                <option key={r} value={r}>{Math.round(r * 100)}%</option>
              ))}
            </select>
          </label>
        </div>
        <div className="stone col">
          <h3>Backup</h3>
          <div className="serif muted" style={{ fontSize: 15 }}>Everything lives only on this device. Export regularly.</div>
          <button className="btn block" disabled={busy} onClick={doExport}>Export save (.json)</button>
          <button className="btn block stone" disabled={busy} onClick={() => fileRef.current?.click()}>Restore from save…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
          <button className="btn block red" onClick={wipe}>Erase all data</button>
        </div>
        <div className="small muted center">Grimrecall · scheduling by FSRS (ts-fsrs)</div>
      </div>
    </>
  );
}
