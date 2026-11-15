// Usage: see tools/models/README.md
// Cut a normalised aircraft down to its cockpit section: keep triangles with a vertex inside a box.
// usage: node cut.mjs in.glb out.glb xmin xmax ymin ymax zmin zmax
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco, compactPrimitive, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
});
const [inp, out, ...b] = process.argv.slice(2); const [x0, x1, y0, y1, z0, z1] = b.map(Number);
const doc = await io.read(inp); const root = doc.getRoot();
let kept = 0, total = 0;
// glass would tint the whole view (and hide city lights at night): drop see-through materials
const GLASS = /glass|glas|steklo|window|windshield|windscreen|canopy|cam_|kanopi/i;
let dropped = [];
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const mat = prim.getMaterial(); if (!mat) continue;
  const a = mat.getBaseColorFactor()[3];
  if (mat.getAlphaMode() === 'BLEND' && (a < 0.7 || GLASS.test(mat.getName()))) { dropped.push(`${mat.getName()}(${a.toFixed(2)})`); prim.dispose(); }
}
console.log('  glass dropped:', dropped.join(' ') || 'none');
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'); const I = prim.getIndices(); const v = [];
    const inside = new Uint8Array(P.getCount());
    for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v);
      const x = W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12], y = W[1]*v[0]+W[5]*v[1]+W[9]*v[2]+W[13], z = W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14];
      inside[i] = x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 ? 1 : 0; }
    const src = I ? I.getArray() : Uint32Array.from({ length: P.getCount() }, (_, i) => i);
    const keep = [];
    for (let t = 0; t < src.length; t += 3) { total++; if (inside[src[t]] || inside[src[t + 1]] || inside[src[t + 2]]) { keep.push(src[t], src[t + 1], src[t + 2]); kept++; } }
    if (!keep.length) { prim.dispose(); continue; }
    const acc = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(root.listBuffers()[0]);
    prim.setIndices(acc); compactPrimitive(prim);
  }
}
await doc.transform(prune(), dedup(), draco({ quantizePosition: 16 }));
await io.write(out, doc);
console.log(`${out.split('/').pop()}: kept ${kept}/${total} tris, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
