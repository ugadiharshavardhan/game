/**
 * The pandal and the festival decorations: Ganesh Chaturthi eve in the village. (The puja items
 * the player collects are pujaItems.ts.)
 *
 *   festival.pandal.ts     the mandal's pandal on the festival ground, the chowki awaiting Bappa
 *   festival.street.ts     bunting, banners, flags, string lights, kandils, the big rangoli, diyas
 *   festival.kit.ts        cloth and atlas materials, bamboo, rope, the instanced ornaments
 *   festival.things.ts     ritual objects: diyas, thalis, kalash, samai, coconuts, baskets, flowers
 *   festival.cloth.ts      tent roof, pleated walls, scalloped valances
 *   festival.paint.ts      the painted-cloth atlas and the square's rangoli
 *
 * Every marigold, mango leaf, bulb, flag and kandil in the festival — pandal and street — is one
 * instance in one of six InstancedMeshes, so the whole dressing costs a handful of draws.
 */
import { Ornaments } from './festival.kit';
import { buildPandal } from './festival.pandal';
import { buildStreet } from './festival.street';
import type { ArtContext } from './runtime';

export function build(a: ArtContext): boolean {
  const orn = new Ornaments();
  const pandal = a.layout.landmarks.find((l) => l.kind === 'pandal');
  if (pandal) buildPandal(a, pandal, orn);
  buildStreet(a, orn);
  orn.build(a);
  return true;
}
