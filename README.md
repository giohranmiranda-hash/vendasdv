# ❄️ Ice Sistema — SaaS de gestão para negócios gelados

**🌐 Produção: https://icesistema.netlify.app**

Sistema de gestão **multi-empresa (multi-tenant) e white-label** para negócios de gelo
saborizado, sorvete, picolé e bebidas geladas. Cada cliente que assina cria a própria
conta, tem os dados **isolados** e personaliza tudo: nome, logo, cor, sabores, receitas,
preços, mensagens de WhatsApp — nada é fixo no código.

- **HTML/CSS/JS puro** — sem framework, roda em qualquer navegador (inclusive celular)
- **PWA instalável** — manifest + service worker, funciona 100% offline
- **Nuvem opcional via Supabase** — login email/senha, sync automático com anti-sobrescrita
- **Deploy estático no Netlify** — com CSP restritiva via `_headers`

## Módulos

Dashboard · Vendas (multi-item, canais, fiado, CPV FIFO) · Leads (CRM de anúncios) ·
Clientes · Produção (lotes com validade) · Estoque · Insumos (modelo registrado−produzido,
gargalo de produção) · Receitas (custo ao vivo, múltiplas variações, dose por item) ·
Logística (mapa Leaflet, geocodificação em cascata, rota otimizada) · Assistente IA
(sugestões locais + Gemini opcional) · Financeiro (DRE de caixa + payback de investimento) ·
Metas & Comissões · Relatórios (CSV + resumo WhatsApp) · Calendário · Backup JSON.

## 🚀 Rodando localmente

É um site estático — qualquer servidor serve:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

Sem configurar nada, o app funciona no **modo offline** (dados no localStorage do aparelho).

## ☁️ Configurando a nuvem (Supabase) — ~5 minutos

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de [`supabase.sql`](supabase.sql)
   e execute. Isso cria a tabela `app_state` com **RLS** (cada empresa só vê a própria linha).
3. Em **Project Settings → API**, copie a **URL** e a **anon key**.
4. Cole as duas em [`js/config.js`](js/config.js):
   ```js
   window.ICE_CONFIG = {
     SUPABASE_URL: "https://SEUPROJETO.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...",
   };
   ```
5. Pronto. A tela de login passa a oferecer **Entrar / Criar conta**. Cada conta criada é
   uma empresa nova, com dados isolados pelo RLS.

> A anon key é pública por design — a segurança vem do RLS. Para controlar quem pode
> criar conta (assinatura), gerencie usuários em **Authentication** no painel do Supabase
> (dá pra desativar signups e criar contas manualmente).

## 🌐 Deploy no Netlify

1. Arraste a pasta do projeto em [app.netlify.com/drop](https://app.netlify.com/drop)
   (ou conecte o repositório Git).
2. O arquivo `_headers` já configura a **Content-Security-Policy** restritiva com os
   domínios exatos usados (Supabase, BrasilAPI, ViaCEP, Nominatim, LocationIQ, tiles OSM,
   Gemini).
3. A cada deploy relevante, **dê bump** em `CACHE_VERSION` no [`sw.js`](sw.js) (ex:
   `ice-v2`) — é isso que garante que os usuários nunca fiquem presos numa versão velha.

## 📱 Instalando como app

No celular, abra o site e use "Adicionar à tela inicial" (Android/Chrome mostra o banner
automaticamente). Funciona offline; quando a internet volta, sincroniza sozinho.

## 💎 Cobrando a mensalidade dos seus clientes

A tela **Assinatura** mostra o plano e os botões de pagamento pro seu cliente. Configure
em [`js/config.js`](js/config.js), no bloco `PLAN`:

- `paymentLink` — link de pagamento recorrente (Mercado Pago → "Assinaturas" → criar link;
  ou Stripe Payment Link, Kiwify, Hotmart etc.)
- `pixKey` — sua chave PIX, pra quem prefere pagar manual (botão "copiar chave")
- `whatsapp` — seu número (com DDI, ex `5511999998888`) pra receber comprovante/suporte
- `name`, `price`, `benefits` — texto do plano

### Dias restantes + renovação automática

O `supabase.sql` cria a tabela **`subscriptions`** (cada conta nova já ganha **7 dias de
teste grátis**). O app lê essa tabela e mostra na aba Assinatura o status ATIVA/VENCENDO/
VENCIDA com **quantos dias restam**, avisa quando faltam ≤5 dias e atualiza sozinho a cada
entrada no app (com botão "Atualizar status" pra consultar na hora).

Pra **renovar automaticamente quando o pagamento confirma** (Mercado Pago):

1. Instale a CLI do Supabase e faça deploy da função:
   ```bash
   supabase functions deploy mp-webhook --no-verify-jwt
   supabase secrets set MP_ACCESS_TOKEN=APP_USR-seu-token-do-mercado-pago
   ```
2. No painel do Mercado Pago → **Suas integrações → Webhooks**, cadastre o evento
   "Pagamentos" apontando para `https://SEUPROJETO.supabase.co/functions/v1/mp-webhook`.
3. Pronto: pagamento aprovado → +30 dias somados ao vencimento, sozinho. O pagador deve
   usar o **mesmo email do login** no app (é assim que a função localiza a conta).

**Alternativa manual (PIX):** recebeu o comprovante? No painel do Supabase → Table Editor →
`subscriptions`, ajuste o `paid_until` do cliente. O app dele atualiza no próximo acesso.

**Corte de acesso de quem não paga:** no painel do Supabase → **Authentication → Users**,
banir/desativar o usuário bloqueia o login na nuvem. Os dados ficam guardados e voltam
quando a assinatura reativar.

## 🔑 Integrações opcionais (por tenant, nas Configurações)

- **LocationIQ** (geocodificação precisa): chave grátis em locationiq.com, colada em
  ⚙️ Configurações. Sem chave, usa Nominatim (grátis, sem cadastro).
- **Gemini** (assistente IA): chave grátis em aistudio.google.com/apikey, colada na tela
  do Assistente. Fica **só no aparelho** (nunca sincroniza). Sem chave, o assistente
  local responde por palavras-chave.

## 🧪 Testes

```bash
npm install
npx playwright test
```

Suíte funcional (Playwright headless) cobrindo onboarding, catálogo, receitas, produção,
estoque FIFO, vendas, leads, financeiro e backup.

## Arquitetura (decisões importantes)

- **Uma função de custo**: `Engine.recipeCost()` é usada tanto no preview da tela
  Receitas quanto na Produção — impossível divergirem.
- **Insumos = registrado − produzido**: o consumo vem do histórico de produções, nunca
  de subtração direta — funciona em qualquer ordem de compra/produção.
- **CPV real FIFO**: vendas consomem lotes por ordem de produção, com custo do lote.
- **Datas em hora local**: nunca `toISOString()` puro (evita o bug do "dia virar às 21h").
- **Dashboard**: mês padrão é o mês do calendário atual, nunca "o último mês com vendas".
- **Sync anti-sobrescrita**: por timestamp; aparelho vazio nunca apaga a nuvem; restaurar
  backup marca o local como mais recente e reenvia.
