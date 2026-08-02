-- =====================================================================
-- ICE SISTEMA — setup do Supabase (rodar UMA vez no SQL Editor)
-- Cria a tabela app_state com RLS: cada usuário (empresa/tenant) só
-- enxerga e escreve a PRÓPRIA linha. É isso que isola as empresas
-- mesmo todas usando o mesmo app e o mesmo banco.
-- =====================================================================

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "cada tenant lê a própria linha" on public.app_state;
create policy "cada tenant lê a própria linha"
  on public.app_state for select
  using (auth.uid() = user_id);

drop policy if exists "cada tenant insere a própria linha" on public.app_state;
create policy "cada tenant insere a própria linha"
  on public.app_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada tenant atualiza a própria linha" on public.app_state;
create policy "cada tenant atualiza a própria linha"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cada tenant apaga a própria linha" on public.app_state;
create policy "cada tenant apaga a própria linha"
  on public.app_state for delete
  using (auth.uid() = user_id);

-- =====================================================================
-- ASSINATURAS: até quando cada tenant está pago.
-- O cliente só LÊ a própria linha (o app mostra "X dias restantes").
-- Quem ESCREVE é você: pelo painel (Table Editor) ao confirmar um PIX,
-- ou automaticamente pela Edge Function do webhook do Mercado Pago
-- (supabase/functions/mp-webhook) — ambos usam service role, que
-- ignora RLS. Não existe policy de escrita de propósito.
-- =====================================================================

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  paid_until date not null default (now()::date),
  plan text default 'mensal',
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "tenant lê a própria assinatura" on public.subscriptions;
create policy "tenant lê a própria assinatura"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- =====================================================================
-- INDIQUE E GANHE: cada conta tem um ref_code; quem entra com um código
-- fica marcado em referred_by. Quando o indicado faz o PRIMEIRO
-- pagamento, o webhook credita +15 dias ao padrinho (ref_bonus_given
-- evita crédito duplicado). Escrita só via service role.
-- =====================================================================

alter table public.subscriptions
  add column if not exists ref_code text unique,
  add column if not exists referred_by text,
  add column if not exists ref_bonus_given boolean not null default false;

-- gera código pra contas que já existem
update public.subscriptions
set ref_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where ref_code is null;

-- trial automático de 7 dias + código de convite + captura do código usado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, email, paid_until, ref_code, referred_by)
  values (
    new.id, new.email, (now()::date + interval '7 days'),
    upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    nullif(upper(trim(coalesce(new.raw_user_meta_data->>'ref', ''))), '')
  )
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
