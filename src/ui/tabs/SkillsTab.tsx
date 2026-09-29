import { useEffect, useState } from 'react';
import { TRAIT_INFO } from '../../game/enemies';
import { AREAS, COOKING, FORGING, GATHER, SEEDS, SMELTING, plotCount } from '../../game/activities';
import { ITEMS, LOG_ORDER, METALS } from '../../game/items';
import { combatLevel, SKILL_BY_ID, SKILLS, totalLevel, XP_TABLE, xpProgress, type SkillGroup, type SkillId } from '../../game/skills';
import { areaLocked, bestTool, FERTILISER, harvest, leaveCombat, maxSmeltable, plant, plotReady, pushLog, startSmelt, syncPlots, TOOL_FOR, toolNeeded, type Active, type CombatStyle } from '../../game/world';
import { MASTERY_SAFE, masteryDouble } from '../../game/rewards';
import { CardCheck } from '../CardCheck';
import { ItemIcon, PageHeader, SectionTitle, Sprite, TopBar, XpBar } from '../common';
import { useApp } from '../context';
import { sfx } from '../sfx';
import { activityInfo } from './Scene';

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

/** Re-render every second for countdowns. */
function useClock() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return Date.now();
}

const GROUPS: SkillGroup[] = ['Gathering', 'Artisan', 'Combat', 'Knowledge'];

