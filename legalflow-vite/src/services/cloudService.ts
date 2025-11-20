import { createClient } from '@supabase/supabase-js';
import type { Transaction } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const TABLE_NAME = 'legalflow_state';

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface CloudSnapshot {
  transactions: Transaction[];
  initialBalance: number;
  updatedAt: string;
}

export const fetchCloudSnapshot = async (
  userId: string
): Promise<CloudSnapshot | null> => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('user_id,data,updated_at')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    transactions: data.data?.transactions ?? [],
    initialBalance: data.data?.initialBalance ?? 0,
    updatedAt: data.updated_at,
  };
};

export const persistCloudSnapshot = async (
  userId: string,
  payload: CloudSnapshot
) => {
  if (!supabase) {
    return;
  }

  await supabase.from(TABLE_NAME).upsert(
    {
      user_id: userId,
      data: {
        transactions: payload.transactions,
        initialBalance: payload.initialBalance,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
};

