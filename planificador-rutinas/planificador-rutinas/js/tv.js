import { esc, mediaHTML, cargarFicha, gruposDeFicha } from './supa.js';
import { BLOQUES, nombreGrupo } from './catalogo.js';

/* Vista TV: una sola pantalla (o un A4 apaisado) con una fila por superserie / triserie.
   Se actualiza sola cada 30 s, así la tele del gimnasio siempre muestra la última versión. */

const cont = document.getElementById('tv');
const raiz = document.documentElement;
const slug = new URLSearchParams(location.search).get('s')
  || location.pathname.split('/tv/')[1]?.replace(/\/$/, '');
const COLORES = ['#F5C542', '#F2545B', '#2BB673', '#3D8BFF', '#B07CFF', '#FF9F43'];
const MAX_COLS = 6;

function filas(f) {
  const grupos = gruposDeFicha(f.ejercicios, BLOQUES);
  const mayor = Math.max(0, ...grupos.filter((g) => g.lineas.length > 1).map((g) => g.lineas.length));
  const sueltosTotal = grupos.filter((g) => g.lineas.length === 1).length;
  const cols = Math.min(MAX_COLS, mayor || Math.min(4, sueltosTotal) || 1);

  const out = [];
  let sueltos = [];
  const vaciar = () => {
    while (sueltos.length) out.push({ lineas: sueltos.splice(0, cols), tipo: '' });
  };
  grupos.forEach((g) => {
    if (g.lineas.length > 1) {
      vaciar();
      for (let i = 0; i < g.lineas.length; i += cols) {
        out.push({ lineas: g.lineas.slice(i, i + cols), tipo: nombreGrupo(g.lineas.length) });
      }
    } else {
      if (sueltos.length && sueltos[0].bloque !== g.bloque) vaciar();
      sueltos.push(g.lineas[0]);
    }
  });
  vaciar();
  return { filas: out, cols };
}

const pres = (l) => {
  const r = l.repeticiones || (l.duracion_seg ? `${l.duracion_seg} s` : '');
  if (l.series && r) return `${l.series}×${r}`;
  return l.series ? `${l.series} series` : r;
};

function render(f) {
  document.title = `${f.titulo} · TV`;
  const { filas: fs, cols } = filas(f);
  const fecha = f.fecha
    ? new Date(`${f.fecha}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const cab = [
    ...(f.cabecera || []).filter((c) => c.etiqueta || c.valor),
    ...(f.duracion_min ? [{ etiqueta: 'Duración', valor: `${f.duracion_min}′` }] : []),
    ...(f.intensidad ? [{ etiqueta: 'Intensidad', valor: `${f.intensidad}/10` }] : []),
  ];
  const columnas = (f.tv_columnas || []).slice(0, cols);
  const hayColumnas = columnas.some((c) => c && c.trim());

  raiz.style.setProperty('--tv-cols', cols);
  raiz.style.setProperty('--tv-filas', Math.max(fs.length, 1));

  cont.innerHTML = `
    <header class="tv-cab">
      <div class="tv-titulo">
        <h1>${esc(f.titulo)}</h1>
        <p>${esc([fecha, f.objetivo].filter(Boolean).join(' · '))}</p>
      </div>
      ${cab.length ? `<dl class="tv-datos">${cab.map((c) => `
        <div><dt>${esc(c.etiqueta)}</dt><dd>${esc(c.valor) || '–'}</dd></div>`).join('')}</dl>` : ''}
    </header>
    <div class="tv-cuerpo">
      <div class="tv-tabla">
        ${hayColumnas ? `<div class="tv-columnas"><span></span>${Array.from({ length: cols }, (_, i) =>
          `<span>${columnas[i] ? `<b>${esc(columnas[i])}</b>` : ''}</span>`).join('')}</div>` : ''}
        <div class="tv-filas">
          ${fs.length ? fs.map((fila, i) => `
            <div class="tv-fila">
              <div class="tv-num" style="--c:${COLORES[i % COLORES.length]}"><b>${i + 1}</b>${fila.tipo ? `<small>${esc(fila.tipo)}</small>` : ''}</div>
              ${fila.lineas.map((l) => {
                const e = l.ejercicio || {};
                return `<div class="tv-celda">
                  <div class="tv-media media">${mediaHTML(e)}</div>
                  <div class="tv-pres"><b>${esc(pres(l))}</b>${l.carga ? `<span>${esc(l.carga)}</span>` : ''}</div>
                  <p class="tv-nombre">${esc(e.nombre)}</p>
                  ${l.notas ? `<p class="tv-nota">${esc(l.notas)}</p>` : ''}
                </div>`;
              }).join('')}
            </div>`).join('')
    : '<p class="vacio-mini">Esta sesión aún no tiene ejercicios.</p>'}
        </div>
      </div>
      <aside class="tv-lateral">
        <section class="tv-notas"><h2>Notas</h2><p>${esc(f.notas || '')}</p></section>
      </aside>
    </div>`;
  ajustar();
}

// El tamaño del vídeo se calcula para que todas las filas quepan en una sola pantalla.
function ajustar() {
  const celdas = [...cont.querySelectorAll('.tv-celda')];
  if (!celdas.length) return;
  let lado = Infinity;
  celdas.forEach((c) => {
    const texto = [...c.querySelectorAll('.tv-nombre, .tv-nota')].reduce((s, el) => s + el.offsetHeight, 0);
    const pres = c.querySelector('.tv-pres').offsetWidth;
    const gap = parseFloat(getComputedStyle(c).rowGap) || 0;
    lado = Math.min(lado, c.clientHeight - texto - gap * 2, c.clientWidth - pres - gap * 2);
  });
  raiz.style.setProperty('--tv-media', `${Math.max(32, Math.floor(lado))}px`);
}

let ultimo = '';
async function cargar() {
  const f = await cargarFicha(slug);
  if (!f) {
    if (!ultimo) {
      cont.innerHTML = `<div class="vacio f-vacio"><p>Esta sesión no existe o no está compartida.
        Ábrela desde la app con el botón <strong>Vista TV</strong>.</p></div>`;
    }
    return;
  }
  const firma = JSON.stringify(f);
  if (firma === ultimo) return;
  ultimo = firma;
  render(f);
}

/* ---------- controles ---------- */
const barra = document.getElementById('tv-barra');
let oculto;
const despertar = () => {
  document.body.classList.remove('quieto');
  clearTimeout(oculto);
  oculto = setTimeout(() => document.body.classList.add('quieto'), 3000);
};
['mousemove', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, despertar, { passive: true }));
despertar();

document.getElementById('tv-completa').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
};
document.addEventListener('fullscreenchange', () => {
  document.getElementById('tv-completa').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});
document.getElementById('tv-imprimir').onclick = () => window.print();

let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(ajustar, 120); });
document.fonts?.ready.then(ajustar);
barra.hidden = false;

await cargar();
setInterval(cargar, 30000);
