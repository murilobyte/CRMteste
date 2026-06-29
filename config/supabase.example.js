/**
 * CONFIGURAÇÃO DO SUPABASE
 *
 * 1. Copie este arquivo: cp config/supabase.example.js config/supabase.js
 * 2. Preencha com os dados do seu projeto em https://app.supabase.com
 *
 * A chave anon (pública) é segura de expor no frontend — e DEVE ser servida
 * pelo site estático. Toda a segurança real está nas políticas RLS do Supabase.
 *
 * ATENÇÃO: NUNCA coloque chaves de servidor aqui (OpenAI, service_role).
 * Este arquivo é público. A IA usa a Edge Function `ai-chat`, que guarda a
 * chave da OpenAI como secret no servidor.
 */
export const SUPABASE_URL     = 'https://SEU_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';
// Apenas o NOME do modelo (não é segredo). A chave fica na Edge Function.
export const OPENAI_MODEL     = 'gpt-4o-mini';

export const APP_CONFIG = {
  name: 'CRM Pro',
  version: '1.0.0',
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
};
