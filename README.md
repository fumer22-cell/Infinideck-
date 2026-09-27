# Grimrecall

A spaced-repetition flashcard app disguised as a dark-fantasy dungeon crawler.
Today's due cards are today's dungeon. Remember, or perish.

- **Installable PWA**: works offline, add to home screen, portrait and thumb-first.
- **Real FSRS scheduling** via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs), the same algorithm modern Anki uses.
- **No backend, no accounts.** Everything lives in IndexedDB (Dexie). Export or restore a full JSON save from Settings.

## The one rule

The game **never** changes scheduling and **never** pulls cards early.

- All scheduling goes through `src/core/srs.ts`. `reviewCard()` refuses to grade a card that isn't due.
- A dungeon run only draws from `getDueQueue()`: learning cards whose step has elapsed, review cards due today (Anki-style day boundary, default 4am), and new cards up to the daily limit.
- If only unfinished learning steps remain, the run pauses on a *Catch your breath* screen until they're due. It doesn't show them early.
- Endless mode uses Mature+ cards and never calls the scheduler. Grades there only fuel combat.
- Card effects, tiers and leech clearing are stored in separate game fields (`effect`, `tierSeen`, `leechBase`) and never touch FSRS state.

## Playing

1. **Decks → Create**, add cards (front, back, optional image), or **Import** an Anki `.apkg` / CSV / TSV.
2. **Enter the Dungeon** and pick a class: Warrior (+30% damage), Cleric (+60% heals and wards) or Rogue (faster combo).
3. Tap one of the three cards in your hand, read the front, tap to reveal, then grade **Again / Hard / Good / Easy**. The grade goes to FSRS exactly as in Anki. The buttons show the next intervals.
   - Easy = critical hit, Good = normal, Hard = weak, Again = miss plus a free enemy hit.
   - Correct answers in a row build the combo multiplier. Again resets it.
   - Optional speed bonus (Settings): +25% if revealed within 6s. Never applied to new cards.
4. Every 5 fights you reach a rest stop (heal or visit the merchant). When 8 or fewer due cards remain, the boss appears. Bosses force your due **leech** cards (4+ lapses) into your hand, and beating the boss clears their leech status.
5. Clear the queue to bank your gold and earn the daily **streak chest**.

### Card power

Every card rolls an effect when it's created: Strike, Mend, Ward, Venom or Insight (draw). Power scales with FSRS maturity:

| Tier | Interval | Power | Effects |
|---|---|---|---|
| Novice | new / learning | 3 | common |
| Young | < 21 days | 5 | common |
| Mature | 21+ days | 8 | + rare: Twin Fang, Leech Blade, Cleave |
| Legendary | 90+ days | 12 | + epic: Starfall, Phoenix Rite, Soulrend, Plague |

When a card reaches a new tier, you choose 1 of 3 new effects for it.

### Progression

- **Skills 1–99** on the classic exponential MMO XP curve: Attack, Defence, Hitpoints, Scholarship (XP from reviews).
- **Relics** from shops and bosses (e.g. *Twin Sigil*: first card each fight triggers twice; *Feather of Ease*: heal 1 on every Easy).
- **Armoury**: permanent upgrades bought with banked gold, plus milestone rewards at 50 / 100 / 500 / 1000 mature cards.
- **Endless Depths** when nothing is due.

## Anki import

`.apkg` (and `.colpkg`) files are unzipped with JSZip and read with sql.js:

- `collection.anki2`, `collection.anki21`, and the newer zstd-compressed `collection.anki21b` (decompressed with fzstd). Anki's newer schema (`notetypes`, `fields`, `templates` with protobuf configs, `decks` table) is supported.
- Card faces are rendered from the note type's templates (`{{Field}}`, `{{FrontSide}}`, conditionals, `cloze:`), so reversed and cloze cards come out right.
- Image media is imported, including the zstd/protobuf media manifest used by newer exports. Audio is skipped.
- Review history (`revlog`) is replayed through FSRS to derive stability and difficulty. If Anki already stored FSRS memory state in `cards.data`, that is used instead. **Anki's due dates are kept**, so importing reschedules nothing.
- HTML is sanitized to a small whitelist of formatting tags. Scripts, styles, event handlers and remote URLs are stripped.
- Re-importing the same package skips cards that already exist.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: FSRS integration, Anki import, combat/run rules, backup
npm run build      # typecheck + production build with service worker → dist/
npm run preview
```

Deploy `dist/` to any static host. It must be served over HTTPS for install and offline support.

`scripts/gen-icons.mjs` regenerates the PWA icons, which are drawn from a pixel grid with no dependencies.

### Layout

```
src/core/     db (Dexie), srs (FSRS wrapper + due queue), profile, settings, backup
src/game/     effects, combat (pure), enemies, relics, skills, classes, meta, run state
src/import/   apkg, template renderer, protobuf reader, csv, html sanitizer
src/art/      original pixel sprites (character grids) + procedural dungeon backdrops
src/ui/       React screens, combat arena, 8-bit WebAudio sfx
tests/        vitest suites
```

All art is original: sprites are hand-authored character grids rendered to canvas, and backgrounds (crypt, bog, ruined keep) are drawn procedurally. Fonts are Silkscreen and Crimson Pro (SIL Open Font License), bundled via Fontsource so they work offline. Sound effects are synthesized with WebAudio.
