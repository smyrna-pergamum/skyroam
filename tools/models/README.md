# Model tools

Turn Sketchfab `.glb` downloads into SkyRoam models with [glTF-Transform](https://gltf-transform.dev/).

```
npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer sharp
```

1. Put the downloads in `src/` (named as in `models.json`) and add an entry: `fwd` is the axis the nose points along in the download (`+z`, `-z`, `+x`, `-x`, or `pca: true` for a model turned at an odd angle), `len` the real length in metres, `ratio` how much of the mesh to keep.
2. `node normalize.mjs models.json [name,...]` writes `out/<name>.glb`: metres, +Y up, nose +Z, nose tip at z = 0, centred on x = 0, wheels on y = 0. Skinned models are baked, transmission glass becomes plain see-through glass, textures become WebP, meshes are Draco-compressed.
3. `node cut.mjs out/<name>.glb out/cockpits/<name>.glb xmin xmax ymin ymax zmin zmax` keeps the triangles inside a box around the cockpit and drops the glass, for the 3D cockpit.
4. Copy the files to `models/` and `models/cockpits/`, find the pilot's eye point and add `model: { url, fit: true, eye, cockpit }` to the fleet entry (see the main README). Add the attribution to `js/models3d.js` and the README credits.
