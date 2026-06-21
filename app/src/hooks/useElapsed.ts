import { useEffect, useState } from "react";

/** "m:ss" elapsed since `startedAt` while `running` (ticks every second; freezes
 *  when not running or before a start time is known). */
export function useElapsed(startedAt: number | undefined, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (startedAt == null) return "0:00";
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;
}
