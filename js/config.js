/* =====================================================================
   ICE SISTEMA — Configuração da instância (dono do SaaS)
   =====================================================================
   Preencha com os dados do SEU projeto Supabase (veja README.md, seção
   "Configurando a nuvem"). A anon key é pública por design — a segurança
   vem do RLS (Row Level Security) criado pelo supabase.sql.

   Enquanto estes campos estiverem vazios, o app funciona 100% offline
   (localStorage) e a tela de login oferece apenas o modo offline.
   ===================================================================== */
window.ICE_CONFIG = {
  SUPABASE_URL: "https://nvrdqiklksarfxuwoznx.supabase.co", // projeto SDV VENDA (sa-east-1)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52cmRxaWtsa3NhcmZ4dXdvem54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTM1NTYsImV4cCI6MjA5OTI4OTU1Nn0.ROUCNAKgTtnLR-oAHNrGdHoeWdr3rtxPNpqNmikO0zk", // anon key pública (RLS protege os dados),

  /* ------ Assinatura (tela 💎 Assinatura) ------
     Como o app é 100% estático, a cobrança usa link de pagamento externo
     (Mercado Pago, Stripe, Kiwify etc.) e/ou PIX. Quem pagou/não pagou é
     controlado por você no painel do Supabase (Authentication → desativar
     usuário corta o acesso à nuvem). */
  PLAN: {
    name: "Plano Mensal",
    price: "R$ 19,97/mês",
    oldPrice: "R$ 49,90", // riscado na tela (promoção); deixe "" pra esconder
    benefits: [
      "Todos os módulos liberados",
      "Dados na nuvem com backup automático",
      "Acesso em vários aparelhos",
      "Suporte pelo WhatsApp",
    ],
    paymentLink: "https://mpago.la/1PkzmZC", // link de pagamento Mercado Pago
    pixKey: "",        // ex: chave PIX (email/telefone/aleatória) pra pagamento manual
    whatsapp: "",      // ex: "5511999998888" — suporte/envio de comprovante
  },
};
