import { useEffect, useRef } from "react";
import { useCitationLibrary } from "../stores/citationLibraryStore";
import { bridge } from "../lib/tauri-bridge";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const STALE_MS = 24 * 60 * 60 * 1000;          // re-check if >24 h old

export function useRetractionAlerts(
  onAlert: (title: string, doi: string) => void
) {
  const { items, markRetractionChecked } = useCitationLibrary();
  const alertedRef = useRef<Set<string>>(new Set());
  const checkingRef = useRef<Set<string>>(new Set()); // in-flight DOIs

  const runChecks = async () => {
    const toCheck = items.filter((i) => {
      if (!i.doi) return false;
      if (checkingRef.current.has(i.doi)) return false; // already in-flight
      const stale = !i.retractionCheckedAt || Date.now() - i.retractionCheckedAt > STALE_MS;
      return stale;
    });

    for (const item of toCheck) {
      const doi = item.doi!;
      checkingRef.current.add(doi);
      try {
        const result = await bridge.callMcpTool("check_retraction_status", { doi });
        const parsed = JSON.parse(result);
        const isRetracted = parsed?.isRetracted === true;
        markRetractionChecked(item.id, isRetracted);

        if (isRetracted && !alertedRef.current.has(item.id)) {
          alertedRef.current.add(item.id);
          onAlert(item.title ?? doi, doi);
        }
      } catch (e) {
        console.error("[CiteGuard] retraction check failed for", doi, e);
      } finally {
        checkingRef.current.delete(doi);
      }
    }
  };

  useEffect(() => {
    runChecks();
    const timer = setInterval(runChecks, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [items]); // re-run when library changes, dedup prevents redundant calls
}
