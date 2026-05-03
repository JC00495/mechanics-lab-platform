import { supabase } from './supabaseClient';

const PROFILE_COLUMNS = 'user_id, nickname, updated_at';

export function createDefaultNickname() {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `用户${suffix}`;
}

function mapProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    nickname: row.nickname ?? '',
    updatedAt: row.updated_at ?? null,
  };
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('[profiles] fetch', error.message);
    return null;
  }
  return mapProfile(data);
}

export async function ensureProfile(userId) {
  const defaultNickname = createDefaultNickname();
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      nickname: defaultNickname,
    },
    { onConflict: 'user_id', ignoreDuplicates: true }
  );
  if (error) {
    console.error('[profiles] ensure', error.message);
    throw new Error(error.message);
  }
}

export async function updateNickname(userId, nickname) {
  const cleaned = nickname.trim();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      nickname: cleaned,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) {
    console.error('[profiles] update', error.message);
    throw new Error(error.message);
  }
  return mapProfile(data);
}