export function SkillsTab() {
  const { profile, lv, world, go } = useApp();
  const activeSkill = world.active ? activityInfo(world.active).skill : null;
  const combatActive = world.active?.kind === 'combat';
  const readyPlots = world.plots.filter((p) => p && Date.now() - p.planted >= p.growMs).length;
  return (
    <div className="screen">
      <PageHeader
        title="Skills"
        sub={world.active ? `Training: ${activityInfo(world.active).name}` : 'Pick an activity to train'}
        right={
          <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
            <span className="pill gold num">Total {totalLevel(lv)}</span>
            <span className="pill num">Combat {combatLevel(lv)}</span>
          </div>
        }
      />
      {GROUPS.map((g) => (
        <section key={g} className="col">
          <SectionTitle>{g}</SectionTitle>
          <div className="skill-grid">
            {SKILLS.filter((s) => s.group === g).map((s) => {
              const pr = xpProgress(profile.xp[s.id]);
              const on = activeSkill === s.id || (combatActive && s.group === 'Combat' && s.id === world.style);
              const note = s.id === 'farming' && readyPlots ? `${readyPlots} ready` : s.id === 'smithing' && world.furnace ? 'smelting' : null;
              return (
                <button key={s.id} className={`skill-tile ${on ? 'on' : ''}`} onClick={() => { sfx.tap(); go({ name: 'skill', skill: s.id }); }} aria-label={`${s.name} level ${pr.level}`}>
                  <Sprite name={s.icon} size={26} />
                  <div className="skill-name">
                    <span>{s.name}</span>
                    {note && <span className="green tiny">{note}</span>}
                  </div>
                  <div className="skill-lvl">{pr.level}<small>/99</small></div>
                  <XpBar into={pr.into} span={pr.span} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SkillDetail({ skill }: { skill: SkillId }) {
  const app = useApp();
  const { profile } = app;
  const s = SKILL_BY_ID[skill];
  const pr = xpProgress(profile.xp[skill]);
  return (
    <>
      <TopBar title={s.name} right={<span className="pill small">{s.group}</span>} />
      <div className="screen">
        <div className="stone gilded col">
          <div className="row" style={{ gap: 12 }}>
            <Sprite name={s.icon} size={40} className="icon-tile" />
            <div className="grow">
              <div className="row" style={{ alignItems: 'baseline' }}>
                <span className="lvl-big">Level {pr.level}</span>
                <span className="small faint">/ 99</span>
              </div>
              <XpBar into={pr.into} span={pr.span} />
              <div className="small muted num" style={{ marginTop: 4 }}>
                {profile.xp[skill].toLocaleString()} xp{pr.level < 99 ? ` · ${(XP_TABLE[pr.level + 1] - profile.xp[skill]).toLocaleString()} to next` : ''}
              </div>
            </div>
          </div>
          <div className="desc small">{s.desc}</div>
        </div>
        {(skill === 'mining' || skill === 'woodcutting' || skill === 'fishing') && <GatherList skill={skill} />}
        {skill === 'cooking' && <CookList />}
        {skill === 'smithing' && (
          <>
            <FurnacePanel />
            <ForgeList />
          </>
        )}
        {skill === 'farming' && <FarmPanel />}
        {(skill === 'attack' || skill === 'strength' || skill === 'defence' || skill === 'hitpoints') && <CombatAreas />}
        {skill === 'scholarship' && (
          <div className="leather desc">
            Scholarship grows with every scheduled review, whatever you are training. Mature cards give more. Practice cards don’t count. Each level adds 1% to the gold you find.
          </div>
        )}
      </div>
    </>
  );
}

function useTrain() {
  const app = useApp();
  return async (a: Active) => {
    await app.updateWorld((w) => {
      if (w.combat && a.kind !== 'combat') leaveCombat(w);
      w.active = a;
      pushLog(w, `You start: ${activityInfo(a).name.toLowerCase()}.`, 'info');
    });
    sfx.tap();
    app.go({ name: 'study' });
  };
}

function isActive(a: Active | null, kind: Active['kind'], id: string) {
  return a?.kind === kind && a.id === id;
}

/** Mastery of one rock, tree, spot or recipe: a level and a thin bar. */
function Mastery({ id }: { id: string }) {
  const { world } = useApp();
  const xp = world.mastery?.[id] ?? 0;
  if (!xp) return null;
  const pr = xpProgress(xp);
  const perk = masteryDouble(pr.level);
  return (
    <div className="mastery" title={`Mastery ${pr.level}${perk ? `: +${Math.round(perk * 100)}% double yield` : ''}`}>
      <span>Mastery {pr.level}</span>
      <XpBar into={pr.into} span={pr.span} tone="gold" />
      {pr.level >= MASTERY_SAFE && <span className="green">safe</span>}
    </div>
  );
}

/** A callout naming the next thing to unlock and every step it needs. */
function NextGoal({ title, steps }: { title: string; steps: { text: string; done: boolean }[] }) {
  return (
    <div className="leather col goal">
      <div className="small gold">Next goal · {title}</div>
      {steps.map((s, i) => (
        <div key={i} className={`small ${s.done ? 'green' : ''}`}>{s.done ? '✓' : '○'} {s.text}</div>
      ))}
    </div>
  );
}

function GatherList({ skill }: { skill: 'mining' | 'woodcutting' | 'fishing' }) {
  const { lv, world } = useApp();
  const train = useTrain();
  const kind = TOOL_FOR[skill];
  const tool = bestTool(world, kind, lv);
  const nodes = GATHER.filter((n) => n.skill === skill);
  const blocked = (n: (typeof nodes)[number]) => lv[skill] < n.level || !tool || tool.tier < n.tool;
  const next = nodes.find(blocked);
  return (
    <>
      <div className="desc small">
        {tool ? `Using your ${ITEMS[tool.id].name.toLowerCase()}: +${Math.round(tool.bonus * 100)}% chance of a double yield. Mature cards add more.` : 'You have no usable tool. Buy one in the general store.'}
      </div>
      {next && (
        <NextGoal
          title={next.name}
          steps={[
            { text: `${SKILL_BY_ID[skill].name} level ${next.level} (you: ${lv[skill]})`, done: lv[skill] >= next.level },
            (() => {
              const need = toolNeeded(kind, next.tool);
              return { text: `A ${need.name} or better. ${need.how}`, done: !!tool && tool.tier >= next.tool };
            })(),
          ]}
        />
      )}
      <div className="list">
        {nodes.map((n) => {
          const locked = blocked(n);
          const on = isActive(world.active, 'gather', n.id);
          const needTool = !tool || tool.tier < n.tool;
          return (
            <div key={n.id} className={`list-item ${locked ? 'locked' : ''}`}>
              <ItemIcon id={n.item} size={32} />
              <div className="name">
                <div>{n.name}</div>
                <div className="small muted">
                  {locked ? [lv[skill] < n.level ? `Level ${n.level}` : '', needTool ? `needs ${toolNeeded(kind, n.tool).name}` : ''].filter(Boolean).join(' · ') : `${n.xp} xp per card · have ${world.bank[n.item] ?? 0}`}
                </div>
                <Mastery id={n.id} />
              </div>
              <button className={`btn small ${on ? 'green' : ''}`} disabled={locked} onClick={() => train({ kind: 'gather', id: n.id })}>{on ? 'Training' : 'Train'}</button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CookList() {
  const { lv, world } = useApp();
  const train = useTrain();
  return (
    <div className="list">
      {COOKING.map((r) => {
        const locked = lv.cooking < r.level;
        const can = Math.min(...Object.entries(r.inputs).map(([id, n]) => Math.floor((world.bank[id] ?? 0) / n)));
        const on = isActive(world.active, 'cook', r.id);
        const needs = Object.entries(r.inputs).map(([id, n]) => `${n > 1 ? `${n} ` : ''}${ITEMS[id].name.toLowerCase()} (${world.bank[id] ?? 0})`).join(' + ');
        return (
          <div key={r.id} className={`list-item ${locked ? 'locked' : ''}`}>
            <ItemIcon id={r.output} size={32} />
            <div className="name">
              <div>{r.name} <span className="small muted">heals {ITEMS[r.output].heal}</span></div>
              <div className="small muted">{locked ? `Level ${r.level} · ` : `${r.xp} xp · `}{needs}</div>
              <Mastery id={r.id} />
            </div>
            <button className={`btn small ${on ? 'green' : ''}`} disabled={locked || !can} onClick={() => train({ kind: 'cook', id: r.id })}>{on ? 'Cooking' : 'Cook'}</button>
          </div>
        );
      })}
    </div>
  );
}

function FurnacePanel() {
  const app = useApp();
  const { lv, world } = app;
  const now = useClock();
  const unlocked = SMELTING.filter((r) => lv.smithing >= r.level);
  const [recipe, setRecipe] = useState(unlocked[unlocked.length - 1]?.id ?? SMELTING[0].id);
  const max = maxSmeltable(world, recipe, lv);
  const [qty, setQty] = useState(max);
  const [checking, setChecking] = useState(false);
  useEffect(() => setQty(max), [recipe, max]);
  const f = world.furnace;
  const r = SMELTING.find((x) => x.id === recipe)!;

  const light = async (tier: 0 | 1 | 2 | 3, grade: 1 | 2 | 3 | 4) => {
    setChecking(false);
    const res = await app.updateWorld((w) => {
      const done = startSmelt(w, recipe, qty, lv, tier, Date.now(), grade);
      if (done) pushLog(w, `The furnace roars: smelting ${done.total} ${r.name.toLowerCase()}s.`, 'info');
      if (done && done.note) pushLog(w, done.note, grade === 1 ? 'bad' : 'gold');
      return done;
    });
    if (res) {
      if (grade === 1) sfx.miss();
      else sfx.shield();
      const speed = tier ? ` Your ${['', 'Young', 'Mature', 'Legendary'][tier]} card stokes the fire.` : '';
      app.toast(res.note ?? `The furnace is lit.${speed}`);
    }
  };

  return (
    <div className="stone col">
      <div className="row"><Sprite name="flame" size={18} /><h2 className="grow">Furnace</h2><span className="pill small">Real time</span></div>
      {f ? (
        <>
          {(() => {
            const fr = SMELTING.find((x) => x.id === f.recipe)!;
            const next = f.start + (f.done + 1) * f.msEach - now;
            const all = f.start + f.total * f.msEach - now;
            return (
              <div className="row">
                <ItemIcon id={fr.bar} size={32} />
                <div className="grow">
                  <div>{fr.name}: {f.done}/{f.total}</div>
                  <XpBar into={f.done} span={f.total} />
                  <div className="small muted">Next in {fmtDuration(next)} · all done in {fmtDuration(all)}</div>
                </div>
              </div>
            );
          })()}
          <div className="desc small">Bars go straight to your bank, even while you study something else.</div>
        </>
      ) : (
        <>
          <div className="list">
            {SMELTING.map((x) => {
              const locked = lv.smithing < x.level;
              return (
                <button key={x.id} className={`list-item ${recipe === x.id ? 'on' : ''} ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => setRecipe(x.id)} style={{ textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
                  <ItemIcon id={x.bar} size={28} />
                  <div className="name">
                    <div>{x.name}</div>
                    <div className="small muted">
                      {locked ? `Level ${x.level} · ` : ''}{`${Object.entries(x.inputs).map(([id, n]) => `${n} ${ITEMS[id].name.toLowerCase()}`).join(' + ')} + 1 ${x.fuel ? `${ITEMS[LOG_ORDER[x.fuel]].name.toLowerCase().replace(' logs', '')} log or better` : 'log'}`}{locked ? '' : ` · ${x.xp} xp · ${x.msEach / 1000}s`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <label className="toggle">
            <span>Bars to smelt (max {max})</span>
            <input id="smelt-qty" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} style={{ width: 90 }} />
          </label>
          <button className="btn block" disabled={max < 1} onClick={() => setChecking(true)}>
            {max < 1 ? `Not enough ore or ${r.fuel ? `${ITEMS[LOG_ORDER[r.fuel]].name.toLowerCase()} (or better)` : 'logs'}` : 'Light furnace (card check)'}
          </button>
          <div className="desc small">Answer one card to light it. The card’s maturity makes smelting faster.</div>
        </>
      )}
      {checking && <CardCheck title="light the furnace" hint="Miss: one bar’s ore turns to slag. Easy: 10% faster. A Legendary card adds a bonus bar." onDone={light} onCancel={() => setChecking(false)} />}
    </div>
  );
}

function ForgeList() {
  const { lv, world } = useApp();
  const train = useTrain();
  return (
    <div className="col">
      <SectionTitle note="one card per item">Anvil</SectionTitle>
      {METALS.filter((m) => lv.smithing >= m.smith || m.tier <= 2).map((m) => (
        <div key={m.id} className="list">
          <div className="row small" style={{ marginTop: 4 }}>
            <ItemIcon id={`bar-${m.id}`} size={18} />
            <span className="gold">{m.name}</span>
            <span className="muted num">· {world.bank[`bar-${m.id}`] ?? 0} bars</span>
          </div>
          {FORGING.filter((f) => f.bar === `bar-${m.id}`).map((f) => {
            const locked = lv.smithing < f.level;
            const on = isActive(world.active, 'forge', f.id);
            const eq = ITEMS[f.output].equip;
            const tool = ITEMS[f.output].tool;
            return (
              <div key={f.id} className={`list-item ${locked ? 'locked' : ''}`}>
                <ItemIcon id={f.output} size={28} />
                <div className="name">
                  <div>{f.name}</div>
                  <div className="small muted">
                    {locked ? `Level ${f.level}` : `${f.bars} bar${f.bars > 1 ? 's' : ''} · ${f.xp} xp`}
                    {eq?.dmg ? ` · +${Math.round(eq.dmg * 100)}% dmg` : ''}
                    {eq?.dr ? ` · ${Math.round(eq.dr * 100)}% armour` : ''}
                    {tool ? ` · +${Math.round(tool.bonus * 100)}% yield` : ''}
                  </div>
                  <Mastery id={f.id} />
                </div>
                <button className={`btn small ${on ? 'green' : ''}`} disabled={locked || (world.bank[f.bar] ?? 0) < f.bars} onClick={() => train({ kind: 'forge', id: f.id })}>{on ? 'Forging' : 'Forge'}</button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FarmPanel() {
  const app = useApp();
  const { lv, world } = app;
  const now = useClock();
  const [planting, setPlanting] = useState<{ idx: number; seed: string } | null>(null);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const fertOptions = Object.keys(FERTILISER).filter((f) => world.bank[f]);
  const [fert, setFert] = useState<string>('auto');
  const fertUsed = fert === 'none' ? null : fert === 'auto' ? fertOptions.sort((a, b) => FERTILISER[b] - FERTILISER[a])[0] ?? null : fert;
  useEffect(() => {
    if (world.plots.length < plotCount(lv.farming)) void app.updateWorld((w) => syncPlots(w, lv));
  }, [lv.farming]);
  const seeds = SEEDS.filter((s) => lv.farming >= s.level && (world.bank[s.seed] ?? 0) > 0);

  const doPlant = async (tier: 0 | 1 | 2 | 3, grade: 1 | 2 | 3 | 4) => {
    const p = planting!;
    setPlanting(null);
    const ok = await app.updateWorld((w) => plant(w, p.idx, p.seed, lv, tier, Date.now(), fertUsed, grade));
    if (ok) {
      sfx.heal();
      const bonus = tier * 25 + (fertUsed ? FERTILISER[fertUsed] * 100 : 0) + (grade === 1 ? -25 : grade === 4 ? 15 : 0);
      if (grade === 1) sfx.miss();
      app.toast(`${grade === 1 ? 'Weeds crept in. ' : grade === 4 ? 'Green thumb! ' : ''}${bonus ? `Planted: ${bonus > 0 ? '+' : ''}${bonus}% harvest.` : 'Planted.'}`);
    }
  };
  const doHarvest = async (idx: number) => {
    const got = await app.updateWorld((w) => {
      const h = harvest(w, idx);
      if (h) pushLog(w, `You harvest ${h.qty} ${ITEMS[h.crop].name.toLowerCase()}.`, 'loot');
      return h;
    });
    if (got) {
      sfx.coin();
      app.toast(got.pet ? `A pet! ${ITEMS[got.pet].name} hops out of the soil.` : `+${got.qty} ${ITEMS[got.crop].name}`);
      await app.gainXp({ farming: got.xp });
    }
  };

  return (
    <div className="col">
      <div className="desc small">Your card’s maturity boosts the harvest, and so do bones from combat. More plots unlock at Farming 15, 35 and 55.</div>
      <label className="toggle">
        <span>Fertiliser: bones +50%, big bones +100%</span>
        <select id="fertiliser" value={fert} onChange={(e) => setFert(e.target.value)} style={{ width: 150 }}>
          <option value="auto">Best I have{fertOptions.length ? '' : ' (none)'}</option>
          <option value="none">Don’t use</option>
          {Object.keys(FERTILISER).map((f) => (
            <option key={f} value={f} disabled={!world.bank[f]}>{ITEMS[f].name} ({world.bank[f] ?? 0})</option>
          ))}
        </select>
      </label>
      {world.plots.map((p, idx) => {
        if (!p) {
          const sel = choice[idx] ?? seeds[0]?.id;
          return (
            <div key={idx} className="list-item col" style={{ alignItems: 'stretch' }}>
              <div className="row"><Sprite name="sprout" size={24} /><span className="grow">Plot {idx + 1}: empty</span></div>
              {seeds.length ? (
                <div className="row">
                  <select id={`plot-${idx}`} value={sel} onChange={(e) => setChoice({ ...choice, [idx]: e.target.value })} className="grow">
                    {seeds.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({world.bank[s.seed]}) · {fmtDuration(s.growMs)}</option>
                    ))}
                  </select>
                  <button className="btn small green" onClick={() => setPlanting({ idx, seed: sel! })}>Plant</button>
                </div>
              ) : (
                <div className="small muted">No seeds you can plant. Buy some in the Bank shop.</div>
              )}
            </div>
          );
        }
        const s = SEEDS.find((x) => x.id === p.seed)!;
        const ready = plotReady(p, now);
        return (
          <div key={idx} className="list-item">
            <ItemIcon id={s.crop} size={32} className={ready ? 'bob' : ''} />
            <div className="name">
              <div>Plot {idx + 1}: {s.name}</div>
              <XpBar into={Math.min(p.growMs, now - p.planted)} span={p.growMs} />
              <div className="small muted">{ready ? 'Ready to harvest' : `Ready in ${fmtDuration(p.planted + p.growMs - now)}`}</div>
            </div>
            <button className="btn small green" disabled={!ready} onClick={() => doHarvest(idx)}>Harvest</button>
          </div>
        );
      })}
      {planting && <CardCheck title="plant the seed" hint="Miss: weeds (−25% harvest). Easy: green thumb (+15%)." onDone={doPlant} onCancel={() => setPlanting(null)} />}
    </div>
  );
}

function CombatAreas() {
  const app = useApp();
  const { lv, world } = app;
  const train = useTrain();
  const cl = combatLevel(lv);
  const setStyle = (style: CombatStyle) => void app.updateWorld((w) => void (w.style = style));
  return (
    <>
      <div className="stone col how-combat">
        <h3>How combat works</h3>
        <ol className="small">
          <li><b>Answer</b> a flashcard for energy: Hard 1, Good 2, Easy 3. A mature card adds 1. Again gives none.</li>
          <li><b>Play</b> ability cards from your hand. Your weapon, armour, trinkets, food and techniques make up your deck.</li>
          <li><b>End turn.</b> The enemy does what its badge says. Block the big hits, stun wind-ups, and read its traits.</li>
        </ol>
        <div className="grid2">
          <button className="btn small stone" onClick={() => app.go({ name: 'gear' })}>Edit deck in Gear</button>
          <div className="grid3" style={{ gap: 4 }}>
            {(['attack', 'strength', 'defence'] as CombatStyle[]).map((st) => (
              <button key={st} className={`btn small ${world.style === st ? 'green' : 'stone'}`} onClick={() => setStyle(st)} aria-label={`Train ${SKILL_BY_ID[st].name}`}><Sprite name={SKILL_BY_ID[st].icon} size={14} /></button>
            ))}
          </div>
        </div>
        <div className="small muted">Damage trains {SKILL_BY_ID[world.style].name} and Hitpoints. Blocking trains Defence.</div>
      </div>
      <SectionTitle note={`combat level ${cl}`}>Areas</SectionTitle>
      <div className="list">
        {AREAS.map((a) => {
          const reason = areaLocked(world, a, cl);
          const locked = !!reason;
          const on = isActive(world.active, 'combat', a.id);
          return (
            <div key={a.id} className={`list-item ${locked ? 'locked' : ''}`}>
              <Sprite name={a.boss.sprite} size={36} />
              <div className="name">
                <div>{a.name}</div>
                <div className="small muted">{locked ? `${reason}${a.key && !world.bank[a.key] ? ` (dropped by ${AREAS[AREAS.indexOf(a) - 1].boss.name.split(',')[0]})` : ''}` : `${a.flavor} Boss after ${a.bossAfter} kills (${world.bossProgress[a.id] ?? 0}).`}</div>
                <div className="trait-line">{[...new Set([...a.monsters, a.boss].flatMap((m) => m.traits ?? []))].map((t) => <span key={t} className="pill trait small">{TRAIT_INFO[t].name}</span>)}</div>
              </div>
              <button className={`btn small ${on ? 'green' : 'red'}`} disabled={locked} onClick={() => train({ kind: 'combat', id: a.id })}>{on ? 'Fighting' : 'Fight'}</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
