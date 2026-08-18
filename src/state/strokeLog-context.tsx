import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { StrokeCountEntry } from '@/domain/types';
import { loadStrokeLog, saveStrokeLog } from '@/storage/strokeLog-storage';

interface StrokeLogContextValue {
  isReady: boolean;
  entries: StrokeCountEntry[];
  addEntry: (distance: number, strokeCount: number) => void;
  removeEntry: (id: string) => void;
  /** Average stroke count logged for a given distance, or null if there's no history for it. */
  averageForDistance: (distance: number) => number | null;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const StrokeLogContext = createContext<StrokeLogContextValue | null>(null);

export function StrokeLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<StrokeCountEntry[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStrokeLog().then((stored) => {
      if (!cancelled) {
        setEntries(stored);
        setIsReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<StrokeLogContextValue>(
    () => ({
      isReady,
      entries,
      addEntry: (distance, strokeCount) => {
        const next = [
          { id: generateId(), dateISO: new Date().toISOString().slice(0, 10), distance, strokeCount },
          ...entries,
        ];
        setEntries(next);
        saveStrokeLog(next);
      },
      removeEntry: (id) => {
        const next = entries.filter((e) => e.id !== id);
        setEntries(next);
        saveStrokeLog(next);
      },
      averageForDistance: (distance) => {
        const matching = entries.filter((e) => e.distance === distance);
        if (matching.length === 0) return null;
        return matching.reduce((sum, e) => sum + e.strokeCount, 0) / matching.length;
      },
    }),
    [entries, isReady],
  );

  return <StrokeLogContext.Provider value={value}>{children}</StrokeLogContext.Provider>;
}

export function useStrokeLog(): StrokeLogContextValue {
  const ctx = useContext(StrokeLogContext);
  if (!ctx) throw new Error('useStrokeLog must be used within a StrokeLogProvider');
  return ctx;
}
