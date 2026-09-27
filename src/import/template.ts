import { renderCloze, stripHtml } from './html';

/**
 * Renders the subset of Anki's card template language needed to produce card faces:
 * {{Field}}, {{FrontSide}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}},
 * and filters cloze:, text:, hint:, type: (dropped), tts (dropped).
 */
export function renderTemplate(tmpl: string, fields: Record<string, string>, clozeOrd: number, side: 'front' | 'back', frontSide = ''): string {
  let out = tmpl;
  const sec = /\{\{([#^])\s*([^}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
  for (let guard = 0; guard < 100; guard++) {
    const m = sec.exec(out);
    if (!m) break;
    const nonEmpty = stripHtml(fields[m[2]] ?? '').trim() !== '';
    const keep = m[1] === '#' ? nonEmpty : !nonEmpty;
    out = out.slice(0, m.index) + (keep ? m[3] : '') + out.slice(m.index + m[0].length);
  }
  return out.replace(/\{\{([^{}]+)\}\}/g, (_all, inner: string) => {
    const key = inner.trim();
    if (key === 'FrontSide') return frontSide;
    const parts = key.split(':');
    const name = parts.pop()!.trim();
    let value = fields[name] ?? '';
    for (const f of parts.reverse().map((x) => x.trim())) {
      if (f === 'cloze') value = renderCloze(value, clozeOrd, side);
      else if (f === 'text') value = stripHtml(value);
      else if (f === 'type' || f.startsWith('tts')) value = '';
    }
    return value;
  });
}
