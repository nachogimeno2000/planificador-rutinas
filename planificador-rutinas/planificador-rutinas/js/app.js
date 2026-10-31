import {
  sb, esc, norm, mediaHTML, mediaUrl, esVideo, verAttr, cropStyle, toast, activarVisor,
} from './supa.js';
import { BUCKET, MAX_MB } from './config.js';
import {
  ZONAS, ESTIMULOS, PLANOS, IMPACTOS, MATERIAL, LATERALIDAD, NIVELES, BLOQUES, AGRUPAR,
  PRESCRIPCION, PRESCRIPCION_BASE, nombreGrupo,
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
const esUuid = (v) => /^[0-9a-f-]{36}$/i.test(v || '');
const svg = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  arriba: svg('<path d="m6 14 6-6 6 6"/>'),
  abajo: svg('<path d="m6 10 6 6 6-6"/>'),
  cambiar: svg('<path d="M4 9h13l-3-3M20 15H7l3 3"/>'),
  quitar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  hecho: svg('<path d="m5 12 5 5 9-10"/>'),
  nota: svg('<path d="M5 4h14v12l-4 4H5z"/><path d="M9 9h6M9 13h4"/>'),
  enlace: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  tv: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>'),
  carpeta: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
};

/* ---------- estado ---------- */
const nuevaSesion = (carpeta_id = null, cabecera = [], tv_columnas = []) => ({
  id: null, titulo: '', fecha: hoy(), objetivo: '', duracion_min: '', intensidad: '',
  notas: '', publica: false, slug: null, carpeta_id, cabecera, tv_columnas, items: [],
});

const state = {
  user: null,
  ejercicios: [],
  categorias: [],
  carpetas: [],
  plantilla: { cabecera: [], tv_columnas: [] },
  sesion: nuevaSesion(),
  gen: {
    n: 6, agrupar: 1, bloque: 'principal', q: '',
    zonas: new Set(), estimulos: new Set(), lateralidad: new Set(),
    planos: new Set(), impacto: new Set(), material: new Set(),
  },
  abiertos: new Set(['zonas', 'estimulos']),
  bib: { q: '', zonas: new Set(), estimulos: new Set() },
  carpetaVista: 'todas',
};

const ejById = (id) => state.ejercicios.find((e) => e.id === id);

// Una sesión nueva hereda los títulos de cabecera y columnas de la última que guardaste.
const sesionEnBlanco = () => nuevaSesion(
  esUuid(state.carpetaVista) ? state.carpetaVista : null,
  state.plantilla.cabecera.map((c) => ({ etiqueta: c.etiqueta, valor: '' })),
  [...state.plantilla.tv_columnas],
);

const FILTROS = [
  { clave: 'zonas', titulo: 'Zona muscular', opciones: ZONAS, campo: (e) => e.grupos_musculares },
  { clave: 'estimulos', titulo: 'Tipo de estímulo', opciones: ESTIMULOS, campo: (e) => e.estimulos },
  { clave: 'lateralidad', titulo: 'Unilateral o bilateral', opciones: LATERALIDAD, campo: (e) => [e.lateralidad] },
  { clave: 'material', titulo: 'Material', opciones: MATERIAL, campo: (e) => e.material },
  { clave: 'planos', titulo: 'Plano', opciones: PLANOS, campo: (e) => e.planos },
  { clave: 'impacto', titulo: 'Impacto', opciones: IMPACTOS, campo: (e) => [e.impacto] },
];

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
  state.sesion = sesionEnBlanco();
  ruta();
}

async function cargarDatos() {
  const [ej, cat, carp, ult] = await Promise.all([
    sb.from('ejercicios').select('*').order('nombre'),
    sb.from('categorias').select('*').order('orden'),
    sb.from('carpetas').select('*').order('nombre'),
    sb.from('sesiones').select('cabecera, tv_columnas').order('updated_at', { ascending: false }).limit(1),
  ]);
  if (ej.error) toast(`No se pudo cargar la biblioteca: ${ej.error.message}`);
  state.ejercicios = ej.data || [];
  state.categorias = cat.data || [];
  state.carpetas = carp.data || [];
  const u = ult.data?.[0];
  if (u) state.plantilla = { cabecera: u.cabecera || [], tv_columnas: u.tv_columnas || [] };
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
function candidatos(g = state.gen) {
  return state.ejercicios.filter((e) => FILTROS.every((f) => cruza(g[f.clave], f.campo(e))));
}

function grupoFiltro(f) {
  const set = state.gen[f.clave];
  const abierto = state.abiertos.has(f.clave) || set.size > 0;
  const chips = f.opciones.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const t = typeof o === 'string' ? o : o.t;
    return `<button type="button" class="chip" data-grupo="${f.clave}" data-valor="${esc(v)}"
      aria-pressed="${set.has(v)}">${esc(t)}</button>`;
  }).join('');
  return `<details class="grupo-f" data-f="${f.clave}" ${abierto ? 'open' : ''}>
    <summary>${f.titulo}<span class="cuenta" data-cuenta="${f.clave}">${set.size || ''}</span></summary>
    <div class="chips">${chips}</div>
  </details>`;
}

function opcionesCarpeta(sel) {
  return `<option value="">Sin carpeta</option>${state.carpetas.map((c) =>
    `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
}

