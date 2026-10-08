import { sb, esc, mediaHTML, toast } from './supa.js';
import { BUCKET, MAX_MB } from './config.js';
import {
  ZONAS, ESTIMULOS, PLANOS, IMPACTOS, MATERIAL, NIVELES, BLOQUES,
  PRESCRIPCION, PRESCRIPCION_BASE,
} from './catalogo.js';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const vista = $('#vista');
const dlg = $('#dlg');
const hoy = () => new Date().toISOString().slice(0, 10);
const barajar = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const cruza = (set, arr = []) => set.size === 0 || (arr || []).some((x) => set.has(x));
const uid = () => crypto.randomUUID();
const ICON = {
  arriba: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 14 6-6 6 6"/></svg>',
  abajo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 10 6 6 6-6"/></svg>',
  cambiar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
  quitar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  mas: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ---------- estado ---------- */
const nuevaSesion = () => ({
  id: null, titulo: '', fecha: hoy(), objetivo: '', duracion_min: '', intensidad: '',
  notas: '', publica: false, slug: null, items: [],
});

const state = {
  user: null,
  ejercicios: [],
  categorias: [],
  sesion: nuevaSesion(),
  gen: { n: 6, zonas: new Set(), estimulos: new Set(), planos: new Set(), impacto: new Set(), bloque: 'principal' },
  bib: { q: '', zonas: new Set(), estimulos: new Set() },
};

const ejById = (id) => state.ejercicios.find((e) => e.id === id);

/* ---------- arranque y acceso ---------- */
async function arrancar() {
  const top = $('.top');
  if (!state.user) {
    top.hidden = true;
    renderAcceso();
    return;
  }
  top.hidden = false;
  vista.innerHTML = '<p class="cargando">Cargando…</p>';
  await cargarDatos();
  ruta();
}

async function cargarDatos() {
  const [ej, cat] = await Promise.all([
    sb.from('ejercicios').select('*').order('nombre'),
    sb.from('categorias').select('*').order('orden'),
  ]);
  if (ej.error) toast(`No se pudo cargar la biblioteca: ${ej.error.message}`);
  state.ejercicios = ej.data || [];
  state.categorias = cat.data || [];
}

function renderAcceso(modo = 'entrar') {
  const entrar = modo === 'entrar';
  vista.innerHTML = `
  <section class="acceso">
    <p class="marca-grande"><span class="marca-punto" aria-hidden="true"></span>Planificador</p>
    <p class="acceso-sub">Tu biblioteca de ejercicios y tus sesiones, en un solo sitio.</p>
    <form id="f-acceso" class="acceso-form">
      <label>Correo<input name="email" type="email" autocomplete="email" required></label>
      <label>Contraseña<input name="password" type="password" minlength="6"
        autocomplete="${entrar ? 'current-password' : 'new-password'}" required></label>
      <button class="btn btn-pri" type="submit">${entrar ? 'Entrar' : 'Crear cuenta'}</button>
      <button class="btn-txt" type="button" data-modo="${entrar ? 'crear' : 'entrar'}">
        ${entrar ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}</button>
      <p class="aviso" id="aviso-acceso" role="alert"></p>
    </form>
  </section>`;
  $('[data-modo]').onclick = (ev) => renderAcceso(ev.currentTarget.dataset.modo);
  $('#f-acceso').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const cred = { email: fd.get('email'), password: fd.get('password') };
    const aviso = $('#aviso-acceso');
    aviso.textContent = '';
    if (entrar) {
      const { error } = await sb.auth.signInWithPassword(cred);
      if (error) aviso.textContent = error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.' : error.message;
    } else {
      const { data, error } = await sb.auth.signUp({ ...cred, options: { emailRedirectTo: location.origin } });
      if (error) aviso.textContent = error.message;
      else if (!data.session) aviso.textContent = 'Cuenta creada. Revisa tu correo y confirma la dirección para entrar.';
    }
  };
}

/* ---------- rutas ---------- */
function ruta() {
  if (!state.user) return;
  const [, seccion = 'sesion', id] = location.hash.split('/');
  document.querySelectorAll('[data-ruta]').forEach((a) =>
    a.toggleAttribute('aria-current', a.dataset.ruta === seccion));
  if (seccion === 'biblioteca') return renderBiblioteca();
  if (seccion === 'sesiones') return renderSesiones();
  if (id && id !== state.sesion.id) return abrirSesion(id);
  renderSesion();
}

