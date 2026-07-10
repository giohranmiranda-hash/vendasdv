/* ICE SISTEMA — Assinatura: tela pro tenant pagar o acesso mensal.
   O app é estático, então a cobrança é via link de pagamento externo
   (Mercado Pago/Stripe/Kiwify) e/ou PIX, configurados pelo dono do SaaS
   em js/config.js. O corte de acesso de quem não paga é feito no painel
   do Supabase (Authentication → ban do usuário). */
"use strict";

const ViewAssinatura = {
  plan() { return (window.ICE_CONFIG && ICE_CONFIG.PLAN) || {}; },

  // card de status: dias restantes, com barra e cores
  statusHtml() {
    const sess = Cloud.session();
    if (!sess) return `<div class="banner info">📴 Você está no modo offline (sem conta na nuvem) — a assinatura vale para contas com login.</div>`;
    const sub = App.subscription;
    const days = Cloud.subDaysLeft(sub);
    if (sub == null) return `<div class="banner info">☁️ Consultando status da assinatura…</div>`;
    if (sub.none || days == null) return `<div class="banner warn">🔎 Nenhuma assinatura registrada ainda pra esta conta. Faça o pagamento abaixo — assim que for confirmado, o status atualiza sozinho aqui.</div>`;
    const total = 30;
    const pct = U.clamp((days / total) * 100, 0, 100);
    const cls = days < 0 ? "bad" : days <= 5 ? "warn" : "ok";
    const msg = days < 0
      ? `Venceu há ${-days} dia(s) — renove pra manter a nuvem ativa.`
      : days === 0 ? "Vence HOJE — renove pra não perder o acesso."
      : `${days} dia(s) restante(s) · paga até ${U.fmtDate(String(sub.paidUntil).slice(0, 10))}`;
    return `<div class="card mb" style="border-color:var(--${cls === "ok" ? "ok" : cls === "warn" ? "warn" : "bad"})">
      <div class="flex spread"><h3 style="margin:0">📆 Status da assinatura</h3>
        <span class="badge ${cls}" style="font-size:.85rem">${days < 0 ? "VENCIDA" : days <= 5 ? "VENCENDO" : "ATIVA"}</span></div>
      <div class="hbar-track mt" style="height:16px"><div class="hbar-fill" style="width:${pct}%;background:var(--${cls === "ok" ? "ok" : cls === "warn" ? "warn" : "bad"})"></div></div>
      <div class="small mt">${msg}</div>
      <div class="muted small mt">Confirmou um pagamento agora? <a href="#" id="sub-refresh">Atualizar status</a> — também atualiza sozinho a cada vez que você entra no app.</div>
    </div>`;
  },

  render() {
    const v = U.$("#view");
    const p = ViewAssinatura.plan();
    const sess = Cloud.session();
    const configured = !!(p.paymentLink || p.pixKey || p.whatsapp);

    v.innerHTML = `
      <div class="view-head"><h2>💎 Assinatura</h2></div>
      ${ViewAssinatura.statusHtml()}
      <div class="grid g2">
        <div class="card" style="border-color:color-mix(in srgb, var(--accent) 45%, var(--line))">
          <div class="flex spread">
            <h3 style="margin:0">✨ ${U.esc(p.name || "Plano Mensal")}</h3>
            <span class="badge accent" style="font-size:.95rem;padding:6px 14px">${U.esc(p.price || "—")}</span>
          </div>
          <ul style="margin:14px 0 4px;padding-left:4px;list-style:none;display:flex;flex-direction:column;gap:8px">
            ${(p.benefits || []).map((b) => `<li>✅ ${U.esc(b)}</li>`).join("")}
          </ul>
          <hr class="sep"/>
          <div class="muted small mb">Conta: <b>${sess ? U.esc(sess.user.email) : "modo offline (sem conta na nuvem)"}</b></div>

          ${p.paymentLink ? `<button class="btn primary" id="pay-link" style="width:100%;font-size:1.05rem;padding:13px">💳 Pagar mensalidade agora</button>` : ""}

          ${p.pixKey ? `
          <div class="card mt" style="background:var(--bg2)">
            <div class="muted small">Ou pague via PIX:</div>
            <div class="flex spread mt" style="flex-wrap:nowrap">
              <code style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent-text)">${U.esc(p.pixKey)}</code>
              <button class="btn small" id="pay-pix-copy">📋 Copiar chave</button>
            </div>
          </div>` : ""}

          ${p.whatsapp ? `<button class="btn wa mt" id="pay-wa" style="width:100%">💬 Enviar comprovante / falar com o suporte</button>` : ""}

          ${!configured ? `<div class="banner info" style="margin-top:12px">🛠️ <div><b>Pagamento ainda não configurado nesta instalação.</b><br/>
            Dono do sistema: preencha <code>PLAN.paymentLink</code>, <code>PLAN.pixKey</code> e/ou <code>PLAN.whatsapp</code>
            em <code>js/config.js</code> (aceita link do Mercado Pago, Stripe, Kiwify etc.). Instruções no README.</div></div>` : ""}
        </div>

        <div class="card">
          <h3>❓ Como funciona</h3>
          <div style="display:flex;flex-direction:column;gap:10px" class="small">
            <div>1️⃣ Sua assinatura libera o acesso à conta na nuvem — dados sincronizados e protegidos em todos os seus aparelhos.</div>
            <div>2️⃣ O pagamento é mensal, pelo botão ao lado${p.pixKey ? " ou via PIX" : ""}. Após pagar${p.whatsapp ? ", envie o comprovante pelo WhatsApp" : ""}.</div>
            <div>3️⃣ Problemas com pagamento não apagam seus dados — eles ficam guardados e voltam quando a assinatura reativa.</div>
          </div>
          <hr class="sep"/>
          <div class="muted small">Dúvidas? ${p.whatsapp ? "Chame no WhatsApp pelo botão ao lado." : "Fale com quem te forneceu o sistema."}</div>
        </div>
      </div>`;

    const refresh = U.$("#sub-refresh");
    if (refresh) refresh.onclick = async (e) => {
      e.preventDefault();
      refresh.textContent = "Consultando…";
      App.subscription = await Cloud.fetchSubscription();
      App.render();
      UI.toast("Status da assinatura atualizado ☁️", "ok");
    };
    if (p.paymentLink) U.$("#pay-link").onclick = () => window.open(p.paymentLink, "_blank");
    if (p.pixKey) U.$("#pay-pix-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(p.pixKey); UI.toast("Chave PIX copiada 📋", "ok"); }
      catch (e) { UI.toast("Copie manualmente: " + p.pixKey, "bad"); }
    };
    if (p.whatsapp) U.$("#pay-wa").onclick = () => {
      const msg = `Olá! Sou ${sess ? sess.user.email : "usuário"} do ${App.state.settings.businessName || "Ice Sistema"} e quero falar sobre minha assinatura.`;
      window.open(U.waLink(p.whatsapp, msg), "_blank");
    };
  },
};
