/**
 * Supabase Service — cliente singleton e helpers de query
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../config/supabase.js';

const { createClient } = supabase; // SDK via CDN global

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'crm-auth-token',
  },
  realtime: { params: { eventsPerSecond: 10 } },
  global: { headers: { 'x-application-name': 'CRM-Pro' } },
});

/**
 * Helper: executa uma query e retorna { data, error, count }
 * Centraliza o tratamento de erros de rede
 */
export async function query(fn) {
  try {
    const result = await fn(db);
    if (result.error) throw result.error;
    return { data: result.data, count: result.count, error: null };
  } catch (err) {
    console.error('[Supabase]', err.message);
    return { data: null, count: 0, error: err };
  }
}

/**
 * Helper: RPC call
 */
export async function rpc(name, params = {}) {
  const { data, error } = await db.rpc(name, params);
  if (error) { console.error('[RPC]', name, error); return null; }
  return data;
}

/**
 * Helper: paginação padrão
 */
export function paginate(queryBuilder, page = 1, pageSize = 25) {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  return queryBuilder.range(from, to);
}

export default db;
