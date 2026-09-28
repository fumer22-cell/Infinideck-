import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addXp, DEFAULT_PROFILE, loadProfile, saveProfile, type LevelUp, type Profile } from '../core/profile';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../core/settings';
import { db } from '../core/db';
import { ITEMS } from '../game/items';
import { levels, maxHpFor } from '../game/skills';
import { loadWorld, newWorld, pushLog, regen, saveWorld, syncPlots, tickFurnace, type World } from '../game/world';
import { Sprite, Toast } from './common';
import { Ctx, type AppCtx, type Screen, type Tab } from './context';
import { Fanfare } from './Fanfare';
import { setMuted, sfx } from './sfx';
import { StudyTab } from './tabs/StudyTab';
import { SkillsTab, SkillDetail } from './tabs/SkillsTab';
import { BankTab, Shop } from './tabs/BankTab';
import { GearTab } from './tabs/GearTab';
import { JourneyTab } from './tabs/JourneyTab';
import { Decks } from './screens/Decks';
import { DeckView } from './screens/DeckView';
import { CardEditor } from './screens/CardEditor';
import { ImportScreen } from './screens/ImportScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'study', label: 'Study', icon: 'eye' },
  { id: 'skills', label: 'Skills', icon: 'star' },
  { id: 'bank', label: 'Bank', icon: 'chest' },
  { id: 'gear', label: 'Gear', icon: 'helm' },
  { id: 'journey', label: 'Journey', icon: 'book' },
];

export function App() {
  const [ready, setReady] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ name: 'study' }]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const profileRef = useRef(profile);
  const [world, setWorld] = useState<World>(() => newWorld(40));
  const worldRef = useRef(world);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [fanfare, setFanfare] = useState<LevelUp[] | null>(null);
  const [asking, setAsking] = useState<{ message: string; label: string; resolve: (ok: boolean) => void } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const lv = useMemo(() => levels(profile.xp), [profile.xp]);
  const maxHp = maxHpFor(lv.hitpoints);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const updateProfile = async (fn: (p: Profile) => LevelUp[] | void) => {
    const next: Profile = structuredClone(profileRef.current);
    const ups = fn(next) ?? [];
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    return ups;
  };
  const updateWorld = async <T,>(fn: (w: World) => T): Promise<T> => {
    const next: World = structuredClone(worldRef.current);
    const out = fn(next);
    worldRef.current = next;
    setWorld(next);
    await saveWorld(next);
    return out;
  };
  const celebrate = (ups: LevelUp[]) => {
    if (!ups.length) return;
    sfx.levelUp();
    setFanfare(ups);
  };
  const gainXp = async (gains: Partial<Record<string, number>>) => {
    const ups = await updateProfile((p) => addXp(p, gains));
    celebrate(ups);
    return ups;
  };

  // load everything, then keep real-time systems (furnace, HP regen) ticking
  useEffect(() => {
    Promise.all([loadSettings(), loadProfile()])
      .then(async ([s, p]) => {
        setSettingsState(s);
        setMuted(s.muted);
        profileRef.current = p;
        setProfile(p);
        await saveProfile(p);
        const w = await loadWorld(maxHpFor(levels(p.xp).hitpoints));
        if (await db.kv.get('run')) await db.kv.delete('run'); // retired roguelike run
        worldRef.current = w;
        setWorld(w);
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setLoadError('This browser is blocking local storage (private window or blocked site data), so Grimrecall cannot save your cards here.');
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tick = async () => {
      const lvNow = levels(profileRef.current.xp);
      const hpMax = maxHpFor(lvNow.hitpoints);
      const w = worldRef.current;
      const needs = (w.furnace && Date.now() - w.furnace.start >= (w.furnace.done + 1) * w.furnace.msEach) || (!w.combat && w.hp < hpMax);
      if (!needs) return;
      let smelted: ReturnType<typeof tickFurnace> = null;
      await updateWorld((nw) => {
        smelted = tickFurnace(nw);
        regen(nw, hpMax);
        syncPlots(nw, lvNow);
        if (smelted) pushLog(nw, `The furnace yields ${smelted.bars} ${ITEMS[smelted.bar].name.toLowerCase()}${smelted.bars > 1 ? 's' : ''}.`, 'loot');
      });
      const got = smelted as ReturnType<typeof tickFurnace>;
      if (got) {
        sfx.coin();
        await gainXp({ smithing: got.xp });
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => clearInterval(t);
  }, [ready]);

  const screen = stack[stack.length - 1];
  const rootTab = (stack[0].name as Tab) ?? 'study';

  const app: AppCtx = {
    settings,
    setSettings: (s) => {
      setSettingsState(s);
      setMuted(s.muted);
      void saveSettings(s);
    },
    profile,
    updateProfile,
    world,
    updateWorld,
    lv,
    maxHp,
    gainXp,
    go: (s) => setStack((st) => (TABS.some((t) => t.id === s.name) ? [s] : [...st, s])),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    tab: rootTab,
    toast,
    celebrate,
    ask: (message, label = 'Confirm') => new Promise((resolve) => setAsking({ message, label, resolve })),
  };
  const answer = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };
  const closeFanfare = useCallback(() => setFanfare(null), []);

  return (
    <Ctx.Provider value={app}>
      <div className="app">
        {!ready ? (
          <div className="screen" style={{ justifyContent: 'center' }}>
            <div className="title-logo">GRIMRECALL</div>
            {loadError && <div className="leather serif center" style={{ fontSize: 16 }}>{loadError}</div>}
          </div>
        ) : (
          <>
            <div className="main">
              <Route screen={screen} key={stack.length + screen.name} />
            </div>
            <nav className="tabbar" aria-label="Main">
              {TABS.map((t) => (
                <button key={t.id} className={`tab ${rootTab === t.id ? 'on' : ''}`} onClick={() => { sfx.tap(); setStack([{ name: t.id }]); }} aria-current={rootTab === t.id ? 'page' : undefined}>
                  <Sprite name={t.icon} size={22} />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        {fanfare && <Fanfare ups={fanfare} onDone={closeFanfare} />}
        {toastMsg && <Toast msg={toastMsg} />}
        {asking && (
          <div className="modal-back center" style={{ zIndex: 60 }}>
            <div className="modal stone" role="alertdialog" aria-modal="true">
              <div className="serif" style={{ fontSize: 17 }}>{asking.message}</div>
              <div className="grid2">
                <button className="btn stone" onClick={() => answer(false)}>Cancel</button>
                <button className="btn red" onClick={() => answer(true)} autoFocus>{asking.label}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

function Route({ screen }: { screen: Screen }) {
  switch (screen.name) {
    case 'study': return <StudyTab />;
    case 'skills': return <SkillsTab />;
    case 'bank': return <BankTab />;
    case 'gear': return <GearTab />;
    case 'journey': return <JourneyTab />;
    case 'skill': return <SkillDetail skill={screen.skill} />;
    case 'shop': return <Shop />;
    case 'decks': return <Decks />;
    case 'deck': return <DeckView deckId={screen.deckId} />;
    case 'editCard': return <CardEditor deckId={screen.deckId} cardId={screen.cardId} />;
    case 'import': return <ImportScreen deckId={screen.deckId} />;
    case 'settings': return <SettingsScreen />;
  }
}
