import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CompletionMap, loadHistory, saveHistory } from '@/storage/history-storage';

export type SessionKind = 'pool' | 'gym';

export interface WeekCompletionCount {
  weekKey: string;
  count: number;
}

interface HistoryContextValue {
  isReady: boolean;
  isCompleted: (weekKey: string, dayIndex: number, kind: SessionKind) => boolean;
  toggleCompleted: (weekKey: string, dayIndex: number, kind: SessionKind) => void;
  weekCounts: WeekCompletionCount[];
}

function completionKey(weekKey: string, dayIndex: number, kind: SessionKind): string {
  return `${weekKey}:${dayIndex}:${kind}`;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<CompletionMap>({});
  const [isReady, setIsReady] = useState(false);

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

  const value = useMemo<HistoryContextValue>(() => {
    const counts = new Map<string, number>();
    for (const key of Object.keys(history)) {
      const weekKey = key.split(':')[0];
      counts.set(weekKey, (counts.get(weekKey) ?? 0) + 1);
    }
    const weekCounts = Array.from(counts.entries())
      .map(([weekKey, count]) => ({ weekKey, count }))
      .sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));

    return {
      isReady,
      weekCounts,
      isCompleted: (weekKey, dayIndex, kind) => !!history[completionKey(weekKey, dayIndex, kind)],
      toggleCompleted: (weekKey, dayIndex, kind) => {
        const key = completionKey(weekKey, dayIndex, kind);
        const next = { ...history };
        if (next[key]) delete next[key];
        else next[key] = true;
        setHistory(next);
        saveHistory(next);
      },
    };
  }, [history, isReady]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}
