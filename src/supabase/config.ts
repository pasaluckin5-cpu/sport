import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * False until a real Supabase project's URL/anon key are set (see .env.example). Every call
 * site must check this before touching `supabase`, so the app keeps working in fully local mode
 * — today's exact behavior — until a project is actually wired up. Cloud accounts are additive,
 * never a requirement to use the app.
 */
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

/**
 * `createClient` eagerly starts a session-recovery read from storage as soon as it's called —
 * not deferred to a React effect — and expo-router's web build statically pre-renders _layout.tsx
 * (and therefore this module) once on the server (Node.js), where `window` doesn't exist. Plain
 * `AsyncStorage`'s web implementation reaches for `window.localStorage` and throws in that
 * environment, crashing the server render. This wrapper no-ops during that one-time server pass
 * instead of touching storage; in a real browser or on native, `window` (or the RN environment)
 * behaves normally and every call passes straight through to `AsyncStorage`.
 */
const ssrSafeStorage = {
  getItem: (key: string) => (typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: ssrSafeStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
