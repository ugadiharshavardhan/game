import { ITEMS, ITEM_IDS, TOTAL_REQUIRED } from '../../shared/items';

/** What the puja asks for, and why — the game's shopping list, with its manners. */
export function PujaList({ onBack }: { onBack: () => void }) {
  return (
    <div className="w-full max-w-md text-left">
      <p className="text-[10px] uppercase tracking-[0.3em] text-dusk-400">The puja asks for</p>
      <ul className="mt-3 space-y-2.5">
        {ITEM_IDS.map((id) => (
          <li key={id} className="flex gap-3">
            <span aria-hidden className="mt-0.5 text-xl">
              {ITEMS[id].glyph}
            </span>
            <span className="flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-lamp-200">{ITEMS[id].name}</span>
                <span className="font-display tabular-nums text-lamp-400">×{ITEMS[id].required}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-dusk-400">{ITEMS[id].description}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-dusk-400">
        {TOTAL_REQUIRED} things in all, and a bag that holds fifteen.
      </p>
      <button type="button" onClick={onBack} className="mt-6 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </div>
  );
}