/* ======================================================================
   CONSTRUCTOR DE SESIÓN
   ====================================================================== */
function grupoChips(titulo, clave, opciones) {
  const set = state.gen[clave];
  const chips = opciones.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const t = typeof o === 'string' ? o : o.t;
    return `<button type="button" class="chip" data-grupo="${clave}" data-valor="${esc(v)}"
      aria-pressed="${set.has(v)}">${esc(t)}</button>`;
  }).join('');
  return `<fieldset class="grupo"><legend>${titulo}</legend><div class="chips">${chips}</div></fieldset>`;
}

function candidatos(f = state.gen) {
  return state.ejercicios.filter((e) =>
    cruza(f.zonas, e.grupos_musculares)
    && cruza(f.estimulos, e.estimulos)
    && cruza(f.planos, e.planos)
    && (f.impacto.size === 0 || f.impacto.has(e.impacto)));
}

function renderSesion() {
  const s = state.sesion;
  const g = state.gen;
  vista.innerHTML = `
  <section class="constructor">
    <aside class="consola" aria-label="Filtros para generar la sesión">
      <div class="lectura">
        <button type="button" class="paso" data-acc="menos" aria-label="Un ejercicio menos">−</button>
        <output id="n-ej" aria-live="polite">${g.n}</output>
        <button type="button" class="paso" data-acc="mas" aria-label="Un ejercicio más">+</button>
      </div>
      <p class="lectura-txt">ejercicios</p>
      ${grupoChips('Zona muscular', 'zonas', ZONAS)}
      ${grupoChips('Tipo de estímulo', 'estimulos', ESTIMULOS)}
      ${grupoChips('Plano', 'planos', PLANOS)}
      ${grupoChips('Impacto', 'impacto', IMPACTOS)}
      <fieldset class="grupo"><legend>Añadir a</legend>
        <div class="segmentos">${BLOQUES.map((b) => `
          <button type="button" class="seg" data-bloque="${b.v}" aria-pressed="${g.bloque === b.v}">${b.t}</button>`).join('')}
        </div>
      </fieldset>
      <p class="coincide" id="coincide"></p>
      <button type="button" class="btn-generar" data-acc="generar">Generar sesión</button>
      <button type="button" class="btn-txt limpiar" data-acc="limpiar">Quitar filtros</button>
    </aside>

    <div class="hoja">
      <div class="cabecera-sesion">
        <input class="titulo-sesion" data-s="titulo" value="${esc(s.titulo)}" placeholder="Título de la sesión" aria-label="Título de la sesión">
        <div class="meta-sesion">
          <label>Fecha<input type="date" data-s="fecha" value="${esc(s.fecha || '')}"></label>
          <label>Duración (min)<input type="number" min="1" data-s="duracion_min" value="${esc(s.duracion_min)}"></label>
          <label>Intensidad (1–10)<input type="number" min="1" max="10" data-s="intensidad" value="${esc(s.intensidad)}"></label>
          <label class="ancho">Objetivo<input data-s="objetivo" value="${esc(s.objetivo)}" placeholder="Ej.: fuerza de tren inferior"></label>
        </div>
      </div>
      <div id="items"></div>
      <label class="notas-sesion">Notas para la sesión
        <textarea data-s="notas" rows="2" placeholder="Indicaciones generales, material a preparar…">${esc(s.notas)}</textarea></label>
      <div class="acciones">
        <button type="button" class="btn" data-acc="anadir">${ICON.mas} Añadir ejercicio</button>
        <span class="hueco"></span>
        <button type="button" class="btn-txt" data-acc="nueva">Nueva sesión</button>
        <button type="button" class="btn" data-acc="compartir">Compartir ficha</button>
        <button type="button" class="btn btn-pri" data-acc="guardar">Guardar</button>
      </div>
    </div>
  </section>`;
  renderItems();
  actualizarCoincidencias();

  const raiz = $('.constructor');
  raiz.addEventListener('click', clickConstructor);
  raiz.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.s) state.sesion[t.dataset.s] = t.value;
    if (t.dataset.campo) {
      const item = state.sesion.items.find((i) => i.key === t.closest('.item').dataset.key);
      if (item) item[t.dataset.campo] = t.value;
    }
  });
}

function actualizarCoincidencias() {
  const n = candidatos().length;
  const el = $('#coincide');
  if (!el) return;
  if (!state.ejercicios.length) el.textContent = 'Tu biblioteca aún está vacía.';
  else el.textContent = n === 1 ? '1 ejercicio encaja con estos filtros' : `${n} ejercicios encajan con estos filtros`;
  el.classList.toggle('poco', n < state.gen.n);
}

