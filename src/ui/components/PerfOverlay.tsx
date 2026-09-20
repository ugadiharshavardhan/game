import { useState } from 'react';
import { useGameEvent } from '../hooks/useGameEvent';

/**
 * What this device is managing, in the corner — opened with `?perf=1` on any build, including the
 * one the contest is judged on.
 *
 * It exists because the numbers that matter are the ones from a real phone on a real network, and
 * that is a test nobody can run from a desktop. Off unless asked for: the engine does not even
 * count frames without the flag.
 */
export function PerfOverlay() {
  const [perf, setPerf] = useState<{ fps: number; calls: number; triangles: number; quality: string; memoryMb: number | null } | null>(null);
  useGameEvent('ui:perf', setPerf);
  if (!perf) return null;
  const rows: Array<[string, string]> = [
    ['fps', `${perf.fps}`],
    ['draws', `${perf.calls}`],
    ['tris', `${(perf.triangles / 1000).toFixed(0)}k`],
    ['quality', perf.quality],
    ...(perf.memoryMb !== null ? ([['heap', `${perf.memoryMb} MB`]] as Array<[string, string]>) : []),
  ];
  return (
    <div className="safe-top pointer-events-none absolute left-2 top-1/2 z-40 -translate-y-1/2 rounded-lg bg-night-950/70 px-2 py-1.5 font-mono text-[10px] leading-snug text-lamp-200/80 backdrop-blur-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-dusk-400">{k}</span>
          <span className="tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}
