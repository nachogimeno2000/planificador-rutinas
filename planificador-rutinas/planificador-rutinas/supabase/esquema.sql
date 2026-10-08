-- =====================================================================
-- Esquema de la base de datos (proyecto Supabase "PLANIFICADOR DE RUTINAS")
-- Ya está aplicado en Supabase. Se guarda aquí como referencia y para
-- poder recrear la base de datos en otro proyecto si hiciera falta.
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Categorías ------------------------------------------------------------
create table public.categorias (
  id smallint generated always as identity primary key,
  nombre text not null unique,
  color text,
  orden smallint not null default 0
);

-- Biblioteca de ejercicios ---------------------------------------------
create table public.ejercicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  instrucciones text,
  categoria_id smallint references public.categorias(id) on delete set null,
  grupos_musculares text[] not null default '{}',   -- zonas musculares
  estimulos text[] not null default '{}',           -- tipo de estímulo
  planos text[] not null default '{}',              -- sagital, frontal, transversal
  impacto text check (impacto in ('bajo','medio','alto')),
  material text[] not null default '{}',
  nivel text check (nivel in ('iniciacion','intermedio','avanzado')),
  gif_path text,   -- ruta del archivo en el bucket "ejercicios"
  gif_url text,    -- alternativa: URL externa
  etiquetas text[] not null default '{}',
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ejercicios_categoria_idx on public.ejercicios(categoria_id);
create index ejercicios_creado_por_idx on public.ejercicios(creado_por);
create index ejercicios_nombre_idx on public.ejercicios(lower(nombre));
create index ejercicios_grupos_gin on public.ejercicios using gin (grupos_musculares);
create index ejercicios_estimulos_gin on public.ejercicios using gin (estimulos);
create index ejercicios_planos_gin on public.ejercicios using gin (planos);
create trigger ejercicios_updated_at before update on public.ejercicios
  for each row execute function public.set_updated_at();

-- Sesiones (la ficha) ----------------------------------------------------
create table public.sesiones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  fecha date,
  objetivo text,
  duracion_min integer check (duracion_min > 0),
  intensidad smallint check (intensidad between 1 and 10),
  notas text,
  publica boolean not null default false,
  slug text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,10),
  creado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sesiones_creado_por_idx on public.sesiones(creado_por);
create index sesiones_fecha_idx on public.sesiones(fecha);
create trigger sesiones_updated_at before update on public.sesiones
  for each row execute function public.set_updated_at();

-- Ejercicios de cada sesión ---------------------------------------------
create table public.sesion_ejercicios (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones(id) on delete cascade,
  ejercicio_id uuid not null references public.ejercicios(id) on delete restrict,
  bloque text not null default 'principal'
    check (bloque in ('calentamiento','principal','vuelta_calma')),
  orden smallint not null default 0,
  series smallint check (series > 0),
  repeticiones text,
  duracion_seg integer check (duracion_seg > 0),
  descanso_seg integer check (descanso_seg >= 0),
  carga text,
  notas text
);
create index sesion_ejercicios_sesion_idx on public.sesion_ejercicios(sesion_id, bloque, orden);
create index sesion_ejercicios_ejercicio_idx on public.sesion_ejercicios(ejercicio_id);

-- Seguridad (RLS) --------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.ejercicios enable row level security;
alter table public.sesiones enable row level security;
alter table public.sesion_ejercicios enable row level security;

create policy "categorias_lectura" on public.categorias for select to anon, authenticated using (true);
create policy "categorias_alta" on public.categorias for insert to authenticated with check (true);
create policy "categorias_edicion" on public.categorias for update to authenticated using (true) with check (true);
create policy "categorias_borrado" on public.categorias for delete to authenticated using (true);

create policy "ejercicios_lectura" on public.ejercicios for select to anon, authenticated using (true);
create policy "ejercicios_alta" on public.ejercicios for insert to authenticated
  with check (creado_por = (select auth.uid()));
