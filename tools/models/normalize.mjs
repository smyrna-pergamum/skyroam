// Usage: see tools/models/README.md
// Normalise Sketchfab GLBs for SkyRoam: metres, nose +Z, up +Y, nose tip at z=0, centred in x, bottom at y=0.
// Then: transmission glass -> alpha blend, spec/gloss -> metal/rough, simplify, webp textures, draco.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, dedup, prune, weld, simplify, textureCompress, draco, metalRough, flatten, join, resample, sparse } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
});
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = process.argv[3]?.split(',');
const SRC = cfg.src, OUT = cfg.out;
fs.mkdirSync(OUT, { recursive: true });

function pcaYaw(doc) {
  // principal horizontal axis of all vertices (world space), returns angle of axis from +Z (rad)
  let sxx = 0, szz = 0, sxz = 0, mx = 0, mz = 0, n = 0; const pts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); const c = pos.getCount(); const step = Math.max(1, Math.floor(c / 4000)); const v = [];
      for (let i = 0; i < c; i += step) { pos.getElement(i, v); const x = W[0]*v[0]+W[4]*v[1]+W[8]*v[2]+W[12], z = W[2]*v[0]+W[6]*v[1]+W[10]*v[2]+W[14]; pts.push([x, z]); mx += x; mz += z; n++; }
    }
  }
  mx /= n; mz /= n; for (const [x, z] of pts) { sxx += (x-mx)**2; szz += (z-mz)**2; sxz += (x-mx)*(z-mz); }
  return 0.5 * Math.atan2(2 * sxz, szz - sxx); // angle of major axis measured from +Z toward +X
}

// Bake skinned meshes into static world-space geometry (rest pose), so bounds and transforms are right.
function mat4mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function bakeSkins(doc) {
  const root = doc.getRoot(); const scene = root.listScenes()[0];
  for (const node of root.listNodes()) {
    const skin = node.getSkin(); const mesh = node.getMesh(); if (!skin || !mesh) continue;
    const joints = skin.listJoints(); const ibm = skin.getInverseBindMatrices(); const S = joints.map((j, i) => { const m = []; ibm.getElement(i, m); return mat4mul(j.getWorldMatrix(), m); });
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0');
      const p = [], n = [], j = [], w = [];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, p); J.getElement(i, j); Wt.getElement(i, w); if (N) N.getElement(i, n);
        const M = new Array(16).fill(0); for (let k = 0; k < 4; k++) if (w[k]) for (let e = 0; e < 16; e++) M[e] += w[k] * S[j[k]][e];
        P.setElement(i, [M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12], M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13], M[2]*p[0]+M[6]*p[1]+M[10]*p[2]+M[14]]);
        if (N) { const x = M[0]*n[0]+M[4]*n[1]+M[8]*n[2], y = M[1]*n[0]+M[5]*n[1]+M[9]*n[2], z = M[2]*n[0]+M[6]*n[1]+M[10]*n[2]; const l = Math.hypot(x, y, z) || 1; N.setElement(i, [x / l, y / l, z / l]); }
      }
      prim.setAttribute('JOINTS_0', null); prim.setAttribute('WEIGHTS_0', null);
    }
    node.setSkin(null);
    node.getParentNode()?.removeChild(node); for (const s of root.listScenes()) s.removeChild(node);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); scene.addChild(node);
  }
  for (const s of root.listSkins()) s.dispose();
}

for (const m of cfg.models) {
  if (only && !only.includes(m.out)) continue;
  const t0 = Date.now();
  const doc = await io.read(`${SRC}/${m.src}.glb`);
  const root = doc.getRoot(); const scene = root.listScenes()[0];
  // optional: drop nodes / materials by name pattern
  if (m.dropNodes) { const re = new RegExp(m.dropNodes, 'i'); for (const n of root.listNodes()) if (re.test(n.getName()) || (n.getMesh() && re.test(n.getMesh().getName()))) n.dispose(); }
  if (m.dropMats) { const re = new RegExp(m.dropMats, 'i'); for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() && re.test(p.getMaterial().getName())) p.dispose(); }
  if (root.listSkins().length) bakeSkins(doc);
  // rotation about Y so that nose -> +Z
  let yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }[m.fwd] ?? 0;
  if (m.pca) { const a = pcaYaw(doc); yaw = -a + (m.pcaFlip ? Math.PI : 0); console.log('  pca angle', (a * 180 / Math.PI).toFixed(1)); }
  if (m.yawAdd) yaw += m.yawAdd * Math.PI / 180;
  const wrap = doc.createNode('skyroam_root');
  for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
  scene.addChild(wrap);
  // yaw about Y, optionally after a Z-up -> Y-up pitch (-90 deg about X)
  const qy = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qx = m.upZ ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1];
  const mul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  wrap.setRotation(mul(qy, qx));
  let b = getBounds(scene);
  const L = b.max[2] - b.min[2];
  const k = m.len ? m.len / L : (m.scale || 1);
  wrap.setScale([k, k, k]);
  b = getBounds(scene);
  const tx = -(b.min[0] + b.max[0]) / 2, ty = -b.min[1], tz = -b.max[2];
  const r = wrap.getTranslation(); wrap.setTranslation([r[0] + tx, r[1] + ty, r[2] + tz]);
  b = getBounds(scene);
  // glass: KHR transmission is ignored by Cesium -> make it plain alpha blended glass
  for (const mat of root.listMaterials()) {
    const tr = mat.getExtension('KHR_materials_transmission');
    if (tr || (m.glass && new RegExp(m.glass, 'i').test(mat.getName()))) {
      if (tr) mat.setExtension('KHR_materials_transmission', null);
      const c = mat.getBaseColorFactor(); mat.setBaseColorFactor([c[0], c[1], c[2], Math.min(c[3], m.glassAlpha ?? 0.18)]); mat.setAlphaMode('BLEND');
    }
    for (const e of ['KHR_materials_clearcoat', 'KHR_materials_specular', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_sheen']) if (mat.getExtension(e)) mat.setExtension(e, null);
    mat.setDoubleSided(true);
  }
  for (const a of root.listAnimations()) a.dispose();
  await doc.transform(
    metalRough(), dedup(), flatten(), join(), weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: m.ratio ?? 0.5, error: m.err ?? 0.0008 }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.tex || 1024, m.tex || 1024], quality: 82 }),
    draco({ quantizePosition: 16 }),
  );
  let tris = 0; for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  await io.write(`${OUT}/${m.out}.glb`, doc);
  const size = fs.statSync(`${OUT}/${m.out}.glb`).size;
  console.log(`${m.out}: ${(size / 1e6).toFixed(1)} MB, ${Math.round(tris)} tris, size ${b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' x ')} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
