import { useEffect, useRef, useState } from "react";

export function useRunningProgress(isRunning: boolean): number {
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      startedAtRef.current = null;
      setElapsedSec(0);
      return;
    }

    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
      setElapsedSec(0);
    }

    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isRunning]);

  return elapsedSec;
}

