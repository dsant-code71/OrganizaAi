create table if not exists public.chat_rate_limits (
  chave text primary key,
  janela_inicio timestamptz not null default now(),
  utilizacoes integer not null default 0
);

alter table public.chat_rate_limits enable row level security;

create or replace function public.registrar_chat_request(
  p_chave text,
  p_limite integer,
  p_janela_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora timestamptz := now();
  v_uso integer;
begin
  if p_chave is null or length(p_chave) > 200 or p_limite < 1 or p_janela_segundos < 1 then
    return false;
  end if;

  insert into public.chat_rate_limits as c (chave, janela_inicio, utilizacoes)
  values (p_chave, v_agora, 1)
  on conflict (chave) do update
    set janela_inicio = case
          when c.janela_inicio + (p_janela_segundos || ' seconds')::interval <= v_agora
            then v_agora
          else c.janela_inicio
        end,
        utilizacoes = case
          when c.janela_inicio + (p_janela_segundos || ' seconds')::interval <= v_agora
            then 1
          else c.utilizacoes + 1
        end
  returning utilizacoes into v_uso;

  return v_uso <= p_limite;
end;
$$;

revoke all on function public.registrar_chat_request(text, integer, integer) from public;
grant execute on function public.registrar_chat_request(text, integer, integer) to anon, authenticated;
