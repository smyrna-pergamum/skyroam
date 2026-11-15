// Usage: see tools/models/README.md
// Split the landing gear of a normalised model into its own node, "skyroam_gear", so the game can retract it.
// The gear is given as boxes around each leg: "x0,x1,z0,z1,top;..." (metres, model frame; a leading
// "m" mirrors the box to the other side). Every triangle below `top` whose centre lies in a box moves to
// the gear node. Find the boxes with lowclusters.mjs / undermap.mjs.
// usage: node gear.mjs in.glb out.glb "m0.7,1.8,-11.1,-9.9,1.5;-0.5,0.5,-6.1,-5.1,1.5"
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco, compactPrimitive } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
});
const [inp, out, zonesArg] = process.argv.slice(2);
const zones = [];
for (const z of zonesArg.split(';')) {
  const mirror = z.startsWith('m'); const b = z.replace(/^m/, '').split(',').map(Number);
  zones.push(b); if (mirror) zones.push([-b[1], -b[0], b[2], b[3], b[4]]);
}
const doc = await io.read(inp); const root = doc.getRoot(); const scene = root.listScenes()[0];
const buffer = root.listBuffers()[0];

const prims = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'); const n = P.getCount(); const v = [];
    const wp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { P.getElement(i, v);
      wp[i * 3] = W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12]; wp[i * 3 + 1] = W[1]*v[0]+W[5]*v[1]+W[9]*v[2]+W[13]; wp[i * 3 + 2] = W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14]; }
    const idx = prim.getIndices() ? Array.from(prim.getIndices().getArray()) : Array.from({ length: n }, (_, i) => i);
    prims.push({ node, prim, wp, idx });
  }
}
const zoneOf = (x, z) => zones.find(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]);

const gearRoot = doc.createNode('skyroam_gear'); scene.addChild(gearRoot);
let moved = 0, top = 0;
for (const { node, prim, wp, idx } of prims) {
  const keep = [], take = [];
  for (let t = 0; t < idx.length; t += 3) {
    let cx = 0, cz = 0, ty = 0;
    for (let k = 0; k < 3; k++) { const i = idx[t + k]; cx += wp[i * 3]; cz += wp[i * 3 + 2]; ty = Math.max(ty, wp[i * 3 + 1]); }
    const zn = zoneOf(cx / 3, cz / 3);
    if (zn && ty <= zn[4]) { take.push(idx[t], idx[t + 1], idx[t + 2]); top = Math.max(top, ty); } else keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (!take.length) continue;
  moved += take.length / 3;
  const gp = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode())
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(take)).setBuffer(buffer));
  for (const sem of prim.listSemantics()) gp.setAttribute(sem, prim.getAttribute(sem));
  compactPrimitive(gp); // own vertex data: shared accessors do not survive Draco in Cesium
  gearRoot.addChild(doc.createNode(`${node.getName() || 'part'}_gear`).setMatrix(node.getWorldMatrix()).setMesh(doc.createMesh('gear').addPrimitive(gp)));
  if (keep.length) { prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buffer)); compactPrimitive(prim); }
  else prim.dispose();
}
// where the legs meet the airframe: the game folds the gear up toward this height
gearRoot.setExtras({ top: +top.toFixed(3) });
await doc.transform(prune(), draco({ quantizePosition: 16 }));
await io.write(out, doc);
console.log(`${out.split(/[\\/]/).pop()}: ${zones.length} gear boxes [${zones.map(b => `x${((b[0] + b[1]) / 2).toFixed(1)} z${((b[2] + b[3]) / 2).toFixed(1)}`).join(' ')}], ${moved} tris moved, gear top ${top.toFixed(2)} m, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