function renderSesion() {
  const s = state.sesion;
  const g = state.gen;
  vista.innerHTML = `
  <section class="constructor">
    <div class="panel-izq" data-tab="${state.tab || 'filtros'}">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab-btn="filtros" aria-selected="${(state.tab || 'filtros') === 'filtros'}">Filtros</button>
        <button type="button" role="tab" data-tab-btn="resultados" aria-selected="${state.tab === 'resultados'}">Ejercicios <span id="tab-n"></span></button>
      </div>

      <aside class="consola" aria-label="Filtros">
        <div class="filtros">${FILTROS.map(grupoFiltro).join('')}</div>
        <div class="consola-pie">
          <div class="pie-fila">
            <span class="leyenda">Ejercicios</span>
            <div class="paso-grupo">
              <button type="button" class="paso" data-acc="menos" aria-label="Un ejercicio menos">−</button>
              <output id="n-ej" aria-live="polite">${g.n}</output>
              <button type="button" class="paso" data-acc="mas" aria-label="Un ejercicio más">+</button>
            </div>
          </div>
          <div class="segmentos s4" role="group" aria-label="Agrupar en">${AGRUPAR.map((a) => `
            <button type="button" class="seg" data-agrupar="${a.v}" aria-pressed="${g.agrupar === a.v}">${a.t}</button>`).join('')}
          </div>
          <div class="segmentos" role="group" aria-label="Añadir a">${BLOQUES.map((b) => `
            <button type="button" class="seg" data-bloque="${b.v}" aria-pressed="${g.bloque === b.v}">${b.t}</button>`).join('')}
          </div>
          <p class="coincide" id="coincide"></p>
          <button type="button" class="btn-generar" data-acc="generar">Generar sesión</button>
          <button type="button" class="btn-txt limpiar" data-acc="limpiar">Quitar filtros</button>
        </div>
      </aside>

      <section class="resultados" aria-labelledby="res-n">
        <div class="res-cab">
          <h2 id="res-n"></h2>
          <input type="search" id="res-q" value="${esc(g.q)}" placeholder="Buscar en la lista" aria-label="Buscar en la lista">
        </div>
        <ul class="res-lista" id="res-lista"></ul>
        <button type="button" class="btn-txt res-todo" data-acc="anadir">Buscar en toda la biblioteca</button>
      </section>
    </div>

    <div class="hoja">
      <div class="hoja-barra">
        <input class="titulo-sesion" data-s="titulo" value="${esc(s.titulo)}" placeholder="Título de la sesión" aria-label="Título de la sesión">
        <input type="date" class="barra-fecha" data-s="fecha" value="${esc(s.fecha || '')}" aria-label="Fecha">
        <select class="barra-carpeta" data-s="carpeta_id" aria-label="Carpeta">${opcionesCarpeta(s.carpeta_id)}</select>
        <div class="barra-acc">
          <button type="button" class="btn-txt" data-acc="nueva">Nueva</button>
          <button type="button" class="btn" data-acc="compartir">Compartir</button>
          <button type="button" class="btn" data-acc="tv">${ICON.tv} TV</button>
          <button type="button" class="btn btn-pri" data-acc="guardar">Guardar</button>
        </div>
      </div>

      <details class="detalles" ${state.detallesAbiertos ? 'open' : ''}>
        <summary>Detalles, notas y cabecera de la TV</summary>
        <div class="detalles-cuerpo">
          <div class="det-col">
            <div class="det-fila">
              <label>Duración (min)<input type="number" min="1" data-s="duracion_min" value="${esc(s.duracion_min)}"></label>
              <label>Intensidad (1–10)<input type="number" min="1" max="10" data-s="intensidad" value="${esc(s.intensidad)}"></label>
            </div>
            <label>Objetivo<input data-s="objetivo" value="${esc(s.objetivo)}" placeholder="Ej.: fuerza de tren inferior"></label>
            <label>Notas para la sesión
              <textarea data-s="notas" rows="3" placeholder="Salen en el cuadro de notas de la TV">${esc(s.notas)}</textarea></label>
          </div>
          <div class="det-col">
            <span class="leyenda">Datos de cabecera (TV)</span>
            <div id="cab-filas" class="cab-filas"></div>
            <button type="button" class="btn-txt" data-acc="cab-anadir">${ICON.mas} Añadir dato</button>
            <span class="leyenda">Títulos de columna (TV)</span>
            <div class="cols-tv">${[0, 1, 2, 3].map((i) => `
              <input data-col="${i}" value="${esc(s.tv_columnas[i] || '')}" placeholder="Columna ${i + 1}" aria-label="Título de la columna ${i + 1}">`).join('')}
            </div>
          </div>
        </div>
      </details>

      <div id="items" class="items"></div>
    </div>
  </section>`;
  renderCabecera();
  renderItems();
  medirBarra();

  const raiz = $('.constructor');
  raiz.addEventListener('click', clickConstructor);
  raiz.addEventListener('toggle', (ev) => {
    const d = ev.target.closest?.('.grupo-f');
    if (d) d.open ? state.abiertos.add(d.dataset.f) : state.abiertos.delete(d.dataset.f);
    if (ev.target.classList?.contains('detalles')) state.detallesAbiertos = ev.target.open;
  }, true);
  raiz.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'res-q') { g.q = t.value; renderResultados(); return; }
    if (t.dataset.s) state.sesion[t.dataset.s] = t.value;
    if (t.dataset.col) state.sesion.tv_columnas[+t.dataset.col] = t.value;
    if (t.dataset.cab) state.sesion.cabecera[+t.dataset.cab][t.dataset.k] = t.value;
    if (t.dataset.campo) {
      const item = state.sesion.items.find((i) => i.key === t.closest('.item').dataset.key);
      if (item) item[t.dataset.campo] = t.value;
    }
  });
}

// La mesa de trabajo ocupa exactamente la pantalla bajo la barra superior.
function medirBarra() {
  const top = $('.top');
  if (top) document.documentElement.style.setProperty('--top', `${top.offsetHeight}px`);
}
window.addEventListener('resize', medirBarra);

function renderCabecera() {
  const cont = $('#cab-filas');
  if (!cont) return;
  const cab = state.sesion.cabecera;
  cont.innerHTML = cab.length ? cab.map((c, i) => `
    <div class="cab-fila">
      <input data-cab="${i}" data-k="etiqueta" value="${esc(c.etiqueta)}" placeholder="Dato (ej.: Semana)" aria-label="Nombre del dato">
      <input data-cab="${i}" data-k="valor" value="${esc(c.valor)}" placeholder="Valor" aria-label="Valor de ${esc(c.etiqueta || 'dato')}">
      <button type="button" class="ico" data-acc="cab-quitar" data-i="${i}" aria-label="Quitar dato">${ICON.quitar}</button>
    </div>`).join('')
    : '<p class="vacio-mini">Ej.: Semana 11, Sesión 47, Jugadores 26.</p>';
}

