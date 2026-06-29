// ============================================================
// CRM Pro — Edge Function: ai-chat
// Proxy seguro para a OpenAI. A chave NUNCA vai para o navegador.
//
// Deploy:
//   supabase functions deploy ai-chat
// Configurar o segredo (uma vez):
//   supabase secrets set OPENAI_API_KEY=sk-...   (sua chave real)
//   supabase secrets set OPENAI_MODEL=gpt-4o-mini   (opcional)
//
// O cliente chama via supabase.functions.invoke('ai-chat', { body: { messages } }),
// que já inclui o JWT da sessão no header Authorization — exigimos isso abaixo.
// ============================================================

// Tipos do runtime Deno/Supabase (resolvidos pela extensão Deno do VS Code
// e automaticamente no `supabase functions deploy`).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const DEFAULT_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

// CORS — restrinja em produção ao seu domínio (ex.: https://murilobyte.github.io)
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Exige usuário autenticado (o supabase-js envia o JWT da sessão)
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Não autenticado" }, 401);
  }

  if (!OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY não configurada no servidor" }, 500);
  }

  let payload: { messages?: unknown; model?: string; temperature?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages é obrigatório" }, 400);
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: payload.model || DEFAULT_MODEL,
        messages,
        temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("OpenAI error:", resp.status, detail);
      return json({ error: "Falha ao consultar a IA" }, 502);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return json({ content });
  } catch (err) {
    console.error("ai-chat exception:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
