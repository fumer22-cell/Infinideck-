/** Minimal RFC-4180-ish parser supporting quotes, with auto-detected delimiter. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = delimiter ?? (firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export interface SimpleNote { front: string; back: string }

/** Rows → front/back pairs. Skips a "front,back" header row and Anki "#" directives. */
export function csvToNotes(text: string): SimpleNote[] {
  const rows = parseDelimited(text.split(/\r?\n/).filter((l) => !l.startsWith('#')).join('\n'));
  if (rows.length && /^front$/i.test(rows[0][0]?.trim() ?? '') && /^back$/i.test(rows[0][1]?.trim() ?? '')) rows.shift();
  return rows
    .filter((r) => r.length >= 2 && (r[0].trim() || r[1].trim()))
    .map((r) => ({ front: r[0].trim(), back: r[1].trim() }));
}
