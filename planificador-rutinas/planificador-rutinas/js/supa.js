import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Para buscar sin importar tildes ni mayúsculas.
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function mediaUrl(e) {
  if (e?.gif_path) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${e.gif_path}`;
  return e?.gif_url || '';
}

export const esVideo = (url) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

/* Encuadre: recorte cuadrado guardado como {x, y, w, h} en fracciones del vídeo original.
   Se dibuja escalando el vídeo dentro de una caja cuadrada, sin necesidad de conocer su tamaño. */
export function cropStyle(enc) {
  if (!enc || !(enc.w > 0 && enc.h > 0)) return '';
  const W = 100 / enc.w;
  const H = 100 / enc.h;
  return `position:absolute;max-width:none;object-fit:fill;width:${W}%;height:${H}%;left:${-enc.x * W}%;top:${-enc.y * H}%`;
}

export function mediaHTML(e) {
  const url = e?.url_previa || mediaUrl(e);
  if (!url) {
    return `<div class="media-vacia" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4">
        <rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg></div>`;
  }
  const st = cropStyle(e.encuadre);
  const style = st ? ` style="${st}"` : '';
  const video = e.es_video ?? esVideo(url);
  if (video) {
    const src = url.startsWith('blob:') ? url : `${url}#t=0.1`;
    return `<video src="${esc(src)}" muted loop playsinline preload="metadata" data-auto${style} aria-label="${esc(e.nombre)}"></video>`;
  }
  return `<img src="${esc(url)}" alt="${esc(e.nombre)}" loading="lazy"${style}>`;
}

// Atributos para que al pulsar el vídeo se abra a tamaño completo.
export function verAttr(e) {
  const url = mediaUrl(e);
  if (!url) return '';
  return ` data-ver="${esc(url)}" data-titulo="${esc(e.nombre)}" role="button" tabindex="0" aria-label="Ver ${esc(e.nombre)} a tamaño completo"`;
}

/* Los vídeos solo se reproducen mientras están en pantalla: con 90+ ejercicios en una lista
   no se puede tener todo reproduciéndose a la vez. */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entradas) => entradas.forEach((en) => {
    const v = en.target;
    if (en.isIntersecting) v.play().catch(() => {});
    else v.pause();
  }), { rootMargin: '120px' })
  : null;

function vigilar(nodo, alta) {
  if (!io || nodo.nodeType !== 1) return;
  const lista = nodo.matches('video[data-auto]') ? [nodo] : nodo.querySelectorAll('video[data-auto]');
  lista.forEach((v) => (alta ? io.observe(v) : io.unobserve(v)));
}
new MutationObserver((cambios) => cambios.forEach((c) => {
  c.addedNodes.forEach((n) => vigilar(n, true));
  c.removedNodes.forEach((n) => vigilar(n, false));
})).observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll('video[data-auto]').forEach((v) => io?.observe(v));

/* Visor a pantalla completa para ver el vídeo entero, sin recortes. */
export function activarVisor() {
  const d = document.createElement('dialog');
  d.className = 'visor';
  document.body.append(d);
  const abrir = (el) => {
    const url = el.dataset.ver;
    d.innerHTML = `
      <div class="visor-cab"><p>${esc(el.dataset.titulo)}</p>
        <button type="button" class="ico" data-cerrar aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      ${esVideo(url)
    ? `<video src="${esc(url)}" autoplay loop muted playsinline controls></video>`
    : `<img src="${esc(url)}" alt="${esc(el.dataset.titulo)}">`}`;
    d.showModal();
  };
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ver]');
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    abrir(el);
  }, true);
  document.addEventListener('keydown', (ev) => {
    const el = ev.target.closest?.('[data-ver]');
    if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); abrir(el); }
  });
  d.addEventListener('click', (ev) => {
    if (ev.target === d || ev.target.closest('[data-cerrar]')) d.close();
  });
  d.addEventListener('close', () => { d.innerHTML = ''; });
}

/* Carga una sesión por su código: pública, o del propio entrenador aunque no esté compartida. */
export async function cargarFicha(slug) {
  if (!slug) return null;
  const { data } = await sb.rpc('ficha_publica', { p_slug: slug });
  if (data) return data;
  const { data: s } = await sb.from('sesiones')
    .select('*, sesion_ejercicios(*, ejercicio:ejercicios(*, categorias(nombre, color)))')
    .eq('slug', slug).maybeSingle();
  if (!s) return null;
  return {
    ...s,
    ejercicios: s.sesion_ejercicios.map((l) => ({
      ...l, ejercicio: { ...l.ejercicio, categoria: l.ejercicio.categorias?.nombre },
    })),
  };
}

/* Ordena las líneas de una sesión y las agrupa en superseries / triseries. */
export function gruposDeFicha(lineas, bloques) {
  const ordenBloque = Object.fromEntries(bloques.map((b, i) => [b.v, i]));
  const ord = [...lineas].sort((a, b) => ordenBloque[a.bloque] - ordenBloque[b.bloque] || a.orden - b.orden);
  const grupos = [];
  ord.forEach((l) => {
    const ult = grupos[grupos.length - 1];
    if (ult && ult.bloque === l.bloque && l.grupo != null && ult.grupo === l.grupo) ult.lineas.push(l);
    else grupos.push({ bloque: l.bloque, grupo: l.grupo, lineas: [l] });
  });
  return grupos;
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
