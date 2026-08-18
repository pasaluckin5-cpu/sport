import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '@/supabase/config';
import { ProfileRow } from '@/supabase/types';

export interface AuthResult {
  error: string | null;
  /** true when sign-up succeeded but the project requires email confirmation before sign-in. */
  needsConfirmation?: boolean;
}

interface AuthContextValue {
  /** Whether the initial session check has finished — mirrors the isReady pattern used by
   *  PlanProvider/HistoryProvider elsewhere in src/state. */
  isReady: boolean;
  /** False when no Supabase project is configured (see .env.example) — every screen that offers
   *  account features should hide behind this, so the app stays fully local otherwise. */
  isConfigured: boolean;
  session: Session | null;
  profile: ProfileRow | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as ProfileRow | null) ?? null);
  }

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setIsReady(true);
      if (data.session) loadProfile(data.session.user.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadProfile(nextSession.user.id);
      else setProfile(null);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isConfigured: isSupabaseConfigured,
      session,
      profile,
      signUp: async (email, password) => {
        if (!supabase) return { error: 'Cloud accounts are not configured in this build.' };
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { error: error.message };
        // A project with email confirmation enabled returns a user but no session yet.
        return { error: null, needsConfirmation: !data.session };
      },
      signIn: async (email, password) => {
        if (!supabase) return { error: 'Cloud accounts are not configured in this build.' };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? error.message : null };
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (session) await loadProfile(session.user.id);
      },
    }),
    [isReady, session, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
