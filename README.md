# Grimrecall

A spaced-repetition flashcard app disguised as an old-school skilling MMO.
Pick a skill, then study: every card you answer mines, chops, fishes, cooks, forges or fights.

- **Installable PWA**: works offline, add to home screen, portrait and thumb-first.
- **Real FSRS scheduling** via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs), the same algorithm modern Anki uses.
- **No backend, no accounts.** Everything lives in IndexedDB (Dexie). Export or restore a full JSON save from Settings.

## The one rule

The game **never** changes scheduling and **never** pulls cards early.

- All scheduling goes through `src/core/srs.ts`. `reviewCard()` refuses to grade a card that isn't due.
- Studying only draws from `getDueQueue()`: learning cards whose step has elapsed, review cards due today (Anki-style day boundary, default 4am), and new cards up to the daily limit.
- When nothing is due you can keep training with **practice** cards (Mature cards first). Practice is never recorded, gives half xp and no Scholarship.
- Grades don't change what a skilling action yields, so there's no reason to grade dishonestly. The card's **maturity** is what pays: Young, Mature and Legendary cards give a 10%, 25% or 50% chance of a double yield, speed up the furnace and boost harvests.
- Card effects, tiers and leech clearing live in separate game fields (`effect`, `tierSeen`, `leechBase`) and never touch FSRS state.

## Playing

1. **Journey → Decks**: create cards, or **Import** an Anki `.apkg` / CSV / TSV.
2. **Skills**: choose one activity, such as the copper rock. Only one runs at a time.
3. **Study**: answer cards. Each graded card performs one action of that activity.

### Skills

| Group | Skill | How it works |
|---|---|---|
| Gathering | Mining, Woodcutting, Fishing | One card = one ore, log or fish, plus rare finds (gems, bird's nests, caskets). Better tools add double-yield chance. |
| Gathering | Farming | Plant with a **card check**, then crops grow in real time. Harvest when ready. More plots at 15, 35 and 55. |
| Artisan | Smithing | **Furnace**: start a batch with a card check; bars smelt in real time (1 log of fuel each). **Anvil**: one card forges one sword, helm, shield, platebody, pickaxe or hatchet. |
| Artisan | Cooking | One card cooks one fish. Cooked food heals in combat. |
| Combat | Attack, Strength, Defence, Hitpoints | Card combat in four areas, each with a boss after 10–12 kills. Your combat style decides which skill trains. |
| Knowledge | Scholarship | Every scheduled review, in any skill. |

All skills use the classic exponential XP table up to 99.

### Combat

Tap one of three cards in your hand, reveal, and grade. Easy = critical hit, Good = normal, Hard = weak, Again = miss plus a free enemy hit. Correct answers build a combo. Every card has an effect (Strike, Mend, Ward, Venom, Insight...) whose power grows with FSRS maturity, and you choose a new effect when a card reaches a new tier. Enemies show their next intent.

Gear from the anvil boosts damage and cuts damage taken. Relics from bosses become rings and amulets. Food is eaten automatically below a third of your HP. Bosses drag your due **leech** cards (4+ lapses) into your hand, and beating one clears their leech status. Dying ends the trip, costs 10% of your gold and wakes you at half HP. Out of combat, HP regenerates in real time.

### Progression

- **Bank** and **general store**: sell anything; buy seeds, bread, rods and starter tools.
- **Gear**: six equipment slots, a food slot and your combat style.
- **Journey**: total and combat level, the daily **streak chest** for clearing your queue, and milestone rewards at 50 / 100 / 500 / 1000 mature cards.

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
npm test           # vitest: FSRS integration, Anki import, skilling/combat rules, cloud save, backup
npm run build      # typecheck + production build with service worker → dist/
npm run preview
```

`npm run build:artifact` makes a version that runs inside a claude.ai artifact (`dist-artifact/grimrecall.html` plus `assets/`). It uses relative paths, inlines the fonts and has no service worker. Backups there go through copy and paste, because the artifact frame blocks downloads. In that build, `src/core/cloud.ts` saves your data to your Claude account through the artifact `db` capability. It lives in your private `data/users/<id>/` folder as gzipped chunks plus one document per image, so the same cards follow you to any device where you open the artifact signed in.

Deploy `dist/` to any static host. It must be served over HTTPS for install and offline support.

`scripts/gen-icons.mjs` regenerates the PWA icons, which are drawn from a pixel grid with no dependencies.

### Layout

```
src/core/     db (Dexie), srs (FSRS wrapper + due queue), profile, settings, backup
src/game/     skills, items, activities (rocks, trees, recipes, seeds, areas), world (bank, gear, furnace, plots, trips), combat (pure), effects, relics
src/import/   apkg, template renderer, protobuf reader, csv, html sanitizer
src/art/      original pixel sprites (character grids) + procedural dungeon backdrops
src/ui/       tabs (Study, Skills, Bank, Gear, Journey), deck screens, combat view, 8-bit WebAudio sfx
tests/        vitest suites
```

All art is original: sprites are hand-authored character grids rendered to canvas, and backgrounds (crypt, bog, ruined keep) are drawn procedurally. Fonts are Silkscreen and Crimson Pro (SIL Open Font License), bundled via Fontsource so they work offline. Sound effects are synthesized with WebAudio.
