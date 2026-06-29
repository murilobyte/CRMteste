/**
 * Supabase Configuration
 * Altere SUPABASE_URL e SUPABASE_ANON_KEY para os valores do seu projeto.
 * Acesse: https://app.supabase.com → Settings → API
 */
export const SUPABASE_URL = 'https://jmfjlqccwwxmhncpurfb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZmpscWNjd3d4bWhuY3B1cmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1OTM5ODMsImV4cCI6MjA5ODE2OTk4M30.hKLR4Bvf-fzJLfLC0pnSQrO-FAEh9UyA6j1V4h4jYNw';

export const SUPABASE_CONFIG = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'crm-auth-token',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    headers: { 'x-application-name': 'CRM-Pro' },
  },
};

/**
 * OpenAI — apenas o NOME do modelo (não é segredo).
 * A CHAVE da OpenAI NÃO fica aqui (arquivo é público no frontend).
 * Ela vive como secret na Edge Function `ai-chat`. Veja supabase/functions/ai-chat/.
 */
export const OPENAI_MODEL = 'gpt-4o-mini';

/** App Settings */
export const APP_CONFIG = {
  name: 'CRM Pro',
  version: '1.0.0',
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  dateFormat: 'DD/MM/YYYY',
  dateTimeFormat: 'DD/MM/YYYY HH:mm',
  pagination: { defaultPageSize: 25 },
  upload: { maxFileSizeMB: 50, allowedTypes: ['image/*', 'application/pdf', '.docx', '.xlsx'] },
};
