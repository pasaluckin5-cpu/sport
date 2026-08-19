import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { SessionFeedback } from '@/domain/types';
import { CompletionMap, loadHistory, saveHistory } from '@/storage/history-storage';
import { bulkUploadCompletions, fetchCloudCompletions, setCloudCompletion } from '@/supabase/sync';

import { useAuth } from './auth-context';

export type SessionKind = 'pool' | 'gym';

export interface WeekCompletionCount {
  weekKey: string;
  count: number;
}

interface HistoryContextValue {
  isReady: boolean;
  isCompleted: (weekKey: string, dayIndex: number, kind: SessionKind) => boolean;
  toggleCompleted: (weekKey: string, dayIndex: number, kind: SessionKind) => void;
  getFeedback: (weekKey: string, dayIndex: number, kind: SessionKind) => SessionFeedback | undefined;
  setFeedback: (weekKey: string, dayIndex: number, kind: SessionKind, feedback: SessionFeedback) => void;
  /** The athlete's most recent logged session feedback entries, newest first — see periodization.ts. */
  recentFeedback: SessionFeedback[];
  weekCounts: WeekCompletionCount[];
}

const RECENT_FEEDBACK_LIMIT = 6;

function completionKey(weekKey: string, dayIndex: number, kind: SessionKind): string {
  return `${weekKey}:${dayIndex}:${kind}`;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<CompletionMap>({});
  const [isReady, setIsReady] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    let cancelled = false;
    loadHistory().then((stored) => {
      if (!cancelled) {
        setHistory(stored);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same pattern as PlanProvider: cloud wins if it already has rows (returning user, new
  // device); otherwise the local history — if any — is uploaded once. See plan-context.tsx for
  // the fuller rationale; kept identical here so both stay easy to compare. Difference: cloud
  // completion rows are booleans only (no feedback column yet — see setFeedback's own note), so
  // any locally-logged feedback objects are layered back on top of the cloud map rather than
  // being discarded, to avoid losing detail a signed-in athlete already recorded on this device.
  useEffect(() => {
    if (!session || !isReady) return;
    let cancelled = false;
    fetchCloudCompletions(session.user.id).then((cloudHistory) => {
      if (cancelled) return;
      if (Object.keys(cloudHistory).length > 0) {
        const merged: CompletionMap = { ...cloudHistory };
        for (const [key, value] of Object.entries(history)) {
          if (typeof value === 'object') merged[key] = value;
        }
        setHistory(merged);
        saveHistory(merged);
      } else if (Object.keys(history).length > 0) {
        bulkUploadCompletions(session.user.id, history);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, isReady]);

  const value = useMemo<HistoryContextValue>(() => {
    const counts = new Map<string, number>();
    for (const key of Object.keys(history)) {
      const weekKey = key.split(':')[0];
      counts.set(weekKey, (counts.get(weekKey) ?? 0) + 1);
    }
    const weekCounts = Array.from(counts.entries())
      .map(([weekKey, count]) => ({ weekKey, count }))
      .sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));

    const recentFeedback = Object.entries(history)
      .filter((entry): entry is [string, SessionFeedback] => typeof entry[1] === 'object')
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, RECENT_FEEDBACK_LIMIT)
      .map(([, feedback]) => feedback);

    return {
      isReady,
      weekCounts,
      recentFeedback,
      isCompleted: (weekKey, dayIndex, kind) => !!history[completionKey(weekKey, dayIndex, kind)],
      getFeedback: (weekKey, dayIndex, kind) => {
        const v = history[completionKey(weekKey, dayIndex, kind)];
        return v && typeof v === 'object' ? v : undefined;
      },
      toggleCompleted: (weekKey, dayIndex, kind) => {
        const key = completionKey(weekKey, dayIndex, kind);
        const next = { ...history };
        const willBeCompleted = !next[key];
        if (next[key]) delete next[key];
        else next[key] = true;
        setHistory(next);
        saveHistory(next);
        if (session) setCloudCompletion(session.user.id, weekKey, dayIndex, kind, willBeCompleted);
      },
      setFeedback: (weekKey, dayIndex, kind, feedback) => {
        const key = completionKey(weekKey, dayIndex, kind);
        const next = { ...history, [key]: feedback };
        setHistory(next);
        saveHistory(next);
        // Cloud only tracks completion as a boolean today (no feedback column) — still record
        // the completion itself so the cloud row stays in sync with "this session is done".
        if (session) setCloudCompletion(session.user.id, weekKey, dayIndex, kind, true);
      },
    };
  }, [history, isReady, session]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}
