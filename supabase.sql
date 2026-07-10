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
