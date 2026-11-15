// Usage: node su57fromf18.mjs fighter.glb su-57.glb
// The Su-57 cockpit, built on the F/A-18C cockpit (cockpits/fighter.glb): the front canopy bow goes
// (the Su-57's canopy is frameless at the front), the panels take the Su-57's light blue-grey and a
// wide round HUD combiner sits between the HUD posts. Live screens come from screens3d.js.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
});
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp); const root = doc.getRoot(); const scene = root.listScenes()[0]; const buffer = root.listBuffers()[0];

// 1. drop the canopy bow: an arc of radius ~0.36 m around (x 0, y 3.27) about half a metre ahead of the eye
const BOW = { y: 3.27, r0: 0.32, r1: 0.85, z0: -4.85, z1: -4.25 };
let dropped = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'); const v = [];
    const wp = i => { P.getElement(i, v); return [W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12], W[1]*v[0]+W[5]*v[1]+W[9]*v[2]+W[13], W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14]]; };
    // judged by the triangle's centre: above the glareshield, or beside the instrument panel
    const bow = (x, y, z) => { const r = Math.hypot(x, y - BOW.y); return z > BOW.z0 && z < BOW.z1 && r > BOW.r0 && r < BOW.r1 && (y > 3.43 || (Math.abs(x) > 0.31 && y > 3.2)); };
    const idx = prim.getIndices().getArray(); const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = wp(idx[t]), b = wp(idx[t + 1]), c = wp(idx[t + 2]);
      if (bow((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3)) { dropped++; continue; }
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buffer)); compactPrimitive(prim);
  }
}

// 2. the Su-57's light blue-grey: tint every surface, darks stay dark
const TINT = [0.55, 0.80, 1.0];
for (const m of root.listMaterials()) { const c = m.getBaseColorFactor(); m.setBaseColorFactor([c[0] * TINT[0], c[1] * TINT[1], c[2] * TINT[2], c[3]]); }

// 3. wide round HUD combiner: a ring of small boxes and a faint green glass disc
const lin = h => [1, 3, 5].map(i => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
const frame = doc.createMaterial('su57_hud_frame').setBaseColorFactor([...lin('#1d2328'), 1]).setRoughnessFactor(0.6).setMetallicFactor(0.2);
const glass = doc.createMaterial('su57_hud_glass').setBaseColorFactor([...lin('#7fd8a8'), 0.13]).setAlphaMode('BLEND').setRoughnessFactor(0.05).setDoubleSided(true);
const HUD = [0, 3.565, -4.30], R = 0.105;
const P = [], N = [], I = [];
const quad = (a, b, c, d, n) => { const k = P.length / 3; P.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) N.push(...n); I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
const SEG = 48, TH = 0.014, DEPTH = 0.02;
for (let s = 0; s < SEG; s++) {
  const a0 = (s / SEG) * Math.PI * 2, a1 = ((s + 1) / SEG) * Math.PI * 2;
  if (Math.sin((a0 + a1) / 2) < -0.9) continue;                 // open at the bottom, over the UFC
  const ring = (a, r, z) => [HUD[0] + Math.cos(a) * r, HUD[1] + Math.sin(a) * r, HUD[2] + z];
  const ro = R + TH, ri = R;
  quad(ring(a0, ri, -DEPTH / 2), ring(a1, ri, -DEPTH / 2), ring(a1, ro, -DEPTH / 2), ring(a0, ro, -DEPTH / 2), [0, 0, -1]);   // face toward the eye
  quad(ring(a0, ro, -DEPTH / 2), ring(a1, ro, -DEPTH / 2), ring(a1, ro, DEPTH / 2), ring(a0, ro, DEPTH / 2), [Math.cos(a0), Math.sin(a0), 0]);
  quad(ring(a0, ri, DEPTH / 2), ring(a1, ri, DEPTH / 2), ring(a1, ri, -DEPTH / 2), ring(a0, ri, -DEPTH / 2), [-Math.cos(a0), -Math.sin(a0), 0]);
}
const acc = (arr, type, T = Float32Array) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buffer);
const ringPrim = doc.createPrimitive().setMaterial(frame).setAttribute('POSITION', acc(P, 'VEC3')).setAttribute('NORMAL', acc(N, 'VEC3')).setIndices(acc(I, 'SCALAR', Uint32Array));
const GP = [...HUD], GN = [0, 0, -1], GI = [];
for (let s = 0; s <= SEG; s++) { const a = (s / SEG) * Math.PI * 2; GP.push(HUD[0] + Math.cos(a) * R, HUD[1] + Math.sin(a) * R, HUD[2]); GN.push(0, 0, -1); }
for (let s = 0; s < SEG; s++) GI.push(0, s + 1, s + 2);
const glassPrim = doc.createPrimitive().setMaterial(glass).setAttribute('POSITION', acc(GP, 'VEC3')).setAttribute('NORMAL', acc(GN, 'VEC3')).setIndices(acc(GI, 'SCALAR', Uint32Array));
scene.addChild(doc.createNode('su57_hud').setMesh(doc.createMesh('su57_hud').addPrimitive(ringPrim).addPrimitive(glassPrim)));

doc.getRoot().getAsset().extras = { ...(doc.getRoot().getAsset().extras || {}), title: 'Su-57 cockpit (built on the F/A-18C cockpit photogrammetry by VTX)' };
await doc.transform(prune(), draco({ quantizePosition: 16 }));
await io.write(out, doc);
console.log(`${out}: ${dropped} canopy-bow triangles dropped, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
