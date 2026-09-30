/**
 * Quest 1: The Vitriol Blight (stoichiometry).
 * Thornwick's fields are dying and its river runs yellow. The hedge-alchemist
 * Mireille Ashgrove needs your arithmetic to feed the fields, survive a sealed
 * mine, forge a sapphire lens, brew an antidote and quench the vat of vitriol
 * the Ashen Cult left in the spring.
 */
import { randInt, type Rng } from '../rng';
import type { Quest } from './types';

/** Molar masses (g/mol) from standard atomic weights. */
export const MM = {
  NH3: 17.031,
  AP: 149.087, // (NH4)3PO4
  C6H14: 86.178,
  O2: 31.998,
  H2SO4: 98.072,
  NaOH: 39.997,
  H2O: 18.015,
};

const f = (x: number, d: number) => x.toFixed(d);
/** a random number with d decimals between lo and hi */
const pickNum = (rng: Rng, lo: number, hi: number, d: number) => Number((lo + rng() * (hi - lo)).toFixed(d));

// ---- the chemistry, shared by answers, hints and worked solutions ----
const ap = (v: Record<string, number>) => (v.nh3 / MM.NH3 / 3) * MM.AP;
const hexMol = (v: Record<string, number>) => v.hex / MM.C6H14;
const o2Mol = (v: Record<string, number>) => v.o2 / MM.O2;
/** hexane runs out first when the oxygen could burn more than we have */
const hexLimits = (v: Record<string, number>) => o2Mol(v) / 9.5 >= hexMol(v);
const hexLeft = (v: Record<string, number>) => (hexLimits(v) ? 0 : v.hex - (o2Mol(v) / 9.5) * MM.C6H14);
const corundum = (v: Record<string, number>) => Math.min(v.al / 4, v.ox / 3) * 2;
const antidote = (v: Record<string, number>) => v.a0 + (v.b0 - v.b1);
const acidMol = (v: Record<string, number>) => v.acid / MM.H2SO4;
const lyeMol = (v: Record<string, number>) => v.lye / MM.NaOH;
const water = (v: Record<string, number>) => Math.min(acidMol(v), lyeMol(v) / 2) * 2 * MM.H2O;

