import { ITEMS, ITEM_IDS } from '../../shared/items';

/** Short enough to read standing up: what you are doing, and the one rule that matters. */
export function HowToPlay({ onBack, onTutorial }: { onBack: () => void; onTutorial: () => void }) {
  const lines: Array<[string, string]> = [
    ['Gather', 'Seven kinds of offering are scattered around the village. Your bag holds fifteen, so it takes more than one trip.'],
    ['Watch the sky', 'The lamps go up, the birds go quiet, a bell rings, the villagers go home. That means the moon is coming.'],
    ['Step inside', 'Any door with a lamp beside it opens. Indoors the moonlight cannot touch you; outside it builds up.'],
    ['Offer', 'Carry everything to the temple and give it to Bappa. When the last offering is placed, the puja begins.'],
  ];
  return (
    <div className="w-full max-w-md text-left">
      <dl className="space-y-4">
        {lines.map(([title, body]) => (
          <div key={title}>
            <dt className="font-display text-lg text-lamp-200">{title}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-dusk-400">{body}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Control keys="WASD / stick" what="Move" />
        <Control keys="Mouse / drag" what="Look" />
        <Control keys="Shift" what="Run" />
        <Control keys="C" what="Sneak" />
        <Control keys="E / COLLECT" what="Interact" />
        <Control keys="I or Tab / BAG" what="The bag" />
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-dusk-400/80">
        The puja asks for {ITEM_IDS.map((id) => `${ITEMS[id].required} ${ITEMS[id].name.toLowerCase()}`).join(', ')}.
      </p>

      <button type="button" onClick={onTutorial} className="mt-6 w-full rounded-xl bg-lamp-400 px-6 py-3 font-display text-lg text-night-950 transition hover:bg-lamp-200 active:scale-[0.98]">
        Show me — two minutes
      </button>
      <button type="button" onClick={onBack} className="mt-3 w-full rounded-xl border border-night-700 px-6 py-2.5 text-sm text-dusk-400 transition hover:border-dusk-400 hover:text-lamp-200">
        Back
      </button>
    </div>
  );
}

function Control({ keys, what }: { keys: string; what: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-night-800/70 pb-1.5">
      <span className="text-dusk-400">{what}</span>
      <span className="text-right text-lamp-200/80">{keys}</span>
    </div>
  );
}