create policy "ejercicios_edicion" on public.ejercicios for update to authenticated
  using (creado_por = (select auth.uid())) with check (creado_por = (select auth.uid()));
create policy "ejercicios_borrado" on public.ejercicios for delete to authenticated
  using (creado_por = (select auth.uid()));

create policy "sesiones_lectura" on public.sesiones for select to authenticated
  using (creado_por = (select auth.uid()));
create policy "sesiones_alta" on public.sesiones for insert to authenticated
  with check (creado_por = (select auth.uid()));
create policy "sesiones_edicion" on public.sesiones for update to authenticated
  using (creado_por = (select auth.uid())) with check (creado_por = (select auth.uid()));
create policy "sesiones_borrado" on public.sesiones for delete to authenticated
  using (creado_por = (select auth.uid()));

create policy "sesion_ejercicios_todo" on public.sesion_ejercicios for all to authenticated
  using (exists (select 1 from public.sesiones s where s.id = sesion_id and s.creado_por = (select auth.uid())))
  with check (exists (select 1 from public.sesiones s where s.id = sesion_id and s.creado_por = (select auth.uid())));

-- Ficha pública por enlace (deportistas sin cuenta) ---------------------
create or replace function public.ficha_publica(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'titulo', s.titulo, 'fecha', s.fecha, 'objetivo', s.objetivo,
    'duracion_min', s.duracion_min, 'intensidad', s.intensidad, 'notas', s.notas,
    'ejercicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bloque', se.bloque, 'orden', se.orden, 'series', se.series,
        'repeticiones', se.repeticiones, 'duracion_seg', se.duracion_seg,
        'descanso_seg', se.descanso_seg, 'carga', se.carga, 'notas', se.notas,
        'ejercicio', jsonb_build_object(
          'id', e.id, 'nombre', e.nombre, 'instrucciones', e.instrucciones,
          'gif_path', e.gif_path, 'gif_url', e.gif_url, 'material', e.material,
          'grupos_musculares', e.grupos_musculares, 'estimulos', e.estimulos,
          'planos', e.planos, 'impacto', e.impacto,
          'categoria', c.nombre, 'color', c.color)
      ) order by case se.bloque when 'calentamiento' then 1 when 'principal' then 2 else 3 end, se.orden)
      from public.sesion_ejercicios se
      join public.ejercicios e on e.id = se.ejercicio_id
      left join public.categorias c on c.id = e.categoria_id
      where se.sesion_id = s.id), '[]'::jsonb)
  )
  from public.sesiones s
  where s.slug = p_slug and s.publica;
$$;
revoke all on function public.ficha_publica(text) from public;
grant execute on function public.ficha_publica(text) to anon, authenticated;

-- Almacenamiento de GIFs y vídeos ---------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ejercicios', 'ejercicios', true, 15728640,
        array['image/gif','image/webp','image/png','image/jpeg','video/mp4','video/webm']);

create policy "gifs_subida" on storage.objects for insert to authenticated
  with check (bucket_id = 'ejercicios' and owner = (select auth.uid()));
create policy "gifs_edicion" on storage.objects for update to authenticated
  using (bucket_id = 'ejercicios' and owner = (select auth.uid()));
create policy "gifs_borrado" on storage.objects for delete to authenticated
  using (bucket_id = 'ejercicios' and owner = (select auth.uid()));

-- Categorías iniciales -----------------------------------------------------
insert into public.categorias (nombre, color, orden) values
  ('Calentamiento', '#F59E0B', 1), ('Fuerza', '#EF4444', 2), ('Core', '#8B5CF6', 3),
  ('Pliometría', '#EC4899', 4), ('Velocidad y agilidad', '#06B6D4', 5), ('Resistencia', '#10B981', 6),
  ('Movilidad', '#3B82F6', 7), ('Prevención', '#84CC16', 8), ('Vuelta a la calma', '#64748B', 9);
