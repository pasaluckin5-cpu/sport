import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { StrokeCountEntry } from '@/domain/types';
import { loadStrokeLog, saveStrokeLog } from '@/storage/strokeLog-storage';
import { bulkUploadStrokeLog, deleteCloudStrokeEntry, fetchCloudStrokeLog, insertCloudStrokeEntry } from '@/supabase/sync';

import { useAuth } from './auth-context';

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
  const { session } = useAuth();

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

  // Same pattern as PlanProvider/HistoryProvider. After a first-sign-in upload, the cloud rows
  // get real bigint ids (different from the locally-generated string ids), so this re-fetches
  // once more after uploading — otherwise removeEntry couldn't find the newly-synced rows by
  // their now-stale local id.
  useEffect(() => {
    if (!session || !isReady) return;
    let cancelled = false;
    fetchCloudStrokeLog(session.user.id).then(async (cloudEntries) => {
      if (cancelled) return;
      if (cloudEntries.length > 0) {
        setEntries(cloudEntries);
        saveStrokeLog(cloudEntries);
      } else if (entries.length > 0) {
        await bulkUploadStrokeLog(session.user.id, entries);
        const reFetched = await fetchCloudStrokeLog(session.user.id);
        if (cancelled) return;
        setEntries(reFetched);
        saveStrokeLog(reFetched);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, isReady]);

  const value = useMemo<StrokeLogContextValue>(
    () => ({
      isReady,
      entries,
      addEntry: (distance, strokeCount) => {
        const entry = { id: generateId(), dateISO: new Date().toISOString().slice(0, 10), distance, strokeCount };
        const next = [entry, ...entries];
        setEntries(next);
        saveStrokeLog(next);
        if (session) {
          insertCloudStrokeEntry(session.user.id, entry).then(() =>
            fetchCloudStrokeLog(session.user.id).then((cloudEntries) => {
              setEntries(cloudEntries);
              saveStrokeLog(cloudEntries);
            }),
          );
        }
      },
      removeEntry: (id) => {
        const next = entries.filter((e) => e.id !== id);
        setEntries(next);
        saveStrokeLog(next);
        if (session) deleteCloudStrokeEntry(id);
      },
      averageForDistance: (distance) => {
        const matching = entries.filter((e) => e.distance === distance);
        if (matching.length === 0) return null;
        return matching.reduce((sum, e) => sum + e.strokeCount, 0) / matching.length;
      },
    }),
    [entries, isReady, session],
  );

  return <StrokeLogContext.Provider value={value}>{children}</StrokeLogContext.Provider>;
}

export function useStrokeLog(): StrokeLogContextValue {
  const ctx = useContext(StrokeLogContext);
  if (!ctx) throw new Error('useStrokeLog must be used within a StrokeLogProvider');
  return ctx;
}