function actualizarCoincidencias(n) {
  const el = $('#coincide');
  if (!el) return;
  const g = state.gen;
  if (!state.ejercicios.length) el.textContent = 'Tu biblioteca aún está vacía.';
  else el.textContent = n < g.n
    ? `Solo ${n} encajan: se generarán ${n}.`
    : `Se elegirán ${g.n} de ${n} al azar.`;
  el.classList.toggle('poco', n < g.n);
}

function renderResultados() {
  const ul = $('#res-lista');
  if (!ul) return;
  const g = state.gen;
  const base = candidatos();
  actualizarCoincidencias(base.length);
  const q = norm(g.q.trim());
  const lista = q ? base.filter((e) => norm(e.nombre).includes(q)) : base;
  const filtrando = FILTROS.some((f) => g[f.clave].size);
  $('#tab-n').textContent = lista.length;
  $('#res-n').textContent = filtrando || q
    ? `${lista.length} ${lista.length === 1 ? 'ejercicio encaja' : 'ejercicios encajan'}`
    : `Toda la biblioteca (${lista.length})`;
  const enSesion = new Set(state.sesion.items.map((i) => i.ejercicio_id));
  const bloque = BLOQUES.find((b) => b.v === g.bloque).t.toLowerCase();
  ul.innerHTML = lista.length ? lista.map((e) => {
    const en = enSesion.has(e.id);
    const det = [...(e.grupos_musculares || []), ...(e.estimulos || [])].join(', ');
    return `<li class="res-fila${en ? ' en' : ''}">
      <span class="media mini"${verAttr(e)}>${mediaHTML(e)}</span>
      <span class="res-txt"><strong>${esc(e.nombre)}</strong>
        <small>${esc(det)}${e.lateralidad === 'unilateral' ? ' · Unilateral' : ''}</small></span>
      <button type="button" class="ico res-mas" data-anadir="${e.id}"
        aria-label="Añadir ${esc(e.nombre)} a ${bloque}${en ? ' (ya está en la sesión)' : ''}">${en ? ICON.hecho : ICON.mas}</button>
    </li>`;
  }).join('')
    : `<li class="vacio-mini">${state.ejercicios.length ? 'Ningún ejercicio encaja. Quita algún filtro.' : 'Tu biblioteca está vacía.'}</li>`;
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
    $(`[data-cuenta="${b.dataset.grupo}"]`).textContent = set.size || '';
    return renderResultados();
  }
  if (b.dataset.bloque) {
    g.bloque = b.dataset.bloque;
    document.querySelectorAll('[data-bloque]').forEach((x) =>
      x.setAttribute('aria-pressed', x.dataset.bloque === g.bloque));
    return renderResultados();
  }
  if (b.dataset.agrupar) {
    g.agrupar = +b.dataset.agrupar;
    document.querySelectorAll('[data-agrupar]').forEach((x) =>
      x.setAttribute('aria-pressed', +x.dataset.agrupar === g.agrupar));
    return;
  }
  if (b.dataset.anadir) {
    anadirItem(ejById(b.dataset.anadir));
    return;
  }
  if (b.dataset.tabBtn) {
    state.tab = b.dataset.tabBtn;
    $('.panel-izq').dataset.tab = state.tab;
    document.querySelectorAll('[data-tab-btn]').forEach((x) => x.setAttribute('aria-selected', x === b));
    return;
  }
  const item = b.closest('.item') && state.sesion.items.find((i) => i.key === b.closest('.item').dataset.key);

  switch (b.dataset.acc) {
    case 'menos': g.n = Math.max(1, g.n - 1); $('#n-ej').value = g.n; renderResultados(); break;
    case 'mas': g.n = Math.min(24, g.n + 1); $('#n-ej').value = g.n; renderResultados(); break;
    case 'generar': generar(); break;
    case 'limpiar':
      FILTROS.forEach((f) => g[f.clave].clear());
      g.q = '';
      $('#res-q').value = '';
      document.querySelectorAll('.consola [data-grupo]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      document.querySelectorAll('[data-cuenta]').forEach((x) => { x.textContent = ''; });
      renderResultados();
      break;
    case 'subir': mover(item, -1); break;
    case 'bajar': mover(item, 1); break;
    case 'cambiar': cambiar(item); break;
    case 'quitar': quitarItem(item); break;
    case 'nota': {
      const inp = b.closest('.item').querySelector('.nota-item');
      if (inp.classList.contains('oculta') || !item.notas) {
        const ver = inp.classList.contains('oculta');
        inp.classList.toggle('oculta', !ver);
        item.verNota = ver;
        b.setAttribute('aria-pressed', ver);
        if (ver) inp.focus();
      } else inp.focus();
      break;
    }
    case 'enlazar': {
      const it = state.sesion.items.find((i) => i.key === b.dataset.key);
      if (it) { it.enlazado = !it.enlazado; renderItems(); }
      break;
    }
    case 'cab-anadir':
      state.sesion.cabecera.push({ etiqueta: '', valor: '' });
      renderCabecera();
      $(`#cab-filas .cab-fila:last-child input`)?.focus();
      break;
    case 'cab-quitar':
      state.sesion.cabecera.splice(+b.dataset.i, 1);
      renderCabecera();
      break;
    case 'anadir': abrirSelector(); break;
    case 'guardar': guardar(); break;
    case 'compartir': compartir(); break;
    case 'tv': abrirTV(); break;
    case 'nueva':
      if (state.sesion.items.length && !confirm('¿Empezar una sesión nueva? Lo que no hayas guardado se perderá.')) return;
      state.sesion = sesionEnBlanco();
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
  key: uid(), ejercicio_id: e.id, bloque, carga: '', notas: '', enlazado: false, ...prescripcionPara(e),
});

