import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { applySkinDetail, PORE_STRENGTH } from './skinDetail';

const person = () => {
  const g = new Group();
  const skin = new MeshStandardMaterial({ name: 'Woman_Skin' });
  const cloth = new MeshStandardMaterial({ name: 'Woman_Saree_Cloth' });
  g.add(new Mesh(new BoxGeometry(), skin), new Mesh(new BoxGeometry(), skin), new Mesh(new BoxGeometry(), cloth));
  return { g, skin, cloth };
};
const pores = new DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);

describe('applySkinDetail', () => {
  it('puts the pores on skin, once per material, and on nothing else', () => {
    const { g, skin, cloth } = person();
    expect(applySkinDetail(g, pores), 'two meshes share one skin').toBe(1);
    expect(skin.normalMap).toBe(pores);
    expect(skin.normalScale.x).toBe(PORE_STRENGTH);
    expect(cloth.normalMap, 'cloth keeps its own weave').toBeNull();
  });

  it('is safe to do twice', () => {
    const { g, skin } = person();
    applySkinDetail(g, pores);
    applySkinDetail(g, pores);
    expect(skin.normalMap).toBe(pores);
  });
});
