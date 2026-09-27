import { useEffect, useRef, type ReactNode } from 'react';
import { spriteUrl } from '../art/sprites';
import { db } from '../core/db';
import { useApp } from './context';
import { sfx } from './sfx';

export function Sprite({ name, size = 32, className = '', title }: { name: string; size?: number; className?: string; title?: string }) {
  return <img className={`px ${className}`} src={spriteUrl(name)} width={size} height={size} alt={title ?? ''} title={title} draggable={false} />;
}

export function TopBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const { back } = useApp();
  return (
    <div className="topbar">
      <button className="back-btn" aria-label="Back" onClick={() => { sfx.tap(); (onBack ?? back)(); }}>◀</button>
      <h2>{title}</h2>
      {right}
    </div>
  );
}

const urlCache = new Map<string, string>();
async function mediaUrl(name: string): Promise<string | null> {
  const hit = urlCache.get(name);
  if (hit) return hit;
  const row = await db.media.get(name);
  if (!row) return null;
  const url = URL.createObjectURL(row.blob);
  urlCache.set(name, url);
  return url;
}

/** Renders sanitized card HTML; resolves media images from IndexedDB. */
export function RichText({ html, className = '' }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLImageElement>('img[data-media]').forEach(async (img) => {
      const url = await mediaUrl(img.dataset.media!);
      if (url) img.src = url;
      else img.remove();
    });
  }, [html]);
  // html is produced by sanitizeHtml() (whitelisted tags, no attributes except data-media)
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function MediaImage({ name, className }: { name: string; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    void mediaUrl(name).then((u) => {
      if (u && ref.current) ref.current.src = u;
    });
  }, [name]);
  return <img ref={ref} className={className} alt="" />;
}

export function CardFace({ front, back, image, revealed }: { front: string; back: string; image?: string; revealed: boolean }) {
  return (
    <div className="parchment flashcard">
      {image && <MediaImage name={image} />}
      <RichText html={front} />
      {revealed && (
        <>
          <hr />
          <RichText html={back} className="back" />
        </>
      )}
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  return <div className="toast stone">{msg}</div>;
}
