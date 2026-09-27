/**
 * Safe HTML handling for card faces. Anki fields may contain arbitrary HTML,
 * so we keep only a small whitelist of formatting tags and strip everything else
 * (scripts, styles, event handlers, links, iframes...).
 */
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'img', 'hr', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'table', 'tr', 'td', 'th', 'tbody', 'thead']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'head', 'title', 'svg', 'math', 'audio', 'video']);

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Media filenames referenced as images in a field. */
export function extractImageRefs(html: string): string[] {
  const out: string[] = [];
  const re = /<img[^>]*?src\s*=\s*["']?([^"'>\s]+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(safeDecode(m[1]));
  return out;
}

export function sanitizeHtml(input: string): string {
  const cleaned = input.replace(/\[sound:[^\]]*\]/g, '');
  if (typeof DOMParser === 'undefined') return escapeHtml(stripHtml(cleaned));
  const doc = new DOMParser().parseFromString(`<body>${cleaned}</body>`, 'text/html');
  const walk = (node: Node): string => {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        out += escapeHtml(child.textContent ?? '');
      } else if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (DROP_WITH_CONTENT.has(tag)) return;
        if (!ALLOWED.has(tag)) {
          out += walk(el);
          return;
        }
        if (tag === 'img') {
          const src = el.getAttribute('src') ?? el.getAttribute('data-media') ?? '';
          // only local media references; no remote/js/data urls
          if (!src || /^(javascript|https?|data|blob):/i.test(src) || src.includes('/')) return;
          out += `<img data-media="${escapeHtml(el.hasAttribute('src') ? safeDecode(src) : src)}" alt="">`;
          return;
        }
        if (tag === 'br' || tag === 'hr') {
          out += `<${tag}>`;
          return;
        }
        out += `<${tag}>${walk(el)}</${tag}>`;
      }
    });
    return out;
  };
  return walk(doc.body).trim();
}

/** Plain text (for previews / search). Works without a DOM. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert plain text typed in the editor into safe HTML (keeps line breaks). */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

/** Inverse of textToHtml for editing; keeps basic tags as-is. */
export function htmlToEditable(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n');
}

/** Editor input: allow a little inline markup (<b>, <i>, ...) but sanitize everything. */
export function editorToHtml(text: string): string {
  return sanitizeHtml(text.replace(/\n/g, '<br>'));
}

// ---------- cloze ----------

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function clozeOrdinals(text: string): number[] {
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CLOZE_RE);
  while ((m = re.exec(text))) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

export function renderCloze(text: string, ord: number, side: 'front' | 'back'): string {
  return text.replace(CLOZE_RE, (_all, n: string, answer: string, hint?: string) => {
    if (Number(n) !== ord) return answer;
    if (side === 'front') return `<b>[${hint ?? '...'}]</b>`;
    return `<b><u>${answer}</u></b>`;
  });
}

export function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}