function anadirItem(e) {
  if (!e) return;
  state.sesion.items.push(nuevoItem(e, state.gen.bloque));
  renderItems();
  toast(`${e.nombre} añadido`);
}

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
  const nuevos = elegidos.map((e, i) => ({
    ...nuevoItem(e, g.bloque),
    enlazado: g.agrupar > 1 && (i + 1) % g.agrupar !== 0 && i < elegidos.length - 1,
  }));
  state.sesion.items = state.sesion.items.filter((i) => i.bloque !== g.bloque).concat(nuevos);
  renderItems(true);
  if (matchMedia('(max-width: 980px)').matches) {
    $('#items').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  if (elegidos.length < g.n) toast(`Solo hay ${elegidos.length} ejercicios con estos filtros.`);
}

// El enlace (superserie) pertenece a la posición, no al ejercicio: al mover, el ejercicio cambia de hueco.
function mover(item, dir) {
  const items = state.sesion.items;
  const mismos = items.filter((i) => i.bloque === item.bloque);
  const otro = mismos[mismos.indexOf(item) + dir];
  if (!otro) return;
  const a = items.indexOf(item);
  const b = items.indexOf(otro);
  [items[a], items[b]] = [items[b], items[a]];
  [item.enlazado, otro.enlazado] = [otro.enlazado, item.enlazado];
  renderItems();
}

