import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PROFILE, loadProfile, saveProfile, type LevelUp, type Profile } from '../core/profile';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../core/settings';
import { Toast } from './common';
import { Ctx, type AppCtx, type Screen } from './context';
import { Fanfare } from './Fanfare';
import { setMuted, sfx } from './sfx';
import { Town } from './screens/Town';
import { Decks } from './screens/Decks';
import { DeckView } from './screens/DeckView';
import { CardEditor } from './screens/CardEditor';
import { Study } from './screens/Study';
import { ImportScreen } from './screens/ImportScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Skills } from './screens/Skills';
import { Armoury } from './screens/Armoury';
import { ClassSelect } from './screens/ClassSelect';
import { RunScreen } from './run/RunScreen';

export function App() {
  const [ready, setReady] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ name: 'town' }]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const profileRef = useRef(profile);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [fanfare, setFanfare] = useState<LevelUp[] | null>(null);
  const [asking, setAsking] = useState<{ message: string; label: string; resolve: (ok: boolean) => void } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadSettings(), loadProfile()])
      .then(([s, p]) => {
        setSettingsState(s);
        setMuted(s.muted);
        profileRef.current = p;
        setProfile(p);
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setLoadError('This browser is blocking local storage (private window or blocked site data), so Grimrecall cannot save your cards here.');
      });
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const app: AppCtx = {
    settings,
    setSettings: (s) => {
      setSettingsState(s);
      setMuted(s.muted);
      void saveSettings(s);
    },
    profile,
    updateProfile: async (fn) => {
      const next: Profile = structuredClone(profileRef.current);
      const ups = fn(next) ?? [];
      profileRef.current = next;
      setProfile(next);
      await saveProfile(next);
      return ups;
    },
    go: (s) => setStack((st) => (s.name === 'town' ? [s] : [...st, s])),
    back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
    toast,
    celebrate: (ups) => {
      if (!ups.length) return;
      sfx.levelUp();
      setFanfare(ups);
    },
    ask: (message, label = 'Confirm') => new Promise((resolve) => setAsking({ message, label, resolve })),
  };
  const answer = (ok: boolean) => {
    asking?.resolve(ok);
    setAsking(null);
  };

  const screen = stack[stack.length - 1];
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
          <Route screen={screen} key={stack.length + screen.name} />
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
    case 'town': return <Town />;
    case 'decks': return <Decks />;
    case 'deck': return <DeckView deckId={screen.deckId} />;
    case 'editCard': return <CardEditor deckId={screen.deckId} cardId={screen.cardId} />;
    case 'study': return <Study deckId={screen.deckId} />;
    case 'import': return <ImportScreen deckId={screen.deckId} />;
    case 'settings': return <SettingsScreen />;
    case 'skills': return <Skills />;
    case 'armoury': return <Armoury />;
    case 'classSelect': return <ClassSelect mode={screen.mode} />;
    case 'run': return <RunScreen />;
  }
}
