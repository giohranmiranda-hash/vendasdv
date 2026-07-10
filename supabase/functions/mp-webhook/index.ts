// ICE SISTEMA — webhook do Mercado Pago → renova a assinatura sozinho.
//
// Fluxo: cliente paga pelo link → Mercado Pago chama esta função →
// ela confirma o pagamento na API do MP e empurra paid_until +30 dias
// na tabela subscriptions (service role, ignora RLS). O app do cliente
// mostra os dias restantes automaticamente no próximo acesso.
//
// Deploy (uma vez):
//   supabase functions deploy mp-webhook --no-verify-jwt
//   supabase secrets set MP_ACCESS_TOKEN=APP_USR-xxxx   (token do Mercado Pago)
// No painel do Mercado Pago → Webhooks: aponte "Pagamentos" para
//   https://SEUPROJETO.supabase.co/functions/v1/mp-webhook
//
// IMPORTANTE: o pagador precisa usar o MESMO email do login no app —
// é por ele que a assinatura é localizada.

import { createClient } from "npm:@supabase/supabase-js@2";

const DAYS_PER_PAYMENT = 30;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch (_) { /* notificações GET/vazias */ }

    // Mercado Pago manda {type:"payment", data:{id}} (ou topic/id na query)
    const type = (body as any).type || url.searchParams.get("topic") || "";
    const paymentId = (body as any).data?.id || url.searchParams.get("id") || (body as any).id;
    if (!String(type).includes("payment") || !paymentId) {
      return new Response("ignored", { status: 200 });
    }

    // confirma o pagamento direto na API do MP (nunca confie só no webhook)
    const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpToken) return new Response("MP_ACCESS_TOKEN ausente", { status: 500 });
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) return new Response("pagamento não encontrado", { status: 200 });
    const payment = await mpRes.json();
    if (payment.status !== "approved") return new Response("não aprovado ainda", { status: 200 });

    const email: string | undefined =
      payment.payer?.email || payment.additional_info?.payer?.email;
    // external_reference pode carregar o user_id (se você gerar links por cliente)
    const externalRef: string | undefined = payment.external_reference;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // localiza o usuário: por external_reference (user_id) ou pelo email do pagador
    let userId = externalRef || null;
    if (!userId && email) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      userId = user?.id ?? null;
    }
    if (!userId) return new Response("usuário não encontrado p/ " + (email || "?"), { status: 200 });

    // renova: parte de hoje OU do vencimento futuro atual (o que for maior)
    const { data: cur } = await admin.from("subscriptions")
      .select("paid_until").eq("user_id", userId).maybeSingle();
    const today = new Date();
    const base = cur?.paid_until && new Date(cur.paid_until) > today ? new Date(cur.paid_until) : today;
    base.setDate(base.getDate() + DAYS_PER_PAYMENT);
    const paidUntil = base.toISOString().slice(0, 10);

    await admin.from("subscriptions").upsert({
      user_id: userId, email: email ?? null, paid_until: paidUntil,
      plan: "mensal", updated_at: new Date().toISOString(),
    });

    console.log(`assinatura renovada: ${email ?? userId} até ${paidUntil}`);
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    // 200 pra o MP não ficar reenviando eternamente em caso de erro nosso
    return new Response("erro interno", { status: 200 });
  }
});
