-- =============================================================================
-- SAVINGS APP - ESQUEMA COMPLETO DE BASE DE DATOS
-- =============================================================================
-- Proyecto: Plataforma de ahorro para comunidad de traders e inversores
-- Stack: Supabase (PostgreSQL + Auth + RLS)
-- Autor: Sebas
-- Última actualización: 2026-05-13
-- =============================================================================
--
-- INSTRUCCIONES DE USO:
--
-- Este archivo documenta el esquema completo de la DB. Para aplicarlo desde
-- cero en un proyecto Supabase nuevo:
--
--   1. Ve al SQL Editor de Supabase
--   2. Ejecuta los bloques EN ORDEN (1 → 2 → 3 → 4)
--   3. Confirma cualquier advertencia de "Run without RLS" o "destructive"
--   4. Después de registrarte en la app, ejecuta el BLOQUE 5 para hacerte admin
--
-- ARQUITECTURA:
--
--   - 3 tablas: profiles, initial_savings, recurring_savings
--   - 2 triggers automáticos: crear profile al registrarse, actualizar updated_at
--   - 11 RLS policies: usuarios solo ven sus datos, admins ven todo
--   - 4 vistas para estadísticas: resumen por usuario, por país, género y edad
--
-- =============================================================================


-- =============================================================================
-- BLOQUE 1: TABLAS PRINCIPALES
-- =============================================================================
-- Crea las 3 tablas core del sistema con sus constraints e índices.
-- Incluye DROP previos para idempotencia (se puede re-ejecutar sin error).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Limpieza previa (solo en desarrollo / setup inicial)
-- -----------------------------------------------------------------------------
-- ⚠️ PRECAUCIÓN: estos DROPs borran todos los datos.
-- Solo usar en setup inicial o reset completo. NUNCA en producción con datos.

drop table if exists public.recurring_savings cascade;
drop table if exists public.initial_savings cascade;
drop table if exists public.profiles cascade;


