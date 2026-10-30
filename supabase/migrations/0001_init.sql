do $$
begin
  create type public.app_role as enum ('gestor', 'operador');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_priority as enum ('alta', 'media', 'baixa', 'nenhuma');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null,
  username text not null unique,
  cpf text not null unique,
  email text not null unique,
  role public.app_role not null default 'operador',
  ativo boolean not null default true,
  must_change_password boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  ativo boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists machines_codigo_lower_idx
  on public.machines (lower(codigo));

create table if not exists public.checklist_days (
  dia date primary key,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_entries (
  id uuid primary key default gen_random_uuid(),
  dia date not null references public.checklist_days(dia) on delete cascade,
  machine_id uuid not null references public.machines(id),
  inicio boolean not null default false,
  fim boolean not null default false,
  local text,
  observacao text,
  inicio_em timestamptz,
  inicio_por uuid references auth.users(id),
  fim_em timestamptz,
  fim_por uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (dia, machine_id)
);

create index if not exists checklist_entries_dia_idx
  on public.checklist_entries (dia);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null,
  concluida boolean not null default false,
  prioridade public.task_priority not null default 'nenhuma',
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_idx
  on public.tasks (user_id, ordem, created_at);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  actor_nome text,
  actor_role public.app_role,
  acao text not null,
  entidade text,
  entidade_id text,
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists machines_set_updated_at on public.machines;
create trigger machines_set_updated_at
before update on public.machines
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.is_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and ativo = true
  );
$$;

create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'gestor'
      and ativo = true
  );
$$;

create or replace function public.registrar_acesso()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_login_at = now()
  where id = auth.uid();
$$;

create or replace function public.marcar_senha_trocada()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
$$;

create or replace function public.registrar_auditoria(
  p_acao text,
  p_entidade text default null,
  p_entidade_id text default null,
  p_detalhe jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_nome text;
  v_role public.app_role;
begin
  if v_actor is null or p_acao is null or btrim(p_acao) = '' then
    return;
  end if;

  select nome_completo, role
    into v_nome, v_role
  from public.profiles
  where id = v_actor;

  insert into public.audit_log (
    actor_id,
    actor_nome,
    actor_role,
    acao,
    entidade,
    entidade_id,
    detalhe
  ) values (
    v_actor,
    v_nome,
    v_role,
    p_acao,
    p_entidade,
    p_entidade_id,
    coalesce(p_detalhe, '{}'::jsonb)
  );
end;
$$;

create or replace function public.proteger_ultimo_gestor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  restantes integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'gestor' and old.ativo = true then
      select count(*) into restantes
      from public.profiles
      where role = 'gestor'
        and ativo = true
        and id <> old.id;

      if restantes = 0 then
        raise exception 'Não é possível remover o último gestor ativo.';
      end if;
    end if;

    return old;
  end if;

  if old.role = 'gestor'
     and old.ativo = true
     and (new.role <> 'gestor' or new.ativo = false) then
    select count(*) into restantes
    from public.profiles
    where role = 'gestor'
      and ativo = true
      and id <> old.id;

    if restantes = 0 then
      raise exception 'Não é possível remover o último gestor ativo.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_proteger_ultimo_gestor on public.profiles;
create trigger profiles_proteger_ultimo_gestor
before update or delete on public.profiles
for each row execute function public.proteger_ultimo_gestor();

create or replace function public.set_checklist_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();

  if new.inicio = true and (tg_op = 'INSERT' or old.inicio is distinct from true) then
    new.inicio_em = now();
    new.inicio_por = auth.uid();
  elsif new.inicio = false then
    new.inicio_em = null;
    new.inicio_por = null;
  end if;

  if new.fim = true and (tg_op = 'INSERT' or old.fim is distinct from true) then
    new.fim_em = now();
    new.fim_por = auth.uid();
  elsif new.fim = false then
    new.fim_em = null;
    new.fim_por = null;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_entries_set_actor on public.checklist_entries;
create trigger checklist_entries_set_actor
before insert or update on public.checklist_entries
for each row execute function public.set_checklist_actor();

alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.checklist_days enable row level security;
alter table public.checklist_entries enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles for select
to authenticated
using (
  (id = auth.uid() and public.is_ativo())
  or public.is_gestor()
);

drop policy if exists machines_select on public.machines;
create policy machines_select
on public.machines for select
to authenticated
using (public.is_ativo());

drop policy if exists machines_insert on public.machines;
create policy machines_insert
on public.machines for insert
to authenticated
with check (public.is_gestor());

drop policy if exists machines_update on public.machines;
create policy machines_update
on public.machines for update
to authenticated
using (public.is_gestor())
with check (public.is_gestor());

drop policy if exists machines_delete on public.machines;
create policy machines_delete
on public.machines for delete
to authenticated
using (public.is_gestor());

drop policy if exists checklist_days_select on public.checklist_days;
create policy checklist_days_select
on public.checklist_days for select
to authenticated
using (public.is_ativo());

drop policy if exists checklist_days_insert on public.checklist_days;
create policy checklist_days_insert
on public.checklist_days for insert
to authenticated
with check (public.is_ativo());

drop policy if exists checklist_days_delete on public.checklist_days;
create policy checklist_days_delete
on public.checklist_days for delete
to authenticated
using (public.is_gestor());

drop policy if exists checklist_entries_select on public.checklist_entries;
create policy checklist_entries_select
on public.checklist_entries for select
to authenticated
using (public.is_ativo());

drop policy if exists checklist_entries_insert on public.checklist_entries;
create policy checklist_entries_insert
on public.checklist_entries for insert
to authenticated
with check (public.is_ativo());

drop policy if exists checklist_entries_update on public.checklist_entries;
create policy checklist_entries_update
on public.checklist_entries for update
to authenticated
using (public.is_ativo())
with check (public.is_ativo());

drop policy if exists checklist_entries_delete on public.checklist_entries;
create policy checklist_entries_delete
on public.checklist_entries for delete
to authenticated
using (public.is_gestor());

drop policy if exists tasks_select on public.tasks;
create policy tasks_select
on public.tasks for select
to authenticated
using (public.is_ativo() and user_id = auth.uid());

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert
on public.tasks for insert
to authenticated
with check (public.is_ativo() and user_id = auth.uid());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update
on public.tasks for update
to authenticated
using (public.is_ativo() and user_id = auth.uid())
with check (public.is_ativo() and user_id = auth.uid());

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete
on public.tasks for delete
to authenticated
using (public.is_ativo() and user_id = auth.uid());

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select
on public.audit_log for select
to authenticated
using (public.is_gestor());

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.machines to authenticated;
grant select, insert, delete on public.checklist_days to authenticated;
grant select, insert, update, delete on public.checklist_entries to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.audit_log to authenticated;

grant all on public.profiles to service_role;
grant all on public.machines to service_role;
grant all on public.checklist_days to service_role;
grant all on public.checklist_entries to service_role;
grant all on public.tasks to service_role;
grant all on public.audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function public.is_ativo() to authenticated;
grant execute on function public.is_gestor() to authenticated;
grant execute on function public.registrar_acesso() to authenticated;
grant execute on function public.marcar_senha_trocada() to authenticated;
grant execute on function public.registrar_auditoria(text, text, text, jsonb) to authenticated;