export const VITRIOL: Quest = {
  id: 'vitriol',
  title: 'The Vitriol Blight',
  subject: 'Chemistry · stoichiometry',
  giver: { name: 'Mireille', sprite: 'alchemist', title: 'Mireille Ashgrove, hedge-alchemist of Thornwick' },
  blurb: 'Thornwick’s wheat has gone grey and its river runs yellow. The village alchemist needs someone who can do the sums.',
  chapters: [
    {
      id: 'hartshorn',
      title: 'Spirit of Hartshorn',
      vars: { nh3: 9.03 },
      echo: (rng) => ({ nh3: pickNum(rng, 4, 19.9, 2) }),
      story: (v) => [
        { kind: 'p', text: 'The fields around Thornwick have gone the colour of ash. Wheat snaps like old bone, and the river smells of rotten eggs and pennies. At the ford a woman in a patched green robe waves you over. Her fingers are stained black to the knuckle.' },
        { kind: 'say', text: 'Mireille Ashgrove. I keep the stillroom. Whatever is poisoning the river, we’ll hunt it. But if these fields aren’t fed, Thornwick starves before the first frost.' },
        { kind: 'say', text: 'My grandmother’s fertiliser: spirit of hartshorn, which is ammonia (NH₃), bubbled through phosphoric acid (H₃PO₄). The two join into ammonium phosphate, (NH₄)₃PO₄.' },
        { kind: 'say', text: `I’ve distilled ${f(v.nh3, 2)} g of hartshorn, and there’s acid to spare. Before I start the still, tell me: how much fertiliser will I get?` },
      ],
      parts: [
        {
          kind: 'number',
          label: (v) => `Mass of ammonium phosphate made from ${f(v.nh3, 2)} g of ammonia (3 significant figures)`,
          unit: 'g',
          round: { sig: 3 },
          answer: ap,
          traps: (v) => [
            { value: (v.nh3 / MM.NH3) * MM.AP, msg: 'That’s three times what the hartshorn allows. How many NH₃ go into each (NH₄)₃PO₄?' },
            { value: ((v.nh3 * 3) / MM.NH3) * MM.AP, msg: 'You multiplied by the 3 when you should divide: it takes three ammonias to make one phosphate.' },
          ],
        },
      ],
      hints: () => [
        'Balance it first: H₃PO₄ + 3 NH₃ → (NH₄)₃PO₄.',
        'Turn grams of ammonia into moles. NH₃ is 17.03 g/mol.',
        'Three moles of NH₃ make one mole of (NH₄)₃PO₄, so divide by 3. Then multiply by 149.09 g/mol.',
      ],
      solution: (v) => [
        'H₃PO₄ + 3 NH₃ → (NH₄)₃PO₄',
        `${f(v.nh3, 2)} g ÷ 17.03 g/mol = ${f(v.nh3 / MM.NH3, 4)} mol NH₃`,
        `${f(v.nh3 / MM.NH3, 4)} mol ÷ 3 = ${f(v.nh3 / MM.NH3 / 3, 4)} mol (NH₄)₃PO₄`,
        `${f(v.nh3 / MM.NH3 / 3, 4)} mol × 149.09 g/mol = ${f(ap(v), 2)} g`,
      ],
      outcome: [
        { kind: 'p', text: 'The still hisses through the night. At dawn you rake the pale powder into the east field. By dusk, green needles are pushing up through the grey.' },
        { kind: 'say', text: 'Now I believe in you. Keep the rest of the batch for your own plots. Tomorrow, the river.' },
      ],
      reward: { gold: 40, items: { 'fert-phosphate': 6 }, xp: { scholarship: 150 } },
    },
    {
      id: 'adit',
      title: 'The Sealed Adit',
      vars: { hex: 2.6, o2: 13.9 },
      echo: (rng) => ({ hex: pickNum(rng, 1.5, 5.0, 1), o2: pickNum(rng, 6, 19.9, 1) }),
      story: (v) => [
        { kind: 'p', text: 'You follow the yellow water upstream to where it spills from the hillside: an old mine adit, sealed with a slab of stone. Mireille levers it open. Behind it is still, dead air and black dark.' },
        { kind: 'say', text: `No wind has moved in there for a century. By my reckoning that chamber holds ${f(v.o2, 1)} g of oxygen, and no more.` },
        { kind: 'say', text: `I’m filling the lamp with ${f(v.hex, 1)} g of rock-oil, which is hexane, CH₃(CH₂)₄CH₃. It burns in oxygen to carbon dioxide and water. If the air gives out before the oil does, the flame dies and we’re blind in there with the fumes.` },
        { kind: 'eq', text: 'C₆H₁₄ + O₂ → CO₂ + H₂O  (balance me)' },
      ],
      parts: [
        { kind: 'choice', label: () => 'Which runs out first?', options: ['The rock-oil (hexane)', 'The air (oxygen)'], answer: (v) => (hexLimits(v) ? 0 : 1), wrongMsg: 'Compare moles, not grams, and mind the ratio in the balanced equation.' },
        {
          kind: 'number',
          label: () => 'The least hexane that could be left when the flame goes out',
          unit: 'g',
          round: { dp: 1 },
          answer: hexLeft,
          traps: (v) => (hexLimits(v) ? [{ value: (o2Mol(v) / 9.5) * MM.C6H14, msg: 'That’s how much oil the air could burn. But how much did I pour into the lamp?' }] : [{ value: v.hex, msg: 'Some of it burns before the air gives out.' }]),
        },
      ],
      hints: () => [
        'Balanced: 2 C₆H₁₄ + 19 O₂ → 12 CO₂ + 14 H₂O. Each mole of hexane needs 9.5 moles of O₂.',
        'Moles of each: hexane is 86.18 g/mol, O₂ is 32.00 g/mol.',
        'Work out how much O₂ all the hexane would need. If there’s more O₂ than that, the hexane runs out first and none is left.',
      ],
      solution: (v) => [
        '2 C₆H₁₄ + 19 O₂ → 12 CO₂ + 14 H₂O',
        `Hexane: ${f(v.hex, 1)} g ÷ 86.18 = ${f(hexMol(v), 4)} mol. It needs ${f(hexMol(v) * 9.5, 4)} mol O₂.`,
        `Oxygen: ${f(v.o2, 1)} g ÷ 32.00 = ${f(o2Mol(v), 4)} mol available.`,
        hexLimits(v)
          ? 'There’s more O₂ than the hexane needs, so all the hexane burns: 0.0 g left.'
          : `Oxygen runs out first. It burns ${f((o2Mol(v) / 9.5) * MM.C6H14, 2)} g of hexane, leaving ${f(hexLeft(v), 2)} g.`,
      ],
      outcome: [
        { kind: 'say', text: 'None left. The oil burns out long before the air does, so we’ll be breathing. Walk fast.' },
        { kind: 'p', text: 'The lamp gutters out just as you reach the far chamber, and the air there is still sweet. In its last flicker you see heaps of silvery aluminium shavings, a seam of good iron, and beside them a cracked vat weeping yellow into the spring.' },
      ],
      reward: { gold: 50, items: { 'ore-iron': 10, 'ore-coal': 8 }, xp: { scholarship: 150 } },
    },
    {
      id: 'sapphire',
      title: 'The Sapphire Eye',
      vars: { al: 1.0, ox: 11.0 },
      echo: (rng) => ({ al: pickNum(rng, 0.5, 6, 1), ox: pickNum(rng, 0.5, 12, 1) }),
      story: (v) => [
        { kind: 'p', text: 'Fumes curl off the vat so thick you can barely see your own hands. Something is carved into its side, but the murk hides it.' },
        { kind: 'say', text: 'Corundum sees through anything. Burn aluminium in pure oxygen and you get aluminium oxide, Al₂O₃. That’s what a sapphire is, underneath the colour. I’ll grind us a lens.' },
        { kind: 'say', text: `I’ve swept up ${f(v.al, 1)} mol of aluminium, and my bladder holds ${f(v.ox, 1)} mol of oxygen. Before I light it: what’s the most corundum we can make?` },
        { kind: 'eq', text: 'Al + O₂ → Al₂O₃  (balance me)' },
      ],
      parts: [
        {
          kind: 'number',
          label: () => 'The largest amount of Al₂O₃ that could be produced (nearest 0.1 mol)',
          unit: 'mol',
          round: { dp: 1 },
          answer: corundum,
          traps: (v) => [
            { value: (v.ox / 3) * 2, msg: 'That would take far more aluminium than we have. Which runs out first?' },
            { value: v.al, msg: 'Each Al₂O₃ holds two aluminium atoms.' },
          ],
        },
      ],
      hints: () => [
        'Balanced: 4 Al + 3 O₂ → 2 Al₂O₃.',
        'Work out how much Al₂O₃ each reactant could make on its own. Aluminium: mol × 2/4. Oxygen: mol × 2/3.',
        'The smaller of the two is the most you can make. That reactant is the limiting one.',
      ],
      solution: (v) => [
        '4 Al + 3 O₂ → 2 Al₂O₃',
        `From aluminium: ${f(v.al, 1)} × 2/4 = ${f((v.al / 4) * 2, 2)} mol`,
        `From oxygen: ${f(v.ox, 1)} × 2/3 = ${f((v.ox / 3) * 2, 2)} mol`,
        `The smaller one wins: ${f(corundum(v), 1)} mol Al₂O₃`,
      ],
      outcome: [
        { kind: 'p', text: 'The shavings flare white, too bright to look at. When the glare fades, a bead of clear blue glass sits cooling in the crucible. Mireille polishes it on her sleeve and holds it to your eye.' },
        { kind: 'p', text: 'The murk falls away. On the vat, plain as day, is a burnt hand inside a ring: the sigil of the Ashen Cult. The drip is oil of vitriol, feeding the spring.' },
        { kind: 'say', text: 'Keep the spare stone. You’ll want to see clearly where we’re going.' },
      ],
      reward: { gold: 60, items: { 'gem-sapphire': 1 }, xp: { scholarship: 150 } },
    },
    {
      id: 'antidote',
      title: 'Mireille’s Antidote',
      vars: { a0: 1.0, b0: 2.0, b1: 1.1, pct: 73 },
      echo: (rng) => {
        const a0 = pickNum(rng, 0.5, 3, 1);
        const b0 = pickNum(rng, 1.5, 4, 1);
        const b1 = pickNum(rng, 0.2, b0 - 0.3, 1);
        return { a0, b0, b1, pct: randInt(55, 95, rng) };
      },
      story: (v) => [
        { kind: 'p', text: 'You come back to Thornwick to find the miller’s children in their beds, grey-lipped and feverish. They drank from the river.' },
        { kind: 'say', text: 'Wolfsbane salt and moon-silver. They combine into one thing and nothing else: the antidote. I weighed everything before and after, the way my mother taught me.' },
        { kind: 'table', head: ['Reagent', 'Before', 'After'], rows: [['Wolfsbane salt (A)', `${f(v.a0, 1)} g`, '0 g'], ['Moon-silver (B)', `${f(v.b0, 1)} g`, `${f(v.b1, 1)} g`]] },
        { kind: 'say', text: `Some of it always clings to the flask, though. I only ever get back about ${v.pct}% of what the reaction makes.` },
      ],
      parts: [
        {
          kind: 'number',
          label: () => 'Theoretical yield of antidote (C), nearest 0.1 g',
          unit: 'g',
          round: { dp: 1 },
          answer: antidote,
          traps: (v) => [
            { value: v.a0 + v.b0, msg: 'Not all the moon-silver reacted. Some of it is still in the bowl.' },
            { value: v.a0 + v.b1, msg: `The ${f(v.b1, 1)} g is what’s left over, not what reacted.` },
          ],
        },
        {
          kind: 'number',
          label: (v) => `Antidote actually recovered at ${v.pct}% yield, nearest 0.1 g`,
          unit: 'g',
          round: { dp: 1 },
          answer: (v) => (antidote(v) * v.pct) / 100,
          traps: (v) => [{ value: antidote(v) / (v.pct / 100), msg: 'You can never recover more than the reaction makes. Multiply by the yield, don’t divide.' }],
        },
      ],
      hints: (v) => [
        'Mass is never lost. The antidote weighs exactly what the reagents that reacted weighed.',
        `All of A reacted (${f(v.a0, 1)} g). B only lost ${f(v.b0, 1)} − ${f(v.b1, 1)} g.`,
        `Actual yield = theoretical yield × ${v.pct}/100.`,
      ],
      solution: (v) => [
        `A used: ${f(v.a0, 1)} g. B used: ${f(v.b0, 1)} − ${f(v.b1, 1)} = ${f(v.b0 - v.b1, 1)} g`,
        `Theoretical C = ${f(v.a0, 1)} + ${f(v.b0 - v.b1, 1)} = ${f(antidote(v), 1)} g`,
        `Actual C = ${f(antidote(v), 1)} × ${v.pct}/100 = ${f((antidote(v) * v.pct) / 100, 2)} g, so ${f((antidote(v) * v.pct) / 100, 1)} g`,
      ],
      outcome: [
        { kind: 'p', text: 'It’s just enough for every child, a spoonful each. By morning the fevers have broken and the miller is weeping into his flour.' },
        { kind: 'say', text: 'You measure like an alchemist. Here, I’ll write the recipe into your spellbook. You’ll be walking into poison soon enough.' },
      ],
      reward: { gold: 40, spells: ['antidote'], xp: { scholarship: 150 } },
    },
    {
      id: 'quench',
      title: 'Quenching the Vitriol',
      vars: { acid: 71.6, lye: 87.0 },
      echo: (rng) => ({ acid: pickNum(rng, 30, 120, 1), lye: pickNum(rng, 30, 120, 1) }),
      story: (v) => [
        { kind: 'p', text: 'You carry sacks of lye back through the adit, the sapphire lens hung at your throat. The vat hisses as you come near.' },
        { kind: 'say', text: `By the lens there’s ${f(v.acid, 1)} g of oil of vitriol, sulfuric acid (H₂SO₄), left in the vat. I brought ${f(v.lye, 1)} g of lye, sodium hydroxide (NaOH). They quench each other into sodium sulfate, Na₂SO₄, and plain water.` },
        { kind: 'say', text: 'That water runs straight into the spring, and I want to know how much clean water we’re giving back to Thornwick.' },
        { kind: 'eq', text: 'H₂SO₄ + NaOH → Na₂SO₄ + H₂O  (balance me)' },
      ],
      parts: [
        {
          kind: 'number',
          label: () => 'Theoretical yield of water (3 significant figures)',
          unit: 'g',
          round: { sig: 3 },
          answer: water,
          traps: (v) => [
            { value: lyeMol(v) * MM.H2O, msg: 'That’s what the lye could make, but which reagent runs out first?' },
            { value: acidMol(v) * MM.H2O, msg: 'Each molecule of acid gives up two waters. Check the balanced equation.' },
            { value: v.acid + v.lye, msg: 'Most of that mass becomes sodium sulfate, not water.' },
          ],
        },
      ],
      hints: () => [
        'Balanced: H₂SO₄ + 2 NaOH → Na₂SO₄ + 2 H₂O.',
        'Moles of each: H₂SO₄ is 98.08 g/mol, NaOH is 40.00 g/mol. Every mole of acid needs 2 moles of NaOH.',
        'Find the limiting reagent. Each mole of H₂SO₄ that reacts makes 2 moles of water (18.02 g/mol).',
      ],
      solution: (v) => [
        'H₂SO₄ + 2 NaOH → Na₂SO₄ + 2 H₂O',
        `Acid: ${f(v.acid, 1)} ÷ 98.08 = ${f(acidMol(v), 4)} mol. It needs ${f(acidMol(v) * 2, 4)} mol NaOH.`,
        `Lye: ${f(v.lye, 1)} ÷ 40.00 = ${f(lyeMol(v), 4)} mol available. ${lyeMol(v) >= acidMol(v) * 2 ? 'The acid runs out first.' : 'The lye runs out first.'}`,
        `Water: ${f(Math.min(acidMol(v), lyeMol(v) / 2) * 2, 4)} mol × 18.02 g/mol = ${f(water(v), 2)} g`,
      ],
      outcome: [
        { kind: 'p', text: 'The lye goes in a sack at a time. The yellow hiss sinks to a mutter, then to nothing. Clear water trickles over the lip of the vat and out towards the spring.' },
        { kind: 'p', text: 'In the dregs you find a stoppered flask, still warm and etched with the burnt hand. Mireille turns it over and over in her stained fingers.' },
        { kind: 'say', text: 'They’ll be back, and they won’t be happy. Take this. If the Cult likes vitriol so much, let them taste it.' },
      ],
      reward: { gold: 100, spells: ['vitriol'], xp: { scholarship: 200 } },
    },
  ],
  reward: { gold: 150, items: { alembic: 1 }, qp: 1 },
  flawless: { text: 'Flawless: not one miss or hint. Mireille inks your spells in moon-silver: Antidote+ and Vitriol Flask+.', upgradeSpells: true },
  epilogue: [
    { kind: 'p', text: 'Within a week the river runs clear and the east field stands knee-high. The children race each other to the ford. Somebody has chalked a crooked flask on the tavern door in your honour.' },
    { kind: 'say', text: 'The Ashen Cult came up from the crypt beneath the graveyard. If you go down there, and I think you will, take the flask. And come back and tell me what you find.' },
  ],
};
