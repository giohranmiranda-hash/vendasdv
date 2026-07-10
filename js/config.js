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
  SUPABASE_URL: "", // ex: "https://abcdefghijklm.supabase.co"
  SUPABASE_ANON_KEY: "", // ex: "eyJhbGciOiJIUzI1NiIs..."
};
