import { supabase } from './supabaseClient';

const MAX_RECORDS = 20;

function mapRow(row) {
  return {
    id: row.id,
    timestamp: new Date(row.created_at).toLocaleString(),
    experimentType: row.experiment_type ?? 'collision',
    v1i: row.v1i,
    v2i: row.v2i,
    v1f: row.v1f,
    v2f: row.v2f,
    mass1: row.mass1,
    mass2: row.mass2,
    frictionAir: row.friction_air,
    restitution: row.restitution,
    friction: row.friction,
  };
}

/**
 * @param {string} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchLearningRecords(userId) {
  const { data, error } = await supabase
    .from('learning_records')
    .select('id, experiment_type, v1i, v2i, v1f, v2f, mass1, mass2, friction_air, restitution, friction, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_RECORDS);

  if (error) {
    console.error('[learning_records] fetch', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * @param {string} userId
 * @param {{ experimentType?: string, v1i: number, v2i: number, v1f: number, v2f: number, mass1: number, mass2: number, frictionAir?: number, restitution?: number, friction?: number }} payload
 * @returns {Promise<ReturnType<typeof mapRow> | null>}
 */
export async function insertLearningRecord(userId, payload) {
  const { data, error } = await supabase
    .from('learning_records')
    .insert({
      user_id: userId,
      experiment_type: payload.experimentType ?? 'collision',
      v1i: payload.v1i,
      v2i: payload.v2i,
      v1f: payload.v1f,
      v2f: payload.v2f,
      mass1: payload.mass1,
      mass2: payload.mass2,
      friction_air: payload.frictionAir ?? 0.004,
      restitution: payload.restitution ?? 0.9,
      friction: payload.friction ?? 0,
    })
    .select('id, experiment_type, v1i, v2i, v1f, v2f, mass1, mass2, friction_air, restitution, friction, created_at')
    .single();

  if (error) {
    console.error('[learning_records] insert', error.message);
    throw new Error(error.message);
  }
  if (!data) throw new Error('Insert succeeded but no row returned.');
  return mapRow(data);
}

/**
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function clearLearningRecords(userId) {
  const { error } = await supabase.from('learning_records').delete().eq('user_id', userId);
  if (error) {
    console.error('[learning_records] clear', error.message);
    return false;
  }
  return true;
}