async function clickConstructor(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const g = state.gen;

  if (b.dataset.grupo) {
    const set = g[b.dataset.grupo];
    const v = b.dataset.valor;
    set.has(v) ? set.delete(v) : set.add(v);
    b.setAttribute('aria-pressed', set.has(v));
    return actualizarCoincidencias();
  }
  if (b.dataset.bloque) {
    g.bloque = b.dataset.bloque;
    document.querySelectorAll('[data-bloque]').forEach((x) =>
      x.setAttribute('aria-pressed', x.dataset.bloque === g.bloque));
    return;
  }
  const item = b.closest('.item') && state.sesion.items.find((i) => i.key === b.closest('.item').dataset.key);

  switch (b.dataset.acc) {
    case 'menos': g.n = Math.max(1, g.n - 1); $('#n-ej').value = g.n; actualizarCoincidencias(); break;
    case 'mas': g.n = Math.min(20, g.n + 1); $('#n-ej').value = g.n; actualizarCoincidencias(); break;
    case 'generar': generar(); break;
    case 'limpiar':
      ['zonas', 'estimulos', 'planos', 'impacto'].forEach((k) => g[k].clear());
      document.querySelectorAll('.consola [data-grupo]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      actualizarCoincidencias();
      break;
    case 'subir': mover(item, -1); break;
    case 'bajar': mover(item, 1); break;
    case 'cambiar': cambiar(item); break;
    case 'quitar':
      state.sesion.items = state.sesion.items.filter((i) => i !== item);
      renderItems();
      break;
    case 'anadir': abrirSelector(); break;
    case 'guardar': guardar(); break;
    case 'compartir': compartir(); break;
    case 'nueva':
      if (state.sesion.items.length && !confirm('¿Empezar una sesión nueva? Lo que no hayas guardado se perderá.')) return;
      state.sesion = nuevaSesion();
      history.replaceState(null, '', '#/sesion');
      renderSesion();
      break;
  }
}

function prescripcionPara(e) {
  const est = [...state.gen.estimulos][0] || (e.estimulos || [])[0];
  return { ...(PRESCRIPCION[est] || PRESCRIPCION_BASE) };
}

const nuevoItem = (e, bloque) => ({
  key: uid(), ejercicio_id: e.id, bloque, carga: '', notas: '', ...prescripcionPara(e),
});

function generar() {
  const g = state.gen;
  if (!state.ejercicios.length) {
    toast('Primero añade ejercicios a tu biblioteca.');
    return;
  }
  const enOtrosBloques = new Set(state.sesion.items.filter((i) => i.bloque !== g.bloque).map((i) => i.ejercicio_id));
  const pool = barajar(candidatos()).filter((e) => !enOtrosBloques.has(e.id));

  let elegidos = [];
  if (g.zonas.size > 1) {
    // Reparto equilibrado: va tomando un ejercicio de cada zona por turnos.
    const listas = [...g.zonas].map((z) => pool.filter((e) => (e.grupos_musculares || []).includes(z)));
    const usados = new Set();
    let k = 0;
    while (elegidos.length < g.n && listas.some((l) => l.length)) {
      const l = listas[k++ % listas.length];
      while (l.length) {
        const e = l.shift();
        if (!usados.has(e.id)) { usados.add(e.id); elegidos.push(e); break; }
      }
    }
  } else {
    elegidos = pool.slice(0, g.n);
  }

  if (!elegidos.length) {
    toast('Ningún ejercicio encaja con estos filtros. Prueba a quitar alguno.');
    return;
  }
  state.sesion.items = state.sesion.items
    .filter((i) => i.bloque !== g.bloque)
    .concat(elegidos.map((e) => nuevoItem(e, g.bloque)));
  renderItems(true);
  if (matchMedia('(max-width: 980px)').matches) {
    $('#items').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (elegidos.length < g.n) toast(`Solo hay ${elegidos.length} ejercicios con estos filtros.`);
}

function mover(item, dir) {
  const items = state.sesion.items;
  const mismos = items.filter((i) => i.bloque === item.bloque);
  const pos = mismos.indexOf(item);
  const otro = mismos[pos + dir];
  if (!otro) return;
  const a = items.indexOf(item);
  const b = items.indexOf(otro);
  [items[a], items[b]] = [items[b], items[a]];
  renderItems();
}

function cambiar(item) {
  const actual = ejById(item.ejercicio_id);
  const enSesion = new Set(state.sesion.items.map((i) => i.ejercicio_id));
  let opciones = candidatos().filter((e) => !enSesion.has(e.id));
  if (!opciones.length && actual) {
    opciones = state.ejercicios.filter((e) => !enSesion.has(e.id)
      && (e.grupos_musculares || []).some((z) => (actual.grupos_musculares || []).includes(z)));
  }
  if (!opciones.length) {
    toast('No hay otro ejercicio que encaje para cambiarlo.');
    return;
  }
  item.ejercicio_id = barajar(opciones)[0].id;
  renderItems();
}

function renderItems(animar = false) {
  const cont = $('#items');
  if (!cont) return;
  const items = state.sesion.items;
  if (!items.length) {
    cont.innerHTML = state.ejercicios.length
      ? `<div class="vacio"><p>Elige zona y estímulo en la consola y pulsa <strong>Generar sesión</strong>,
          o añade ejercicios uno a uno.</p></div>`
      : `<div class="vacio"><p>Tu biblioteca está vacía. Sube tu primer ejercicio con su GIF para empezar.</p>
          <a class="btn btn-pri" href="#/biblioteca">Ir a la biblioteca</a></div>`;
    return;
  }
  let n = 0;
  cont.innerHTML = BLOQUES.map((b) => {
    const delBloque = items.filter((i) => i.bloque === b.v);
    if (!delBloque.length) return '';
    return `<section class="bloque">
      <h2>${b.t} <span>${delBloque.length}</span></h2>
      ${delBloque.map((i, idx) => {
        const e = ejById(i.ejercicio_id) || { nombre: 'Ejercicio eliminado' };
        return `<article class="item${animar ? ' entra' : ''}" style="--i:${n++}" data-key="${i.key}">
          <div class="media">${mediaHTML(e)}</div>
          <div class="item-cuerpo">
            <h3>${esc(e.nombre)}</h3>
            <p class="tags">${esc([...(e.grupos_musculares || []), ...(e.estimulos || [])].join(', '))}</p>
            <div class="prescripcion">
              <label>Series<input type="number" min="1" data-campo="series" value="${esc(i.series)}"></label>
              <label>Reps / tiempo<input data-campo="repeticiones" value="${esc(i.repeticiones)}"></label>
              <label>Descanso (s)<input type="number" min="0" step="15" data-campo="descanso_seg" value="${esc(i.descanso_seg)}"></label>
              <label>Carga<input data-campo="carga" value="${esc(i.carga)}" placeholder="kg, %RM, RPE"></label>
            </div>
          </div>
          <div class="item-acc">
            <button type="button" class="ico" data-acc="subir" aria-label="Subir" ${idx === 0 ? 'disabled' : ''}>${ICON.arriba}</button>
            <button type="button" class="ico" data-acc="bajar" aria-label="Bajar" ${idx === delBloque.length - 1 ? 'disabled' : ''}>${ICON.abajo}</button>
            <button type="button" class="ico" data-acc="cambiar" aria-label="Cambiar por otro ejercicio">${ICON.cambiar}</button>
            <button type="button" class="ico" data-acc="quitar" aria-label="Quitar de la sesión">${ICON.quitar}</button>
          </div>
        </article>`;
      }).join('')}
    </section>`;
  }).join('');
}

/* ---------- selector manual ---------- */
function abrirSelector() {
  const bloque = BLOQUES.find((b) => b.v === state.gen.bloque).t;
  dlg.innerHTML = `
    <div class="dlg-cuerpo">
      <div class="dlg-cab"><h2>Añadir a ${esc(bloque.toLowerCase())}</h2>
        <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
      <input type="search" id="sel-q" placeholder="Buscar por nombre o zona" aria-label="Buscar ejercicio">
      <div id="sel-lista" class="sel-lista"></div>
    </div>`;
  const pintar = () => {
    const q = $('#sel-q').value.trim().toLowerCase();
    const lista = state.ejercicios.filter((e) => !q
      || e.nombre.toLowerCase().includes(q)
      || (e.grupos_musculares || []).some((z) => z.toLowerCase().includes(q)));
    $('#sel-lista').innerHTML = lista.length ? lista.map((e) => `
      <button type="button" class="sel-fila" data-id="${e.id}">
        <span class="media mini">${mediaHTML(e)}</span>
        <span><strong>${esc(e.nombre)}</strong><small>${esc((e.grupos_musculares || []).join(', '))}</small></span>
      </button>`).join('') : '<p class="vacio-mini">No hay ejercicios con ese nombre.</p>';
  };
  pintar();
  $('#sel-q').oninput = pintar;
  $('#sel-lista').onclick = (ev) => {
    const f = ev.target.closest('[data-id]');
    if (!f) return;
    state.sesion.items.push(nuevoItem(ejById(f.dataset.id), state.gen.bloque));
    renderItems();
    toast('Añadido a la sesión');
  };
  dlg.showModal();
  $('#sel-q').focus();
}

/* ---------- guardar / abrir / compartir ---------- */
const num = (v, min) => (v === '' || v == null || Number.isNaN(+v) ? null : Math.max(min, Math.round(+v)));

async function guardar({ silencioso = false } = {}) {
  const s = state.sesion;
  if (!s.titulo.trim()) {
    toast('Ponle un título a la sesión para guardarla.');
    $('.titulo-sesion')?.focus();
    return false;
  }
  const intensidad = num(s.intensidad, 1);
  const fila = {
    titulo: s.titulo.trim(),
    fecha: s.fecha || null,
    objetivo: s.objetivo?.trim() || null,
    duracion_min: num(s.duracion_min, 1),
    intensidad: intensidad == null ? null : Math.min(10, intensidad),
    notas: s.notas?.trim() || null,
    publica: s.publica,
  };
  const res = s.id
    ? await sb.from('sesiones').update(fila).eq('id', s.id).select().single()
    : await sb.from('sesiones').insert(fila).select().single();
  if (res.error) { toast(`No se pudo guardar: ${res.error.message}`); return false; }
  s.id = res.data.id;
  s.slug = res.data.slug;

  const del = await sb.from('sesion_ejercicios').delete().eq('sesion_id', s.id);
  if (del.error) { toast(`No se pudo guardar: ${del.error.message}`); return false; }
  const orden = {};
  const filas = s.items.map((i) => ({
    sesion_id: s.id,
    ejercicio_id: i.ejercicio_id,
    bloque: i.bloque,
    orden: (orden[i.bloque] = (orden[i.bloque] ?? -1) + 1),
    series: num(i.series, 1),
    repeticiones: String(i.repeticiones ?? '').trim() || null,
    descanso_seg: num(i.descanso_seg, 0),
    carga: String(i.carga ?? '').trim() || null,
    notas: i.notas || null,
  }));
  if (filas.length) {
    const ins = await sb.from('sesion_ejercicios').insert(filas);
    if (ins.error) { toast(`No se pudieron guardar los ejercicios: ${ins.error.message}`); return false; }
  }
  history.replaceState(null, '', `#/sesion/${s.id}`);
  if (!silencioso) toast('Sesión guardada');
  return true;
}

async function abrirSesion(id) {
  vista.innerHTML = '<p class="cargando">Cargando sesión…</p>';
  const { data, error } = await sb.from('sesiones').select('*, sesion_ejercicios(*)').eq('id', id).single();
  if (error) {
    toast('No se encontró esa sesión.');
    location.hash = '#/sesiones';
    return;
  }
  const ordenBloque = Object.fromEntries(BLOQUES.map((b, i) => [b.v, i]));
  state.sesion = {
    id: data.id, titulo: data.titulo, fecha: data.fecha, objetivo: data.objetivo || '',
    duracion_min: data.duracion_min ?? '', intensidad: data.intensidad ?? '', notas: data.notas || '',
    publica: data.publica, slug: data.slug,
    items: data.sesion_ejercicios
      .sort((a, b) => ordenBloque[a.bloque] - ordenBloque[b.bloque] || a.orden - b.orden)
      .map((l) => ({
        key: uid(), ejercicio_id: l.ejercicio_id, bloque: l.bloque, series: l.series ?? '',
        repeticiones: l.repeticiones ?? '', descanso_seg: l.descanso_seg ?? '', carga: l.carga ?? '', notas: l.notas ?? '',
      })),
  };
  renderSesion();
}

const enlaceFicha = (slug) => `${location.origin}/f/${slug}`;

async function compartir() {
  const s = state.sesion;
  if (!s.items.length) { toast('Añade ejercicios antes de compartir la ficha.'); return; }
  if (!(await guardar({ silencioso: true }))) return;
  if (!s.publica) {
    const { error } = await sb.from('sesiones').update({ publica: true }).eq('id', s.id);
    if (error) { toast(`No se pudo compartir: ${error.message}`); return; }
    s.publica = true;
  }
  const url = enlaceFicha(s.slug);
  dlg.innerHTML = `
    <div class="dlg-cuerpo">
      <div class="dlg-cab"><h2>Ficha compartida</h2>
        <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
      <p class="dlg-txt">Cualquiera con este enlace puede ver la ficha, sin cuenta.</p>
      <div class="enlace"><input readonly value="${esc(url)}" aria-label="Enlace de la ficha">
        <button type="button" class="btn btn-pri" id="copiar">Copiar enlace</button></div>
      <div class="acciones">
        <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir ficha</a>
        <span class="hueco"></span>
        <button type="button" class="btn-txt" id="dejar">Dejar de compartir</button>
      </div>
    </div>`;
  $('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
    catch { $('.enlace input').select(); }
  };
  $('#dejar').onclick = async () => {
    const { error } = await sb.from('sesiones').update({ publica: false }).eq('id', s.id);
    if (error) return toast(error.message);
    s.publica = false;
    dlg.close();
    toast('La ficha ya no es pública');
  };
  dlg.showModal();
}

/* ======================================================================
   MIS SESIONES
   ====================================================================== */
async function renderSesiones() {
  vista.innerHTML = '<p class="cargando">Cargando sesiones…</p>';
  const { data, error } = await sb.from('sesiones')
    .select('id, titulo, fecha, objetivo, publica, slug, sesion_ejercicios(count)')
    .order('fecha', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { vista.innerHTML = `<p class="cargando">No se pudieron cargar: ${esc(error.message)}</p>`; return; }

  const fmt = (f) => (f ? new Date(`${f}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha');
  vista.innerHTML = `
  <section class="pagina">
    <div class="pagina-cab"><h1>Mis sesiones</h1>
      <a class="btn btn-pri" href="#/sesion" id="nueva-desde-lista">${ICON.mas} Nueva sesión</a></div>
    ${data.length ? `<ul class="lista-sesiones">${data.map((s) => `
      <li data-id="${s.id}">
        <time>${fmt(s.fecha)}</time>
        <div><strong>${esc(s.titulo)}</strong>
          <small>${s.sesion_ejercicios[0]?.count ?? 0} ejercicios${s.objetivo ? `, ${esc(s.objetivo)}` : ''}</small></div>
        ${s.publica ? '<span class="estado">Compartida</span>' : '<span></span>'}
        <div class="fila-acc">
          <a class="btn" href="#/sesion/${s.id}">Editar</a>
          <a class="btn-txt" href="/f/${s.slug}" target="_blank" rel="noopener">Ver ficha</a>
          <button type="button" class="ico" data-borrar aria-label="Borrar sesión">${ICON.quitar}</button>
        </div>
      </li>`).join('')}</ul>`
    : '<div class="vacio"><p>Aún no has guardado ninguna sesión.</p><a class="btn btn-pri" href="#/sesion">Crear la primera</a></div>'}
  </section>`;

  $('#nueva-desde-lista').onclick = () => { state.sesion = nuevaSesion(); };
  vista.querySelectorAll('[data-borrar]').forEach((b) => {
    b.onclick = async () => {
      const li = b.closest('li');
      if (!confirm('¿Borrar esta sesión? No se puede deshacer.')) return;
      const { error: e } = await sb.from('sesiones').delete().eq('id', li.dataset.id);
      if (e) return toast(e.message);
      if (state.sesion.id === li.dataset.id) state.sesion = nuevaSesion();
      li.remove();
      toast('Sesión borrada');
    };
  });
}

/* ======================================================================
   BIBLIOTECA
   ====================================================================== */
function renderBiblioteca() {
  const f = state.bib;
  const chips = (clave, lista) => lista.map((v) => `
    <button type="button" class="chip" data-fgrupo="${clave}" data-valor="${esc(v)}" aria-pressed="${f[clave].has(v)}">${esc(v)}</button>`).join('');
  vista.innerHTML = `
  <section class="pagina">
    <div class="pagina-cab"><h1>Biblioteca</h1>
      <button type="button" class="btn btn-pri" id="nuevo-ej">${ICON.mas} Añadir ejercicio</button></div>
    <div class="filtros-bib">
      <input type="search" id="bib-q" value="${esc(f.q)}" placeholder="Buscar ejercicio" aria-label="Buscar ejercicio">
      <div class="chips">${chips('zonas', ZONAS)}</div>
      <div class="chips">${chips('estimulos', ESTIMULOS)}</div>
    </div>
    <p class="contador" id="bib-n"></p>
    <div class="rejilla" id="rejilla"></div>
  </section>`;

  const pintar = () => {
    const q = f.q.trim().toLowerCase();
    const lista = state.ejercicios.filter((e) =>
      (!q || e.nombre.toLowerCase().includes(q))
      && cruza(f.zonas, e.grupos_musculares) && cruza(f.estimulos, e.estimulos));
    $('#bib-n').textContent = `${lista.length} de ${state.ejercicios.length} ejercicios`;
    $('#rejilla').innerHTML = lista.length ? lista.map((e) => `
      <button type="button" class="tarjeta" data-id="${e.id}">
        <span class="media">${mediaHTML(e)}</span>
        <strong>${esc(e.nombre)}</strong>
        <small>${esc((e.grupos_musculares || []).join(', '))}</small>
      </button>`).join('')
      : state.ejercicios.length
        ? '<p class="vacio-mini">Ningún ejercicio coincide. Quita algún filtro.</p>'
        : '<div class="vacio"><p>Aún no hay ejercicios. Sube el primero con su GIF o vídeo corto.</p></div>';
  };
  pintar();

  $('#bib-q').oninput = (ev) => { f.q = ev.target.value; pintar(); };
  $('.filtros-bib').onclick = (ev) => {
    const b = ev.target.closest('[data-fgrupo]');
    if (!b) return;
    const set = f[b.dataset.fgrupo];
    set.has(b.dataset.valor) ? set.delete(b.dataset.valor) : set.add(b.dataset.valor);
    b.setAttribute('aria-pressed', set.has(b.dataset.valor));
    pintar();
  };
  $('#nuevo-ej').onclick = () => formEjercicio();
  $('#rejilla').onclick = (ev) => {
    const t = ev.target.closest('[data-id]');
    if (t) formEjercicio(ejById(t.dataset.id));
  };
}

function checks(nombre, lista, marcados = [], tipo = 'checkbox') {
  return `<div class="chips">${lista.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const t = typeof o === 'string' ? o : o.t;
    return `<label class="chip"><input type="${tipo}" name="${nombre}" value="${esc(v)}"
      ${marcados.includes(v) ? 'checked' : ''}><span>${esc(t)}</span></label>`;
  }).join('')}</div>`;
}

function formEjercicio(e = null) {
  const propio = !e || e.creado_por === state.user.id;
  const x = e || {};
  dlg.innerHTML = `
  <form class="dlg-cuerpo" id="f-ej">
    <div class="dlg-cab"><h2>${e ? (propio ? 'Editar ejercicio' : esc(e.nombre)) : 'Nuevo ejercicio'}</h2>
      <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
    <fieldset ${propio ? '' : 'disabled'}>
      <div class="subida">
        <div class="media grande" id="previa">${mediaHTML(x)}</div>
        <div class="subida-campos">
          <label>GIF o vídeo corto (máx. ${MAX_MB} MB)
            <input type="file" name="archivo" accept="image/gif,image/webp,image/png,image/jpeg,video/mp4,video/webm"></label>
          <label>o enlace externo<input type="url" name="gif_url" value="${esc(x.gif_path ? '' : x.gif_url)}" placeholder="https://…"></label>
        </div>
      </div>
      <label>Nombre<input name="nombre" required value="${esc(x.nombre)}" placeholder="Ej.: Sentadilla goblet"></label>
      <div class="dos">
        <label>Categoría<select name="categoria_id"><option value="">Sin categoría</option>
          ${state.categorias.map((c) => `<option value="${c.id}" ${c.id === x.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
        </select></label>
        <label>Nivel<select name="nivel"><option value="">Sin definir</option>
          ${NIVELES.map((n) => `<option value="${n.v}" ${n.v === x.nivel ? 'selected' : ''}>${n.t}</option>`).join('')}
        </select></label>
      </div>
      <div class="grupo"><span class="leyenda">Zona muscular</span>${checks('zonas', ZONAS, x.grupos_musculares)}</div>
      <div class="grupo"><span class="leyenda">Tipo de estímulo</span>${checks('estimulos', ESTIMULOS, x.estimulos)}</div>
      <div class="grupo"><span class="leyenda">Plano</span>${checks('planos', PLANOS, x.planos)}</div>
      <div class="grupo"><span class="leyenda">Impacto</span>${checks('impacto', [{ v: '', t: 'Sin definir' }, ...IMPACTOS], [x.impacto ?? ''], 'radio')}</div>
      <div class="grupo"><span class="leyenda">Material</span>${checks('material', MATERIAL, x.material)}</div>
      <label>Instrucciones<textarea name="instrucciones" rows="3" placeholder="Puntos clave de la técnica">${esc(x.instrucciones)}</textarea></label>
    </fieldset>
    ${propio ? `<div class="acciones">
      ${e ? '<button type="button" class="btn-txt peligro" id="borrar-ej">Borrar ejercicio</button>' : ''}
      <span class="hueco"></span>
      <button type="submit" class="btn btn-pri" id="guardar-ej">Guardar ejercicio</button>
    </div>` : '<p class="dlg-txt">Este ejercicio lo creó otra persona; solo ella puede editarlo.</p>'}
  </form>`;

  const form = $('#f-ej');
  form.archivo.onchange = () => {
    const file = form.archivo.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    $('#previa').innerHTML = file.type.startsWith('video/')
      ? `<video src="${url}" autoplay loop muted playsinline></video>` : `<img src="${url}" alt="">`;
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const btn = $('#guardar-ej');
    const fila = {
      nombre: fd.get('nombre').trim(),
      categoria_id: fd.get('categoria_id') ? +fd.get('categoria_id') : null,
      nivel: fd.get('nivel') || null,
      grupos_musculares: fd.getAll('zonas'),
      estimulos: fd.getAll('estimulos'),
      planos: fd.getAll('planos'),
      material: fd.getAll('material'),
      impacto: fd.get('impacto') || null,
      instrucciones: fd.get('instrucciones').trim() || null,
      gif_url: fd.get('gif_url').trim() || null,
    };
    if (fila.gif_url && e?.gif_path) fila.gif_path = null;

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    const file = fd.get('archivo');
    if (file && file.size) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast(`El archivo pesa más de ${MAX_MB} MB.`);
        btn.disabled = false; btn.textContent = 'Guardar ejercicio';
        return;
      }
      const ext = (file.name.split('.').pop() || 'gif').toLowerCase();
      const path = `${state.user.id}/${uid()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (up.error) {
        toast(`No se pudo subir el archivo: ${up.error.message}`);
        btn.disabled = false; btn.textContent = 'Guardar ejercicio';
        return;
      }
      fila.gif_path = path;
      fila.gif_url = null;
    }

    const res = e
      ? await sb.from('ejercicios').update(fila).eq('id', e.id).select().single()
      : await sb.from('ejercicios').insert(fila).select().single();
    if (res.error) {
      toast(`No se pudo guardar: ${res.error.message}`);
      btn.disabled = false; btn.textContent = 'Guardar ejercicio';
      return;
    }
    if (e?.gif_path && fila.gif_path !== undefined && fila.gif_path !== e.gif_path) {
      await sb.storage.from(BUCKET).remove([e.gif_path]);
    }
    const i = state.ejercicios.findIndex((z) => z.id === res.data.id);
    if (i >= 0) state.ejercicios[i] = res.data; else state.ejercicios.push(res.data);
    state.ejercicios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    dlg.close();
    toast('Ejercicio guardado');
    renderBiblioteca();
  };

  const borrar = $('#borrar-ej');
  if (borrar) borrar.onclick = async () => {
    if (!confirm(`¿Borrar «${e.nombre}»?`)) return;
    const { error } = await sb.from('ejercicios').delete().eq('id', e.id);
    if (error) {
      toast(error.code === '23503'
        ? 'Este ejercicio está en alguna sesión guardada. Quítalo de esas sesiones antes de borrarlo.'
        : error.message);
      return;
    }
    if (e.gif_path) await sb.storage.from(BUCKET).remove([e.gif_path]);
    state.ejercicios = state.ejercicios.filter((z) => z.id !== e.id);
    dlg.close();
    toast('Ejercicio borrado');
    renderBiblioteca();
  };
  dlg.showModal();
}

/* ---------- eventos globales ---------- */
dlg.addEventListener('click', (ev) => {
  if (ev.target === dlg || ev.target.closest('[data-cerrar]')) dlg.close();
});
$('#salir').onclick = () => sb.auth.signOut();
window.addEventListener('hashchange', ruta);

const { data: { session } } = await sb.auth.getSession();
state.user = session?.user ?? null;
sb.auth.onAuthStateChange((_ev, s) => {
  const antes = state.user?.id;
  state.user = s?.user ?? null;
  if (antes !== state.user?.id) arrancar();
});
arrancar();