function quitarItem(item) {
  const items = state.sesion.items;
  const mismos = items.filter((i) => i.bloque === item.bloque);
  const prev = mismos[mismos.indexOf(item) - 1];
  if (prev && !item.enlazado) prev.enlazado = false;
  state.sesion.items = items.filter((i) => i !== item);
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

function gruposDe(lista) {
  const out = [];
  let cur = [];
  lista.forEach((it, idx) => {
    cur.push(it);
    if (!it.enlazado || idx === lista.length - 1) { out.push(cur); cur = []; }
  });
  return out;
}

function normalizar() {
  BLOQUES.forEach((b) => {
    const del = state.sesion.items.filter((i) => i.bloque === b.v);
    if (del.length) del[del.length - 1].enlazado = false;
  });
}

function itemHTML(i, pos, idx, total, animar, n, codigo, enGrupo) {
  const e = ejById(i.ejercicio_id) || { nombre: 'Ejercicio eliminado' };
  const notaVisible = !!i.notas || i.verNota;
  const ultimoDelBloque = idx === total - 1;
  return `<article class="item${animar ? ' entra' : ''}${enGrupo ? ' en-grupo' : ''}" style="--i:${n}" data-key="${i.key}">
    <span class="item-cod">${codigo}</span>
    <div class="media"${verAttr(e)}>${mediaHTML(e)}</div>
    <div class="item-cuerpo">
      <h3>${esc(e.nombre)}${e.lateralidad === 'unilateral' ? ' <span class="badge">UNI</span>' : ''}</h3>
      <p class="tags">${esc([...(e.grupos_musculares || []), ...(e.estimulos || [])].join(', '))}</p>
      <input class="nota-item${notaVisible ? '' : ' oculta'}" data-campo="notas" value="${esc(i.notas)}"
        placeholder="Nota: ej. algo más de peso con la izquierda" aria-label="Nota para ${esc(e.nombre)}">
    </div>
    <input type="number" min="1" data-campo="series" value="${esc(i.series)}" aria-label="Series">
    <input data-campo="repeticiones" value="${esc(i.repeticiones)}" aria-label="Repeticiones o tiempo">
    <input type="number" min="0" step="15" data-campo="descanso_seg" value="${esc(i.descanso_seg)}" aria-label="Descanso en segundos">
    <input data-campo="carga" value="${esc(i.carga)}" placeholder="—" aria-label="Carga">
    <div class="item-acc">
      <span class="flechas">
        <button type="button" class="ico mini-ico" data-acc="subir" aria-label="Subir" ${idx === 0 ? 'disabled' : ''}>${ICON.arriba}</button>
        <button type="button" class="ico mini-ico" data-acc="bajar" aria-label="Bajar" ${ultimoDelBloque ? 'disabled' : ''}>${ICON.abajo}</button>
      </span>
      <button type="button" class="ico" data-acc="enlazar" data-key="${i.key}" aria-pressed="${i.enlazado}"
        aria-label="${i.enlazado ? 'Separar del siguiente' : 'Enlazar con el siguiente'}" title="${i.enlazado ? 'Separar del siguiente' : 'Enlazar con el siguiente'}"
        ${ultimoDelBloque ? 'disabled' : ''}>${ICON.enlace}</button>
      <button type="button" class="ico" data-acc="cambiar" aria-label="Cambiar por otro ejercicio" title="Cambiar por otro">${ICON.cambiar}</button>
      <button type="button" class="ico" data-acc="nota" aria-label="Añadir una nota" title="Nota" aria-pressed="${notaVisible}">${ICON.nota}</button>
      <button type="button" class="ico" data-acc="quitar" aria-label="Quitar de la sesión" title="Quitar">${ICON.quitar}</button>
    </div>
  </article>`;
}

function renderItems(animar = false) {
  const cont = $('#items');
  if (!cont) return;
  normalizar();
  renderResultados();
  const items = state.sesion.items;
  if (!items.length) {
    cont.innerHTML = state.ejercicios.length
      ? `<div class="vacio"><p>Marca filtros, añade ejercicios de la lista con <strong>+</strong>
          o pulsa <strong>Generar sesión</strong> para que la app los elija.</p></div>`
      : `<div class="vacio"><p>Tu biblioteca está vacía. Sube tu primer ejercicio con su vídeo para empezar.</p>
          <a class="btn btn-pri" href="#/biblioteca">Ir a la biblioteca</a></div>`;
    return;
  }
  let n = 0;
  let num = 0;
  cont.innerHTML = BLOQUES.map((b) => {
    const del = items.filter((i) => i.bloque === b.v);
    if (!del.length) return '';
    let idx = 0;
    const html = gruposDe(del).map((gr) => {
      num += 1;
      const filas = gr.map((i, k) => itemHTML(i, k, idx++, del.length, animar, n++,
        gr.length > 1 ? `${num}${'abcdefgh'[k] || ''}` : `${num}`, gr.length > 1)).join('');
      return gr.length > 1
        ? `<div class="grupo-ej" data-tam="${gr.length}"><span class="grupo-tit">${nombreGrupo(gr.length)}</span>${filas}</div>`
        : filas;
    }).join('');
    return `<section class="bloque">
      <div class="bloque-cab"><h2>${b.t} <span>${del.length}</span></h2>
        <span>Series</span><span>Reps</span><span>Desc. (s)</span><span>Carga</span><span></span></div>
      ${html}
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
      <input type="search" id="sel-q" placeholder="Buscar por nombre o zona en toda la biblioteca" aria-label="Buscar ejercicio">
      <div id="sel-lista" class="sel-lista"></div>
    </div>`;
  const pintar = () => {
    const q = norm($('#sel-q').value.trim());
    const lista = state.ejercicios.filter((e) => !q
      || norm(e.nombre).includes(q)
      || (e.grupos_musculares || []).some((z) => norm(z).includes(q)));
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
    if (f) anadirItem(ejById(f.dataset.id));
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
  normalizar();
  const intensidad = num(s.intensidad, 1);
  const cols = s.tv_columnas.map((c) => (c || '').trim());
  while (cols.length && !cols[cols.length - 1]) cols.pop();
  const fila = {
    titulo: s.titulo.trim(),
    fecha: s.fecha || null,
    objetivo: s.objetivo?.trim() || null,
    duracion_min: num(s.duracion_min, 1),
    intensidad: intensidad == null ? null : Math.min(10, intensidad),
    notas: s.notas?.trim() || null,
    publica: s.publica,
    carpeta_id: s.carpeta_id || null,
    cabecera: s.cabecera
      .map((c) => ({ etiqueta: (c.etiqueta || '').trim(), valor: (c.valor || '').trim() }))
      .filter((c) => c.etiqueta || c.valor),
    tv_columnas: cols,
  };
  const res = s.id
    ? await sb.from('sesiones').update(fila).eq('id', s.id).select().single()
    : await sb.from('sesiones').insert(fila).select().single();
  if (res.error) { toast(`No se pudo guardar: ${res.error.message}`); return false; }
  s.id = res.data.id;
  s.slug = res.data.slug;
  state.plantilla = { cabecera: fila.cabecera, tv_columnas: fila.tv_columnas };

  const del = await sb.from('sesion_ejercicios').delete().eq('sesion_id', s.id);
  if (del.error) { toast(`No se pudo guardar: ${del.error.message}`); return false; }
  const orden = {};
  const grupo = {};
  const filas = [];
  BLOQUES.forEach((b) => {
    s.items.filter((i) => i.bloque === b.v).forEach((i) => {
      grupo[b.v] = grupo[b.v] ?? 1;
      filas.push({
        sesion_id: s.id,
        ejercicio_id: i.ejercicio_id,
        bloque: i.bloque,
        orden: (orden[b.v] = (orden[b.v] ?? -1) + 1),
        grupo: grupo[b.v],
        series: num(i.series, 1),
        repeticiones: String(i.repeticiones ?? '').trim() || null,
        descanso_seg: num(i.descanso_seg, 0),
        carga: String(i.carga ?? '').trim() || null,
        notas: String(i.notas ?? '').trim() || null,
      });
      if (!i.enlazado) grupo[b.v] += 1;
    });
  });
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
  const lineas = data.sesion_ejercicios
    .sort((a, b) => ordenBloque[a.bloque] - ordenBloque[b.bloque] || a.orden - b.orden);
  state.sesion = {
    id: data.id, titulo: data.titulo, fecha: data.fecha, objetivo: data.objetivo || '',
    duracion_min: data.duracion_min ?? '', intensidad: data.intensidad ?? '', notas: data.notas || '',
    publica: data.publica, slug: data.slug, carpeta_id: data.carpeta_id,
    cabecera: (data.cabecera || []).map((c) => ({ ...c })),
    tv_columnas: [...(data.tv_columnas || [])],
    items: lineas.map((l, k) => {
      const sig = lineas[k + 1];
      return {
        key: uid(), ejercicio_id: l.ejercicio_id, bloque: l.bloque, series: l.series ?? '',
        repeticiones: l.repeticiones ?? '', descanso_seg: l.descanso_seg ?? '', carga: l.carga ?? '', notas: l.notas ?? '',
        enlazado: !!sig && sig.bloque === l.bloque && l.grupo != null && sig.grupo === l.grupo,
      };
    }),
  };
  renderSesion();
}

async function publicar(s) {
  if (s.publica) return true;
  const { error } = await sb.from('sesiones').update({ publica: true }).eq('id', s.id);
  if (error) { toast(`No se pudo compartir: ${error.message}`); return false; }
  s.publica = true;
  return true;
}

const enlaceFicha = (slug) => `${location.origin}/f/${slug}`;
const enlaceTV = (slug) => `${location.origin}/tv/${slug}`;

async function abrirTV() {
  const s = state.sesion;
  if (!s.items.length) { toast('Añade ejercicios antes de abrir la vista TV.'); return; }
  const w = window.open('', '_blank');
  if (!(await guardar({ silencioso: true })) || !(await publicar(s))) { w?.close(); return; }
  if (w) w.location.href = enlaceTV(s.slug);
  else location.href = enlaceTV(s.slug);
}

async function compartir() {
  const s = state.sesion;
  if (!s.items.length) { toast('Añade ejercicios antes de compartir la ficha.'); return; }
  if (!(await guardar({ silencioso: true })) || !(await publicar(s))) return;
  const url = enlaceFicha(s.slug);
  dlg.innerHTML = `
    <div class="dlg-cuerpo">
      <div class="dlg-cab"><h2>Ficha compartida</h2>
        <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
      <p class="dlg-txt">Cualquiera con este enlace puede ver la ficha, sin cuenta.</p>
      <div class="enlace-copiar"><input readonly value="${esc(url)}" aria-label="Enlace de la ficha">
        <button type="button" class="btn btn-pri" id="copiar">Copiar enlace</button></div>
      <div class="acciones">
        <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Abrir ficha</a>
        <a class="btn" href="${esc(enlaceTV(s.slug))}" target="_blank" rel="noopener">${ICON.tv} Vista TV</a>
        <span class="hueco"></span>
        <button type="button" class="btn-txt" id="dejar">Dejar de compartir</button>
      </div>
    </div>`;
  $('#copiar').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); }
    catch { $('.enlace-copiar input').select(); }
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
   MIS SESIONES Y CARPETAS
   ====================================================================== */
function pedirNombre(titulo, valor = '', boton = 'Guardar') {
  return new Promise((resolve) => {
    dlg.innerHTML = `
      <form class="dlg-cuerpo dlg-corto" id="f-nombre">
        <div class="dlg-cab"><h2>${esc(titulo)}</h2>
          <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
        <label>Nombre<input name="nombre" required maxlength="60" value="${esc(valor)}"></label>
        <div class="acciones"><span class="hueco"></span><button class="btn btn-pri" type="submit">${esc(boton)}</button></div>
      </form>`;
    let hecho = false;
    $('#f-nombre').onsubmit = (ev) => {
      ev.preventDefault();
      hecho = true;
      resolve(new FormData(ev.target).get('nombre').trim());
      dlg.close();
    };
    dlg.addEventListener('close', () => { if (!hecho) resolve(null); }, { once: true });
    dlg.showModal();
    dlg.querySelector('input').select();
  });
}

async function renderSesiones() {
  vista.innerHTML = '<p class="cargando">Cargando sesiones…</p>';
  const { data, error } = await sb.from('sesiones')
    .select('id, titulo, fecha, objetivo, publica, slug, carpeta_id, sesion_ejercicios(count)')
    .order('fecha', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { vista.innerHTML = `<p class="cargando">No se pudieron cargar: ${esc(error.message)}</p>`; return; }
  let sesiones = data;
  if (state.carpetaVista !== 'todas' && state.carpetaVista !== 'sin'
    && !state.carpetas.some((c) => c.id === state.carpetaVista)) state.carpetaVista = 'todas';

  const fmt = (f) => (f ? new Date(`${f}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha');

  const pintar = () => {
    const cv = state.carpetaVista;
    const cuenta = (id) => sesiones.filter((s) => (id === 'sin' ? !s.carpeta_id : s.carpeta_id === id)).length;
    const visibles = cv === 'todas' ? sesiones : sesiones.filter((s) => (cv === 'sin' ? !s.carpeta_id : s.carpeta_id === cv));
    const actual = state.carpetas.find((c) => c.id === cv);
    const boton = (id, nombre, n, icono = '') => `
      <button type="button" class="carpeta" data-c="${id}" ${cv === id ? 'aria-current="true"' : ''}>
        ${icono}<span class="carpeta-nombre">${esc(nombre)}</span><span class="carpeta-n">${n}</span></button>`;

    vista.innerHTML = `
    <section class="pagina">
      <div class="pagina-cab"><h1>Mis sesiones</h1>
        <a class="btn btn-pri" href="#/sesion" id="nueva-desde-lista">${ICON.mas} Nueva sesión</a></div>
      <div class="sesiones-layout">
        <nav class="carpetas" aria-label="Carpetas">
          ${boton('todas', 'Todas', sesiones.length)}
          ${boton('sin', 'Sin carpeta', cuenta('sin'))}
          ${state.carpetas.map((c) => boton(c.id, c.nombre, cuenta(c.id), ICON.carpeta)).join('')}
          <button type="button" class="btn-txt nueva-carpeta" id="nueva-carpeta">${ICON.mas} Nueva carpeta</button>
        </nav>
        <div class="sesiones-col">
          ${actual ? `<div class="carpeta-cab"><h2>${ICON.carpeta} ${esc(actual.nombre)}</h2>
            <button type="button" class="btn-txt" id="renombrar">Renombrar</button>
            <button type="button" class="btn-txt peligro" id="borrar-carpeta">Borrar carpeta</button></div>` : ''}
          ${visibles.length ? `<ul class="lista-sesiones">${visibles.map((s) => `
            <li data-id="${s.id}">
              <time>${fmt(s.fecha)}</time>
              <div class="ses-txt"><strong>${esc(s.titulo)}</strong>
                <small>${s.sesion_ejercicios[0]?.count ?? 0} ejercicios${s.objetivo ? `, ${esc(s.objetivo)}` : ''}</small></div>
              ${s.publica ? '<span class="estado">Compartida</span>' : '<span></span>'}
              <select class="mover" data-mover aria-label="Carpeta de ${esc(s.titulo)}">${opcionesCarpeta(s.carpeta_id)}</select>
              <div class="fila-acc">
                <a class="btn" href="#/sesion/${s.id}">Editar</a>
                <a class="btn-txt" href="/f/${s.slug}" target="_blank" rel="noopener">Ficha</a>
                <button type="button" class="btn-txt" data-tv>${ICON.tv} TV</button>
                <button type="button" class="ico" data-borrar aria-label="Borrar sesión">${ICON.quitar}</button>
              </div>
            </li>`).join('')}</ul>`
    : `<div class="vacio"><p>${cv === 'todas' ? 'Aún no has guardado ninguna sesión.' : 'No hay sesiones en esta carpeta.'}</p>
        <a class="btn btn-pri" href="#/sesion" id="crear-primera">Crear una sesión</a></div>`}
        </div>
      </div>
    </section>`;

    const nueva = () => { state.sesion = sesionEnBlanco(); };
    $('#nueva-desde-lista').onclick = nueva;
    if ($('#crear-primera')) $('#crear-primera').onclick = nueva;

    vista.querySelectorAll('.carpeta').forEach((b) => {
      b.onclick = () => { state.carpetaVista = b.dataset.c; pintar(); };
    });
    $('#nueva-carpeta').onclick = async () => {
      const nombre = await pedirNombre('Nueva carpeta', '', 'Crear carpeta');
      if (!nombre) return;
      const { data: c, error: e } = await sb.from('carpetas').insert({ nombre }).select().single();
      if (e) return toast(`No se pudo crear: ${e.message}`);
      state.carpetas.push(c);
      state.carpetas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      state.carpetaVista = c.id;
      pintar();
    };
    if (actual) {
      $('#renombrar').onclick = async () => {
        const nombre = await pedirNombre('Renombrar carpeta', actual.nombre);
        if (!nombre || nombre === actual.nombre) return;
        const { error: e } = await sb.from('carpetas').update({ nombre }).eq('id', actual.id);
        if (e) return toast(e.message);
        actual.nombre = nombre;
        state.carpetas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        pintar();
      };
      $('#borrar-carpeta').onclick = async () => {
        if (!confirm(`¿Borrar la carpeta «${actual.nombre}»? Sus sesiones no se borran: pasan a «Sin carpeta».`)) return;
        const { error: e } = await sb.from('carpetas').delete().eq('id', actual.id);
        if (e) return toast(e.message);
        state.carpetas = state.carpetas.filter((c) => c.id !== actual.id);
        sesiones = sesiones.map((s) => (s.carpeta_id === actual.id ? { ...s, carpeta_id: null } : s));
        if (state.sesion.carpeta_id === actual.id) state.sesion.carpeta_id = null;
        state.carpetaVista = 'todas';
        toast('Carpeta borrada');
        pintar();
      };
    }
    vista.querySelectorAll('[data-mover]').forEach((sel) => {
      sel.onchange = async () => {
        const id = sel.closest('li').dataset.id;
        const carpeta_id = sel.value || null;
        const { error: e } = await sb.from('sesiones').update({ carpeta_id }).eq('id', id);
        if (e) { toast(e.message); return pintar(); }
        sesiones = sesiones.map((s) => (s.id === id ? { ...s, carpeta_id } : s));
        if (state.sesion.id === id) state.sesion.carpeta_id = carpeta_id;
        const c = state.carpetas.find((x) => x.id === carpeta_id);
        toast(c ? `Movida a ${c.nombre}` : 'Movida a Sin carpeta');
        pintar();
      };
    });
    vista.querySelectorAll('[data-tv]').forEach((b) => {
      b.onclick = async () => {
        const s = sesiones.find((x) => x.id === b.closest('li').dataset.id);
        const w = window.open('', '_blank');
        if (!(await publicar(s))) { w?.close(); return; }
        if (w) w.location.href = enlaceTV(s.slug);
        pintar();
      };
    });
    vista.querySelectorAll('[data-borrar]').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('li').dataset.id;
        if (!confirm('¿Borrar esta sesión? No se puede deshacer.')) return;
        const { error: e } = await sb.from('sesiones').delete().eq('id', id);
        if (e) return toast(e.message);
        if (state.sesion.id === id) state.sesion = sesionEnBlanco();
        sesiones = sesiones.filter((s) => s.id !== id);
        toast('Sesión borrada');
        pintar();
      };
    });
  };
  pintar();
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
    const q = norm(f.q.trim());
    const lista = state.ejercicios.filter((e) =>
      (!q || norm(e.nombre).includes(q))
      && cruza(f.zonas, e.grupos_musculares) && cruza(f.estimulos, e.estimulos));
    $('#bib-n').textContent = `${lista.length} de ${state.ejercicios.length} ejercicios`;
    $('#rejilla').innerHTML = lista.length ? lista.map((e) => `
      <button type="button" class="tarjeta" data-id="${e.id}">
        <span class="media">${mediaHTML(e)}</span>
        <strong>${esc(e.nombre)}</strong>
        <small>${esc((e.grupos_musculares || []).join(', '))}${e.lateralidad ? ` · ${e.lateralidad === 'unilateral' ? 'Unilateral' : 'Bilateral'}` : ''}</small>
      </button>`).join('')
      : state.ejercicios.length
        ? '<p class="vacio-mini">Ningún ejercicio coincide. Quita algún filtro.</p>'
        : '<div class="vacio"><p>Aún no hay ejercicios. Sube el primero con su vídeo corto.</p></div>';
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

const r4 = (v) => Math.round(v * 10000) / 10000;

function formEjercicio(e = null) {
  const propio = !e || e.creado_por === state.user.id;
  const x = e || {};
  // Lo que se está previsualizando: el archivo guardado o uno recién elegido.
  const src = { url: mediaUrl(x), video: esVideo(mediaUrl(x)) };
  let enc = x.encuadre ? { ...x.encuadre } : null;
  let encTocado = false;

  dlg.innerHTML = `
  <form class="dlg-cuerpo" id="f-ej">
    <div class="dlg-cab"><h2>${e ? (propio ? 'Editar ejercicio' : esc(e.nombre)) : 'Nuevo ejercicio'}</h2>
      <button type="button" class="ico" data-cerrar aria-label="Cerrar">${ICON.quitar}</button></div>
    <fieldset ${propio ? '' : 'disabled'}>
      <div class="subida">
        <div class="previa-col">
          <div class="media grande" id="previa"></div>
          <button type="button" class="btn-txt" id="btn-encuadre" ${src.url ? '' : 'hidden'}>Ajustar encuadre</button>
        </div>
        <div class="subida-campos">
          <label>Vídeo corto o GIF (máx. ${MAX_MB} MB)
            <input type="file" name="archivo" accept="image/gif,image/webp,image/png,image/jpeg,video/mp4,video/webm"></label>
          <label>o enlace externo<input type="url" name="gif_url" value="${esc(x.gif_path ? '' : x.gif_url)}" placeholder="https://…"></label>
        </div>
      </div>
      <div class="encuadre-ed" id="encuadre-ed" hidden>
        <p class="dlg-txt">Arrastra el recuadro hasta la parte del vídeo que quieres que se vea en las fichas. Con el zoom lo acercas.</p>
        <div class="enc-lienzo"><div class="enc-cont" id="enc-cont"></div></div>
        <div class="enc-controles">
          <label class="enc-zoom">Zoom<input type="range" id="enc-zoom" min="1" max="3" step="0.05" value="1"></label>
          <button type="button" class="btn-txt" id="enc-centrar">Centrar</button>
          <button type="button" class="btn" id="enc-listo">Listo</button>
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
      <div class="grupo"><span class="leyenda">Unilateral o bilateral</span>${checks('lateralidad', [{ v: '', t: 'Sin definir' }, ...LATERALIDAD], [x.lateralidad ?? ''], 'radio')}</div>
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
  const previa = $('#previa');
  const pintarPrevia = () => {
    previa.innerHTML = mediaHTML({ nombre: x.nombre, url_previa: src.url, es_video: src.video, encuadre: enc });
  };
  pintarPrevia();

  /* ----- editor de encuadre ----- */
  const ed = $('#encuadre-ed');
  const cont = $('#enc-cont');
  const zoom = $('#enc-zoom');
  let nat = null;
  let marco = null;

  const colocar = () => {
    if (!marco || !enc) return;
    Object.assign(marco.style, {
      left: `${enc.x * 100}%`, top: `${enc.y * 100}%`, width: `${enc.w * 100}%`, height: `${enc.h * 100}%`,
    });
    const st = cropStyle(enc);
    const m = previa.querySelector('img, video');
    if (m) m.setAttribute('style', st);
  };
  const recortar = (cx, cy, z) => {
    const lado = Math.min(nat.w, nat.h) / z;
    const w = lado / nat.w;
    const h = lado / nat.h;
    enc = {
      x: r4(Math.min(Math.max(cx - w / 2, 0), 1 - w)),
      y: r4(Math.min(Math.max(cy - h / 2, 0), 1 - h)),
      w: r4(w), h: r4(h),
    };
    colocar();
  };
  const abrirEditor = () => {
    if (!src.url) return;
    ed.hidden = false;
    cont.innerHTML = (src.video
      ? `<video src="${esc(src.url)}" autoplay loop muted playsinline class="enc-media"></video>`
      : `<img src="${esc(src.url)}" alt="" class="enc-media">`)
      + '<div class="enc-marco" id="enc-marco" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
    marco = $('#enc-marco');
    const m = cont.querySelector('.enc-media');
    const listo = () => {
      nat = { w: m.videoWidth || m.naturalWidth, h: m.videoHeight || m.naturalHeight };
      if (!nat.w || !nat.h) return;
      if (!enc) recortar(0.5, 0.5, 1);
      zoom.value = r4(Math.min(nat.w, nat.h) / (enc.w * nat.w));
      colocar();
    };
    m.addEventListener(src.video ? 'loadedmetadata' : 'load', listo, { once: true });

    let arrastre = null;
    marco.onpointerdown = (ev) => {
      if (!enc) return;
      marco.setPointerCapture(ev.pointerId);
      arrastre = { x: ev.clientX, y: ev.clientY, ex: enc.x, ey: enc.y };
    };
    marco.onpointermove = (ev) => {
      if (!arrastre) return;
      const r = cont.getBoundingClientRect();
      enc.x = r4(Math.min(Math.max(arrastre.ex + (ev.clientX - arrastre.x) / r.width, 0), 1 - enc.w));
      enc.y = r4(Math.min(Math.max(arrastre.ey + (ev.clientY - arrastre.y) / r.height, 0), 1 - enc.h));
      encTocado = true;
      colocar();
    };
    marco.onpointerup = () => { arrastre = null; };
    marco.onpointercancel = () => { arrastre = null; };
  };
  zoom.oninput = () => {
    if (!enc || !nat) return;
    encTocado = true;
    recortar(enc.x + enc.w / 2, enc.y + enc.h / 2, +zoom.value);
  };
  $('#enc-centrar').onclick = () => {
    if (!nat) return;
    encTocado = true;
    zoom.value = 1;
    recortar(0.5, 0.5, 1);
  };
  $('#enc-listo').onclick = () => { ed.hidden = true; cont.innerHTML = ''; };
  $('#btn-encuadre').onclick = () => (ed.hidden ? abrirEditor() : $('#enc-listo').click());

  const nuevoOrigen = (url, video) => {
    src.url = url;
    src.video = video;
    enc = null;
    encTocado = false;
    nat = null;
    pintarPrevia();
    $('#btn-encuadre').hidden = !url;
    if (!ed.hidden) abrirEditor();
  };
  form.archivo.onchange = () => {
    const file = form.archivo.files[0];
    if (file) nuevoOrigen(URL.createObjectURL(file), file.type.startsWith('video/'));
  };
  form.gif_url.onchange = () => {
    const u = form.gif_url.value.trim();
    if (u && !form.archivo.files[0]) nuevoOrigen(u, esVideo(u));
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
      lateralidad: fd.get('lateralidad') || null,
      instrucciones: fd.get('instrucciones').trim() || null,
      gif_url: fd.get('gif_url').trim() || null,
      encuadre: encTocado ? enc : (src.url === mediaUrl(x) ? (x.encuadre ?? null) : null),
    };
    if (fila.gif_url && e?.gif_path) fila.gif_path = null;

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    const reactivar = () => { btn.disabled = false; btn.textContent = 'Guardar ejercicio'; };
    const file = fd.get('archivo');
    if (file && file.size) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast(`El archivo pesa más de ${MAX_MB} MB.`);
        reactivar();
        return;
      }
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const path = `${state.user.id}/${uid()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (up.error) {
        toast(`No se pudo subir el archivo: ${up.error.message}`);
        reactivar();
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
      reactivar();
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
activarVisor();
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
