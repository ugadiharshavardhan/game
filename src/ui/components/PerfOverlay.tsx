import { useState } from 'react';
import type { PerfReport } from '../../shared/events';
import { useGameEvent } from '../hooks/useGameEvent';

/**
 * What this device is managing, and what the PerformanceManager has done about it, in the corner —
 * opened with `?perf=1` on any build, including the one the contest is judged on.
 *
 * It exists because the numbers that matter are the ones from a real phone on a real network, and
 * that is a test nobody can run from a desktop. Off unless asked for: the engine does not even
 * report without the flag. Updated twice a second, so it never re-renders React per frame.
 */
export function PerfOverlay() {
  const [perf, setPerf] = useState<PerfReport | null>(null);
  useGameEvent('ui:perf', setPerf);
  if (!perf) return null;
  const rows: Array<[string, string]> = [
    ['fps', `${perf.fps} (worst ${perf.worstMs} ms)`],
    ['quality', `${perf.quality.toUpperCase()} · ${perf.requested === 'auto' ? 'auto' : 'manual'}`],
    ['step', `${perf.step + 1}/${perf.steps}`],
    ['pixels', `×${perf.pixelRatio.toFixed(2)}`],
    ['shadow', `${perf.shadowMapSize}${perf.shadowEvery > 1 ? ` · 1/${perf.shadowEvery}` : ''}`],
    ['bloom', perf.bloom ? 'on' : 'off'],
    ['particles', `${Math.round(perf.particles * 100)}%`],
    ['lod', `×${perf.lodScale.toFixed(2)}`],
    ['far npc', `${perf.npcHz} Hz`],
    ['lights', `${perf.lights}`],
    ['draws', `${perf.calls}`],
    ['tris', `${(perf.triangles / 1000).toFixed(0)}k`],
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
      <div className="mt-0.5 max-w-40 truncate text-dusk-400/80">{perf.device}</div>
    </div>
  );
}
