/**
 * Original low-res pixel art for Grimrecall. Every sprite is a character grid;
 * `m:` sprites list only the left half and are mirrored to full width.
 */
export const PALETTE: Record<string, string> = {
  k: '#0d0b0a', w: '#e8e0cc', g: '#9a9486', d: '#5a5550', r: '#8a1414', R: '#e03a2a',
  o: '#e0782a', y: '#c8a040', Y: '#fff0a0', b: '#6a4a2a', B: '#3a2616', m: '#4a7a3a',
  M: '#8ab04a', n: '#2a3a20', p: '#5a2a7a', P: '#a070c0', c: '#3a80b0', C: '#a0e0ff',
  s: '#d0a080', S: '#a07050', l: '#3050a0',
};

const RAW: Record<string, string[]> = {
  // ---------- creatures (16x16) ----------
  skeleton: ['m:', '.....kkk', '....kwww', '...kwwww', '...kwkkw', '...kwkRk', '...kwwww', '....kwkw', '.....kww', '...kkkkw', '..kwkwww', '..kwkkwk', '..kwk.kw', '...k..kw', '.....kwk', '.....kwk', '....kkk.'],
  slime: ['m:', '........', '........', '........', '........', '........', '......kk', '....kkMM', '...kMMMM', '..kMMMMM', '..kMMkkM', '.kMMMkYM', '.kmMMMMM', '.kmmMMMM', 'kmmmmmMM', 'kmnmmmmm', '.kkkkkkk'],
  wisp: ['m:', '........', '.......k', '......kC', '.....kCC', '....kCCc', '...kCCcc', '...kCcCC', '..kCcCkk', '..kCcCkY', '..kCccCC', '..kCcccC', '...kCccc', '...kCcCc', '....kCkC', '.....k.k', '........'],
  knight: ['m:', '.....kkk', '....kggg', '...kgggg', '...kgkkk', '...kgkRk', '...kgggg', '.kkkdggg', 'kgggkddd', 'kgdgkggg', 'kgdgkgdg', 'kgggkgdg', '.kkkkggg', '....kdgk', '....kgdk', '....kgdk', '...kkkkk'],
  ghoul: ['m:', '........', '.....kkk', '....kMMM', '...kMMMM', '...kMkkM', '...kMkRk', '...kMMMM', '....kMwk', '..kkkMMM', '.kMMkmMM', 'kMMkmmmM', 'kMk.kmmm', 'kk..kmmk', '....kMk.', '...kMMk.', '...kkkk.'],
  cultist: ['m:', '......kk', '.....krr', '....krrr', '...krrkk', '...krkko', '...krkkk', '...krrkk', '..krrrrr', '..krrrrr', '.kSkrrrr', '.kskrrrr', '..krrrry', '..krrrry', '.krrrrry', '.krrrrry', '.kkkkkkk'],
  bat: ['m:', '........', '........', '........', 'kk......', 'kdk...k.', 'kddk..kk', 'kdddkkdd', 'kddddkdR', 'kdddddkd', '.kddddkd', '..kdddkd', '...kk.kk', '........', '........', '........', '........'],
  rat: [
    '................', '................', '................', '................', '................',
    '..........kk....', '.........kggk...', '...kkkkkkgggkk..', '..kggggggggRgk..', '.kgggggggggggsk.',
    '.kgdgggggggggkk.', 'kkdddggggggdk...', 'k.kddddddddk....', 'k..kskk.kskk....', '.k..............', '..kk............',
  ],
  lich: ['m:', '..y.y.y.', '..yyyyyy', '...kwwww', '..kwwwww', '..kwkkww', '..kwkCkw', '..kwwwww', '...kwkwk', '.kppkwww', 'kpPppkkk', 'kpPpppPp', 'kpkpppPp', 'kwkpppPp', '..kpppPp', '.kpppppp', 'kkkkkkkk'],
  hag: ['m:', '....kkkk', '...kmmmm', '..kmmmmm', '..kmmsss', '.kmmskks', '.kmmskYk', '.kmmssss', '.kmmsSSs', '..kmkssk', '.kbbbkbb', 'kbBbbbbb', 'ksbbBbbb', 'kskbbbBb', '..kbbbbb', '.kbbbbbb', 'kkkkkkkk'],
  king: ['m:', '...y.y.y', '...yyyyy', '...kgggg', '..kggggg', '..kgkkkk', '..kgkRkk', '..kggggg', '.rkkgggg', 'rrkygggg', 'rkgygdgg', 'rkggyggg', 'rkggyggg', 'rrkgyddg', '.rkgdk.k', '..kddk..', '.kkkkk..'],
  warrior: ['m:', '........', '.....kkk', '....kggg', '...kgggg', '...kgkss', '...kgsks', '....kgss', '..kkrrkr', '.kssrrrr', '.ksgrrrr', '.ksgrryy', '..kkrrrr', '....kbbk', '....kbbk', '....kbbk', '...kkkkk'],
  cleric: ['m:', '......kk', '.....kww', '....kwww', '...kwwss', '...kwsks', '...kwsss', '...kwwss', '..kwwwwy', '.kswwwwy', '.kswwyyy', '..kwwwwy', '..kwwwwy', '..kwwwwy', '.kwwwwwy', '.kwwwwwy', '.kkkkkkk'],
  rogue: ['m:', '......kk', '.....knn', '....knnn', '...knnkk', '...knkYk', '...knkkk', '...knnkk', '..knnnnn', '.ksknnnn', '.ksknbnn', '..kknnbn', '....knnn', '....kBBk', '....kBBk', '....kBBk', '...kkkkk'],
  tomb: ['m:', '........', '........', '.....kkk', '....kddd', '...kdggg', '...kdggg', '...kdgkk', '...kdggk', '...kdgkk', '...kdggg', '...kdggg', '...kdggg', '..kkdggg', '.kmmkddd', 'kmmmmkkk', 'kkkkkkkk'],
  // ---------- skilling icons (8x8; y/Y/b/c/C/w/g are tint slots) ----------
  pickaxe: ['.kkkkk..', 'kgggggk.', 'kk.kbkgk', '...kbk.k', '..kbk...', '.kbk....', 'kbk.....', 'kk......'],
  fish: ['........', '.....kk.', 'k..kkyyk', 'kkkyyyYk', 'kyYyyyyk', 'kkkyyyk.', 'k..kkk..', '........'],
  sprout: ['........', '..kk.kk.', '.kMMkMMk', '..kkMkk.', '....k...', '..kbbbk.', '.kbbbbbk', '.kkkkkkk'],
  anvil: ['........', 'kkkkkkk.', 'kgggggkk', '.kgggggk', '..kddk..', '..kddk..', '.kddddk.', 'kkkkkkkk'],
  pot: ['..k..k..', '.k.k.k..', '........', 'kkkkkkkk', 'kdddddk.', 'kdgggdk.', 'kdddddk.', '.kkkkk..'],
  fist: ['........', '.kkkk...', 'kssskk..', 'ksksksk.', 'kssssssk', 'kSssssk.', '.kSSsk..', '..kkkk..'],
  helm: ['m:', '....', '.kkk', 'kgww', 'kggg', 'kgkk', 'kgk.', 'kgk.', '.k..'],
  body: ['m:', '.kk.', 'kggk', 'kggg', 'kgwg', '.kgg', '.kgg', '.kgg', '.kkk'],
  bar: ['........', '........', '...kkkkk', '..kYYYyk', '.kYyyyyk', 'kyyyyykk', 'kkkkkk..', '........'],
  ore: ['........', '..kkkk..', '.kdddyk.', 'kddyYddk', 'kdyYdydk', 'kddddYdk', '.kdddddk', '..kkkkk.'],
  log: ['........', '........', '.kkkkkk.', 'kbbbbkYk', 'kbbbkYyY', 'kbbbbkYk', '.kkkkkk.', '........'],
  rod: ['......kk', '.....kYk', '....kbk.', '...kbk.k', '..kbk..k', '.kbk...k', 'kbk...kk', 'kk......'],
  seed: ['........', '...kk...', '..kyyk..', '.kyyyyk.', '.kyyyyk.', '..kyyk..', '...kk...', '........'],
  crop: ['...kk...', '..kMMk..', '.kkkkkk.', 'kyyyyyyk', 'kyyyyyyk', 'kyyyyyyk', '.kyyyyk.', '..kkkk..'],
  bones: ['........', 'kk....kk', 'kwk..kwk', '.kwkkwk.', '..kwwk..', '.kwkkwk.', 'kwk..kwk', 'kk....kk'],
  nest: ['........', '...kk...', '..kyyk..', '.kbkkbk.', 'kbBbbBbk', 'kBbBbbBk', '.kbbbbk.', '..kkkk..'],
  bread: ['........', '..kkkk..', '.koooook', 'koYYoook', 'kooooook', 'kooooook', '.kkkkkk.', '........'],
  // ---------- icons (8x8) ----------
  sword: ['......kk', '.....kwk', '....kwk.', '.k.kwk..', '.kykk...', '..kyk...', '.kbkyk..', 'kbk..k..'],
  heart: ['m:', '.kk.', 'kRRk', 'kRRR', 'kRRR', '.kRR', '..kR', '...k', '....'],
  shield: ['m:', 'kkkk', 'kgyy', 'kgyy', 'kgyy', '.kgy', '.kgy', '..kg', '...k'],
  skull: ['m:', '.kkk', 'kwww', 'kwkk', 'kwkk', 'kwww', '.kwk', '.kww', '..kk'],
  eye: ['m:', '....', '..kk', '.kww', 'kwwc', 'kwck', '.kww', '..kk', '....'],
  daggers: ['k.....k.', 'kwk..kwk', '.kwkkwk.', '..kwwk..', '..kyyk..', '.kykkyk.', 'kbk..kbk', 'kk....kk'],
  fang: ['m:', 'kkkk', 'kwww', 'kwww', '.kww', '.kww', '..kw', '..kR', '...k'],
  axe: ['..kkkk..', '.kggggk.', 'kgggbgk.', 'kggkbkk.', '.kk.bk..', '....bk..', '....bk..', '....kk..'],
  star: ['m:', '...k', '..ky', '..ky', 'kkyy', '.kyY', '.kyy', 'kyk.', 'k...'],
  flame: ['m:', '...k', '..ko', '..ko', '.koo', 'kooy', 'koyY', 'koyY', '.kkk'],
  soul: ['m:', '..kk', '.kPP', 'kPpp', 'kPkk', 'kPpp', '.kPp', '..kP', '.k.k'],
  sigil: ['m:', '..kk', '.kyy', 'kyrk', 'kyrr', 'kyrr', 'kyrk', '.kyy', '..kk'],
  feather: ['.....kk.', '....kwwk', '...kwwk.', '..kwwk..', '.kwwk...', '.kwk....', 'k.k.....', 'k.......'],
  coin: ['m:', '..kk', '.kyy', 'kyyY', 'kyYy', 'kyyy', 'kyyy', '.kyy', '..kk'],
  book: ['kkkkkkk.', 'kbbbbbbk', 'kbyyybbk', 'kbbbbbbk', 'kbyybbbk', 'kbbbbbbk', 'kwwwwwwk', 'kkkkkkk.'],
  potion: ['m:', '...k', '..kb', '..kg', '.kgR', 'kgRR', 'kRRR', 'kRRR', '.kkk'],
  gem: ['m:', '....', '.kkk', 'kccC', 'kcCc', '.kcc', '..kc', '...k', '....'],
  ring: ['m:', '..kk', '.kcC', '..kk', '.kyy', 'ky.k', 'ky..', '.kyy', '..kk'],
  ankh: ['m:', '...k', '..ky', '..ky', '...k', 'kkkk', 'kyyy', 'kkky', '..ky'],
  chest: ['.kkkkkk.', 'kbbbbbbk', 'kbBBBBbk', 'kkkykkkk', 'kbbYbbbk', 'kbbybbbk', 'kbbbbbbk', 'kkkkkkkk'],
  up: ['m:', '...k', '..kR', '.kRR', 'kRRR', '..kR', '..kR', '..kR', '..kk'],
  hourglass: ['m:', 'kkkk', 'kyyy', '.kyy', '..ky', '..ko', '.koo', 'kooo', 'kkkk'],
};

function expand(rows: string[]): string[] {
  if (rows[0] !== 'm:') return rows;
  return rows.slice(1).map((r) => r + [...r].reverse().join(''));
}

export const SPRITES: Record<string, string[]> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, expand(v)]));

const cache = new Map<string, string>();

/** Render a sprite to a PNG data URL at native resolution (scale up with CSS pixelated). */
export function spriteUrl(name: string, tint?: Record<string, string>): string {
  const key = tint ? `${name}|${JSON.stringify(tint)}` : name;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = SPRITES[name];
  if (!rows || typeof document === 'undefined') return '';
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = tint?.[ch] ?? PALETTE[ch] ?? '#f0f';
      ctx.fillRect(x, y, 1, 1);
    });
  });
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}
