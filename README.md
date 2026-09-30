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
- Leech clearing lives in a separate game field (`leechBase`) and never touches FSRS state. Combat reads a card's maturity but never changes it.

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
| Combat | Attack, Strength, Defence, Hitpoints | A deckbuilding fight in four areas, each with a boss after 10 kills. Your combat style decides which skill trains. |
| Knowledge | Scholarship | Every scheduled review, in any skill. |

All skills use the classic exponential XP table up to 99.

### How the skills feed each other

Levels alone don't open the next tier. You also need the right tool, fuel or key, made with other skills:

- **Mining** tiers need a better pickaxe: coal needs iron, mithril needs steel, and so on. Pickaxes are forged at the anvil from bars you smelt from the ore you mine.
- **Woodcutting** works the same way with hatchets: willow needs iron, maple needs steel, and so on.
- **Fishing**: trout and salmon need a fly rod, which costs 5 willow logs at the store. Lobster and up need a harpoon, forged from 3 steel bars.
- **Smelting** better bars needs hotter fuel: steel burns oak logs or better, mithril willow, adamant maple, rune yew.
- **Cooking**: dishes combine fish with crops from your farm, and heal far more than plain fish.
- **Farming**: bones from combat fertilise crops (+50%, big bones +100%).
- **Combat areas** each need a key dropped by the previous area's boss. Bosses also drop the ore for your next metal tier.

Each gathering skill page shows your **next goal** and every step it needs.

### Combat

Flashcards power the fight; **ability cards** are what you play. Each turn:

1. **Answer** a flashcard for energy: Hard 1, Good 2, Easy 3, and a mature card (21+ day interval) adds 1. Again gives none. Unspent energy carries over, up to 6.
2. **Play** ability cards from a hand of 4.
3. **End turn**: the enemy does what its intent badge says, then you draw a new hand.

Your deck is your loadout. Swords give Slash, Lunge and Parry. Daggers give cheap multi-hits and poison, and battleaxes give Cleave (ignores block) and Sunder. Armour adds Shield Bash (stun), Steady and Bulwark. Each trinket adds one unique card (Starfall, Soulrend, Phoenix Rite...), and packed food adds Eat cards that use up the food. Attack, Strength, Defence and Hitpoints levels teach techniques like Focus, War Cry and Overpower. In the Gear tab you can switch cards out, so a thinner deck draws your best cards more often. Better metal raises **Power**, which is the damage of your attack cards, and armour and Defence raise **Guard**, which is the block of your block cards. Masterwork gear gives upgraded (+) cards.

Enemies telegraph their next move: attack, a flurry of hits, block, empower, venom, or a **wind-up** before a heavy blow. Stun a wind-up and the blow never lands. Traits give each enemy its own puzzle:
- Armoured enemies gain block every turn.
- Enraged enemies grow stronger each time you answer Again.
- Regenerating enemies heal every turn.
- Venomous enemies poison you.

Bosses switch tactics below half health.

Bosses drag your due **leech** cards (4+ lapses) up first, and beating the boss clears their leech status. Dying ends the trip, costs 10% of your gold and wakes you at half HP. Out of combat, HP regenerates in real time.

- **Bank** and **general store**: sell anything; buy seeds, bread, rods and starter tools.
- **Gear**: six equipment slots, packed food, your combat style and the combat deck builder.
- **Quests**: story quests built from problem sets (see below).
- **Journey**: total and combat level, the daily **streak chest** for clearing your queue, and milestone rewards at 50 / 100 / 500 / 1000 mature cards.

## Quests

Quests are separate from your flashcards. They're stories told through problems, and each chapter's problem moves the plot forward. Answers are checked the way chemistry homework systems check them:
- An answer is right within one unit in the last place, so slightly different molar-mass tables still pass.
- If the value is right but the rounding isn't, you're told to fix the rounding, and it doesn't count as a miss.
- Common slips (a forgotten mole ratio, the wrong limiting reagent) get an in-character nudge.

Each miss reveals a hint. After three misses you're shown the worked solution. A chapter solved with no misses and no hints earns a star.

- **Rewards**: gold, resources, Scholarship xp, **quest points**, an **Alembic of Insight** (750 xp poured into the skill of your choice from the Bank), and **spells**. Spells are combat cards that join your deck. A flawless quest (every chapter starred) upgrades its spells to their + versions.
- **Practice runs**: once a quest is done, replay every chapter with freshly rolled numbers. It's the same reasoning with new sums, for a little gold and xp.

**The Vitriol Blight** (chemistry: stoichiometry). Mireille Ashgrove, Thornwick's hedge-alchemist, needs help:
1. Brew ammonium phosphate fertiliser from spirit of hartshorn (grams to grams via a mole ratio).
2. Survive a sealed mine by finding which runs out first, the lamp oil or the air (limiting reagent and leftover mass).
3. Burn aluminium into a corundum lens (limiting reagent in moles).
4. Brew an antidote (conservation of mass and percent yield).
5. Neutralise the Ashen Cult's vat of vitriol (theoretical yield with a limiting reagent).

It teaches the **Antidote** and **Vitriol Flask** spells.

New quests go in `src/game/quests/`: one file per quest, registered in `index.ts`.

## Rewards and penalties

The game reacts to how you answered, never to when a card is due. Scheduling stays with FSRS.

- **Again is a miss**: no skill xp and no resource, though Scholarship xp still counts. Cooking burns the food, smithing cracks a bar, a lit furnace loses a bar to slag, and a planted patch gets weeds. Mastery 50 on a recipe makes it safe from burning and cracking.
- **Streaks**: each right answer in a row adds +5% xp, up to +50%. Hard still counts as right. Milestones at 10, 25, 50 and 100 give hot streaks of double yields, rare finds and gold.
- **Easy** gives +20% xp and better rare odds. Fishing gets bigger catches, cooking can make perfect dishes, and smithing can forge masterworks.
- **Skill streaks**: woodcutting fells the tree on every 5th right answer in a row, and mining gets deeper veins the longer you stay on one rock.
- **Bonuses**: extra xp for rescuing a leech, a discovery (a new card) or a second wind (a relearning card). You also get Rested xp after time away, and a Focused bonus at 90% or better recent accuracy.
- **Mastery**: each node and recipe levels up the more you use it.
- **Collection log**: legendaries, pets, gems and relics.
- **Type your answers** (a per-deck toggle): a correct typed answer is *verified* and gives +25% xp and better rare odds.

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
src/game/     skills, items, activities (rocks, trees, recipes, seeds, areas), world (bank, gear, furnace, plots, trips), abilities (cards, loadout decks), combat (pure turn engine), enemies (intents, traits), relics
src/import/   apkg, template renderer, protobuf reader, csv, html sanitizer
src/art/      original pixel sprites (character grids) + procedural dungeon backdrops
src/ui/       tabs (Study, Skills, Bank, Gear, Journey), deck screens, combat view, 8-bit WebAudio sfx
tests/        vitest suites
```

All art is original: sprites are hand-authored character grids rendered to canvas, and backgrounds (crypt, bog, ruined keep) are drawn procedurally. Fonts are Silkscreen and Crimson Pro (SIL Open Font License), bundled via Fontsource so they work offline. Sound effects are synthesized with WebAudio.
