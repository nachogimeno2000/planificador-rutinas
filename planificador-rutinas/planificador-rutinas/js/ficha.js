import { sb, esc, mediaHTML } from './supa.js';
import { BLOQUES } from './catalogo.js';

const cont = document.getElementById('ficha');

// Admite /f/<codigo> y /ficha.html?s=<codigo>
const slug = new URLSearchParams(location.search).get('s')
  || location.pathname.split('/f/')[1]?.replace(/\/$/, '');

async function cargar() {
  if (!slug) return null;
  const { data } = await sb.rpc('ficha_publica', { p_slug: slug });
  if (data) return data;

  // Vista previa para el autor aunque la ficha no esté compartida.
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

function prescripcion(l) {
  const p = [];
  if (l.series) p.push(`${l.series} ${l.series === 1 ? 'serie' : 'series'}`);
  if (l.repeticiones) p.push(/[a-z]/i.test(l.repeticiones) ? l.repeticiones : `${l.repeticiones} reps`);
  if (l.duracion_seg) p.push(`${l.duracion_seg} s`);
  if (l.descanso_seg != null) p.push(`${l.descanso_seg} s descanso`);
  if (l.carga) p.push(l.carga);
  return p.map((t) => `<span class="pill">${esc(t)}</span>`).join('');
}

function render(f) {
  document.title = `${f.titulo} · Ficha`;
  const fecha = f.fecha
    ? new Date(`${f.fecha}T12:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const meta = [
    fecha,
    f.duracion_min && `${f.duracion_min} min`,
    f.intensidad && `Intensidad ${f.intensidad}/10`,
    `${f.ejercicios.length} ejercicios`,
  ].filter(Boolean);

  let n = 0;
  const ordenBloque = Object.fromEntries(BLOQUES.map((b, i) => [b.v, i]));
  const lineas = [...f.ejercicios].sort((a, b) => ordenBloque[a.bloque] - ordenBloque[b.bloque] || a.orden - b.orden);

  cont.innerHTML = `
    <header class="f-cab">
      <p class="marca">PLANIFICADOR</p>
      <h1>${esc(f.titulo)}</h1>
      ${f.objetivo ? `<p class="f-objetivo">${esc(f.objetivo)}</p>` : ''}
      <div class="f-meta">${meta.map((m) => `<span class="pill">${esc(m)}</span>`).join('')}</div>
      ${f.notas ? `<p class="f-notas">${esc(f.notas)}</p>` : ''}
    </header>
    ${BLOQUES.map((b) => {
      const del = lineas.filter((l) => l.bloque === b.v);
      if (!del.length) return '';
      return `<section class="f-bloque"><h2>${b.t}</h2><div class="f-lista">
        ${del.map((l) => {
          n += 1;
          const e = l.ejercicio || {};
          return `<article class="f-ej">
            <div class="media">${mediaHTML(e)}</div>
            <div class="f-ej-txt">
              <span class="f-num" aria-hidden="true">${String(n).padStart(2, '0')}</span>
              <h3>${esc(e.nombre)}</h3>
              <div class="f-pres">${prescripcion(l)}</div>
              ${e.instrucciones ? `<p class="f-instr">${esc(e.instrucciones)}</p>` : ''}
              ${l.notas ? `<p class="f-instr">${esc(l.notas)}</p>` : ''}
            </div>
          </article>`;
        }).join('')}
      </div></section>`;
    }).join('')}
    <footer class="f-pie no-print">
      <button type="button" class="btn" onclick="window.print()">Imprimir o guardar en PDF</button>
    </footer>`;
}

const f = await cargar();
if (f) render(f);
else {
  cont.innerHTML = `<div class="vacio f-vacio"><p class="marca">PLANIFICADOR</p>
    <p>Esta ficha no existe o ya no está compartida. Pide un enlace nuevo a quien te la envió.</p></div>`;
}
