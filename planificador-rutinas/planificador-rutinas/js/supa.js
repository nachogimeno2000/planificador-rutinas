import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function mediaUrl(e) {
  if (e?.gif_path) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${e.gif_path}`;
  return e?.gif_url || '';
}

export const esVideo = (url) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

export function mediaHTML(e) {
  const url = mediaUrl(e);
  if (!url) {
    return `<div class="media-vacia" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4">
        <rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg></div>`;
  }
  if (esVideo(url)) {
    return `<video src="${esc(url)}" autoplay loop muted playsinline preload="metadata" aria-label="${esc(e.nombre)}"></video>`;
  }
  return `<img src="${esc(url)}" alt="${esc(e.nombre)}" loading="lazy">`;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3200);
}
