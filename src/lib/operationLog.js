import { supabase } from './supabaseClient';

/**
 * 写入操作记录（需已登录）。失败仅打日志，不阻断界面。
 * @param {string} action
 * @param {Record<string, unknown> | null} [detail]
 */
export async function logOperation(action, detail) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('operation_logs').insert({
    user_id: user.id,
    action,
    detail: detail ?? null,
  });
  if (error) console.error('[operation_logs]', error.message);
}