-- -----------------------------------------------------------------------------
-- TABLA: profiles
-- -----------------------------------------------------------------------------
-- Extiende auth.users con los datos del perfil del usuario.
-- El ID es FK a auth.users con ON DELETE CASCADE: si se borra el usuario
-- en Auth, su profile (y todos sus datos relacionados) se borran también.

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text unique not null,
  birth_date  date not null,
  gender      text not null check (gender in ('masculino', 'femenino', 'otro', 'prefiero_no_decir')),
  country     text not null,
  role        text not null default 'member' check (role in ('member', 'admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table  public.profiles is 'Perfiles de usuarios extendiendo auth.users';
comment on column public.profiles.role is 'Rol del usuario: member (default) o admin';

-- Índices para consultas frecuentes en el panel admin
create index idx_profiles_country on public.profiles(country);
create index idx_profiles_role    on public.profiles(role);


-- -----------------------------------------------------------------------------
-- TABLA: initial_savings
-- -----------------------------------------------------------------------------
-- Ahorro inicial del reto. Un usuario solo puede registrarlo UNA vez
-- (garantizado por UNIQUE(user_id)). El monto debe ser positivo.

create table public.initial_savings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(15, 2) not null check (amount > 0),
  currency    text not null default 'USD' check (currency in ('USD', 'COP', 'MXN', 'EUR')),
  created_at  timestamptz default now(),
  unique(user_id)
);

comment on table public.initial_savings is 'Ahorro inicial único por usuario (reto de arranque)';


-- -----------------------------------------------------------------------------
-- TABLA: recurring_savings
-- -----------------------------------------------------------------------------
-- Ahorros recurrentes (semanales, quincenales o mensuales).
-- period_date representa la fecha del periodo al que aplica el ahorro,
-- NO la fecha en que se registró. Esto permite registrar ahorros "atrasados".

create table public.recurring_savings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric(15, 2) not null check (amount > 0),
  currency    text not null default 'USD' check (currency in ('USD', 'COP', 'MXN', 'EUR')),
  frequency   text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  period_date date not null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table  public.recurring_savings is 'Ahorros periódicos del usuario';
comment on column public.recurring_savings.period_date is 'Fecha del periodo al que aplica (no fecha de registro)';

-- Índices para queries del dashboard y admin
create index idx_recurring_user        on public.recurring_savings(user_id);
create index idx_recurring_period      on public.recurring_savings(period_date);
create index idx_recurring_user_period on public.recurring_savings(user_id, period_date);



-- =============================================================================
-- BLOQUE 2: TRIGGERS Y FUNCIONES AUTOMÁTICAS
-- =============================================================================
-- Automatiza dos comportamientos críticos:
--   1. Crear el profile cuando un usuario se registra (auth.signUp)
--   2. Actualizar updated_at automáticamente en updates
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TRIGGER 1: handle_new_user
-- -----------------------------------------------------------------------------
-- Cuando alguien hace supabase.auth.signUp() y pasa metadata (nickname, etc),
-- este trigger toma esos datos y crea automáticamente la fila en profiles.
-- 
-- security definer = se ejecuta con permisos de admin, no del usuario nuevo
-- (necesario porque el usuario aún no tiene permisos al momento del trigger).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, birth_date, gender, country)
  values (
    new.id,
    new.raw_user_meta_data->>'nickname',
    (new.raw_user_meta_data->>'birth_date')::date,
    new.raw_user_meta_data->>'gender',
    new.raw_user_meta_data->>'country'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- TRIGGER 2: handle_updated_at
-- -----------------------------------------------------------------------------
-- Actualiza automáticamente el campo updated_at en cada UPDATE.
-- Útil para auditoría y reportes de "última actividad".

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists recurring_savings_updated_at on public.recurring_savings;
create trigger recurring_savings_updated_at
  before update on public.recurring_savings
  for each row execute function public.handle_updated_at();



-- =============================================================================
-- BLOQUE 3: ROW LEVEL SECURITY (RLS) + POLICIES
-- =============================================================================
-- Define la seguridad a nivel de fila. Sin esto, cualquiera con la
-- publishable key podría leer todos los datos de todos los usuarios.
--
-- Estrategia:
--   - Cada usuario lee/escribe SUS datos (auth.uid() = user_id)
--   - Los admins (role='admin') leen TODO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Habilitar RLS en las 3 tablas
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.initial_savings   enable row level security;
alter table public.recurring_savings enable row level security;


-- -----------------------------------------------------------------------------
-- HELPER: función para detectar si el usuario actual es admin
-- -----------------------------------------------------------------------------
-- Esta función se usa en las policies para los admins.
-- Marcada como STABLE para que Postgres pueda cachearla en la misma transacción.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


-- -----------------------------------------------------------------------------
-- POLICIES: profiles
-- -----------------------------------------------------------------------------

drop policy if exists "users_select_own_profile" on public.profiles;
create policy "users_select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "admins_select_all_profiles" on public.profiles;
create policy "admins_select_all_profiles"
  on public.profiles for select
  using (public.is_admin());


-- -----------------------------------------------------------------------------
-- POLICIES: initial_savings
-- -----------------------------------------------------------------------------
-- Nota: NO hay policies de UPDATE ni DELETE porque el ahorro inicial es único
-- y no se modifica. Es una decisión de diseño explícita.

drop policy if exists "users_select_own_initial" on public.initial_savings;
create policy "users_select_own_initial"
  on public.initial_savings for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_initial" on public.initial_savings;
create policy "users_insert_own_initial"
  on public.initial_savings for insert
  with check (auth.uid() = user_id);

drop policy if exists "admins_select_all_initial" on public.initial_savings;
create policy "admins_select_all_initial"
  on public.initial_savings for select
  using (public.is_admin());


-- -----------------------------------------------------------------------------
-- POLICIES: recurring_savings (CRUD completo para el dueño)
-- -----------------------------------------------------------------------------

drop policy if exists "users_select_own_recurring" on public.recurring_savings;
create policy "users_select_own_recurring"
  on public.recurring_savings for select
  using (auth.uid() = user_id);

drop policy if exists "users_insert_own_recurring" on public.recurring_savings;
create policy "users_insert_own_recurring"
  on public.recurring_savings for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_recurring" on public.recurring_savings;
create policy "users_update_own_recurring"
  on public.recurring_savings for update
  using (auth.uid() = user_id);

drop policy if exists "users_delete_own_recurring" on public.recurring_savings;
create policy "users_delete_own_recurring"
  on public.recurring_savings for delete
  using (auth.uid() = user_id);

drop policy if exists "admins_select_all_recurring" on public.recurring_savings;
create policy "admins_select_all_recurring"
  on public.recurring_savings for select
  using (public.is_admin());



-- =============================================================================
-- BLOQUE 4: VISTAS PARA ESTADÍSTICAS DEL PANEL ADMIN
-- =============================================================================
-- Las vistas son "tablas virtuales" pre-calculadas. Heredan automáticamente
-- las RLS de las tablas base, así que también respetan los permisos.
--
-- Importante: usamos coalesce(x, 0) para convertir NULLs en 0, ya que los
-- usuarios sin ahorros aparecen con NULL en los joins y romperían los cálculos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VISTA 1: user_savings_summary
-- -----------------------------------------------------------------------------
-- Tabla principal del panel admin: una fila por usuario con todos los totales.

create or replace view public.user_savings_summary as
select
  p.id,
  p.nickname,
  p.country,
  p.gender,
  date_part('year', age(p.birth_date))::int as age,
  coalesce(i.amount, 0) as initial_amount,
  coalesce(sum(r.amount), 0) as recurring_total,
  coalesce(i.amount, 0) + coalesce(sum(r.amount), 0) as total_saved,
  count(r.id) as recurring_count,
  max(r.created_at) as last_saving_date
from public.profiles p
left join public.initial_savings   i on i.user_id = p.id
left join public.recurring_savings r on r.user_id = p.id
group by p.id, p.nickname, p.country, p.gender, p.birth_date, i.amount;


-- -----------------------------------------------------------------------------
-- VISTA 2: savings_by_country
-- -----------------------------------------------------------------------------
-- Agregado por país: usuarios, total ahorrado, promedio. Usada en panel admin.

create or replace view public.savings_by_country as
select
  country,
  count(distinct id) as user_count,
  sum(total_saved)   as total_saved,
  avg(total_saved)   as avg_per_user
from public.user_savings_summary
group by country
order by total_saved desc;


-- -----------------------------------------------------------------------------
-- VISTA 3: savings_by_gender
-- -----------------------------------------------------------------------------

create or replace view public.savings_by_gender as
select
  gender,
  count(distinct id) as user_count,
  sum(total_saved)   as total_saved,
  avg(total_saved)   as avg_per_user
from public.user_savings_summary
group by gender;


-- -----------------------------------------------------------------------------
-- VISTA 4: savings_by_age_range
-- -----------------------------------------------------------------------------
-- Segmentación por rangos de edad clásicos del marketing/demografía.

create or replace view public.savings_by_age_range as
select
  case
    when age < 25 then '18-24'
    when age < 35 then '25-34'
    when age < 45 then '35-44'
    when age < 55 then '45-54'
    else '55+'
  end as age_range,
  count(distinct id) as user_count,
  sum(total_saved)   as total_saved,
  avg(total_saved)   as avg_per_user
from public.user_savings_summary
group by age_range
order by age_range;



-- =============================================================================
-- BLOQUE 5: PROMOVER USUARIO A ADMIN
-- =============================================================================
-- ⚠️ Ejecutar DESPUÉS de haberse registrado en la app por primera vez.
-- Reemplazar el email con el del usuario que se quiere promover.
-- =============================================================================

-- update public.profiles
-- set role = 'admin'
-- where id in (
--   select id from auth.users
--   where lower(email) = lower('tu_email@aqui.com')
-- );



-- =============================================================================
-- VERIFICACIONES ÚTILES (queries de diagnóstico)
-- =============================================================================
-- Estos queries no se ejecutan automáticamente; están aquí como referencia
-- para debugging.
-- =============================================================================

-- Listar todos los usuarios con su rol y email
-- select p.nickname, p.role, u.email, p.created_at
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- order by p.created_at desc;

-- Ver todas las policies activas
-- select schemaname, tablename, policyname, cmd
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;

-- Ver todas las vistas creadas
-- select viewname
-- from pg_views
-- where schemaname = 'public';

-- Contar registros por tabla
-- select 'profiles' as tabla, count(*) from public.profiles
-- union all
-- select 'initial_savings', count(*) from public.initial_savings
-- union all
-- select 'recurring_savings', count(*) from public.recurring_savings;