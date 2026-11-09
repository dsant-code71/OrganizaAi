drop policy if exists profiles_select on public.profiles;

drop trigger if exists profiles_proteger_ultimo_gestor on public.profiles;
drop function if exists public.proteger_ultimo_gestor() cascade;

drop table if exists public.checklist_entries cascade;
drop table if exists public.checklist_days cascade;
drop table if exists public.machines cascade;
drop table if exists public.audit_log cascade;

drop function if exists public.set_checklist_actor() cascade;
drop function if exists public.registrar_auditoria(text, text, text, jsonb) cascade;
drop function if exists public.marcar_senha_trocada() cascade;
drop function if exists public.is_gestor() cascade;
drop function if exists public.nomes_usuarios() cascade;

alter table public.profiles drop column if exists cpf;
alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists must_change_password;
alter table public.profiles drop column if exists created_by;

drop type if exists public.app_role;

create policy profiles_select
on public.profiles for select
to authenticated
using (id = auth.uid());

grant select on public.profiles to authenticated;
