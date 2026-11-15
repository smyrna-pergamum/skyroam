// Real 3D models (.glb from Sketchfab, see README credits) and the 3D cockpits built from them.
// Every .glb in models/ is normalised (tools: glTF-Transform): metres, +Y up, nose +Z,
// nose tip at z = 0, centred on x = 0, wheels (or belly) on y = 0. Eye points are in that frame.
// models/cockpits/ holds the cockpit sections cut from them (same frame, glass removed).

/** Attribution per model file: shown in the credit list while the model is on screen. */
export const MODEL_CREDITS = {
  'models/kaan.glb':         ['KAAN - Milli Muharip Uçak', 'Özcan Özaltın', 'CC BY 4.0'],
  'models/f-14a.glb':        ['F-14A Tomcat Early', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/f-16c.glb':        ['F-16CM PoBIT with AGM-88 HARM', 'Jeyhun1985', 'CC BY 4.0'],
  'models/f-35a.glb':        ['F-35 Lightning II - Fighter Jet - Free', 'bohmerang', 'CC BY-NC-SA 4.0'],
  'models/f-4e.glb':         ['F-4E Phantom II', 'Kenny3D89', 'CC BY 4.0'],
  'models/f-5e.glb':         ['F-5 Gear Up Opaque Cockpit', 'David.Von.Raesfeld', 'CC BY 4.0'],
  'models/f-117a.glb':       ['Lockheed F-117 Nighthawk', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/f-15e.glb':        ['McDonnell Douglas F-15 Eagle Fighter Jet', 'Muhamad Mirza Arrafi', 'CC BY 4.0'],
  'models/mig-23mf.glb':     ['MiG-23MF Flogger', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/spitfire-ix.glb':  ['Spitfire with cockpit V3', 'TonyWony', 'CC BY 4.0'],
  'models/cessna-182.glb':   ['Cessna 182 Skylane', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/king-air-350.glb': ['KA350 King Air Flight Deck', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/c-17.glb':         ['C-17A Globemaster III Cockpit', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/fa-18c.glb':       ['F/A-18C Hornet Cockpit Photogrammetry', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/cockpits/fighter.glb':   ['F/A-18C Hornet Cockpit Photogrammetry', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/cockpits/airliner.glb':  ['C-17A Globemaster III Cockpit', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/cockpits/turboprop.glb': ['KA350 King Air Flight Deck', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/cockpits/ga.glb':        ['Cessna 182 Skylane', 'VTX', 'CC BY-NC-SA 4.0'],
  'models/cockpits/warbird.glb':   ['The Spitfire Cockpit experience', 'Alexios Apokaukos', 'CC BY 4.0'],
};

export function creditFor(url) {
  // an aircraft's own cockpit (models/cockpits/<id>.glb) is cut from its model (models/<id>.glb)
  const c = MODEL_CREDITS[url] || MODEL_CREDITS[url.replace('models/cockpits/', 'models/')];
  return c ? `3D model “${c[0]}” by ${c[1]} (Sketchfab, ${c[2]}), modified` : null;
}

/** Shared cockpits, cut from the models above, for aircraft without a 3D interior of their own. */
export const COCKPITS = {
  fighter:   { url: 'models/cockpits/fighter.glb',   eye: [0, 3.55, -5.0] },
  warbird:   { url: 'models/cockpits/warbird.glb',   eye: [0, 1.42, -1.45] },
  airliner:  { url: 'models/cockpits/airliner.glb',  eye: [0.55, 4.95, -2.65] },
  turboprop: { url: 'models/cockpits/turboprop.glb', eye: [0.38, 2.3, -3.2] },
  ga:        { url: 'models/cockpits/ga.glb',        eye: [0.3, 1.85, -2.95] },
};

/** Which shared cockpit suits a fleet entry (null: keep the 2D panel, e.g. gliders, UAVs, open cockpits). */
export function cockpitKind(f, style) {
  if (!f || style === 'glider' || f.canopy === 'none' || f.canopy === 'open') return null;
  const jet = f.engines.type === 'turbofan' || f.engines.type === 'turbojet';
  if (f.canopy === 'bubble' || f.canopy === 'tandem') {
    if ((f.cat === 'historic' && f.year < 1950) || (!jet && f.cat !== 'military')) return 'warbird';
    return 'fighter';
  }
  if (f.canopy === 'airliner') return f.cat === 'historic' && f.year < 1960 ? 'turboprop' : 'airliner';
  if (style === 'fighter') return 'fighter';
  if (jet || f.engines.type === 'turboprop' || f.len >= 10) return 'turboprop';
  return 'ga';
}

/** The 3D cockpit for a resolved aircraft: its own model's interior if it has one, else a shared one.
 *  model.cockpit is the cockpit section cut from the model (no glass, nothing behind the seats). */
export function cockpitFor(ac) {
  const m = ac.model;
  if (m && m.eye) return { url: m.cockpit || m.url, eye: m.eye, own: true };
  const kind = cockpitKind(ac.base.spec, ac.cockpit && ac.cockpit.style);
  return kind ? { ...COCKPITS[kind], kind } : null;
}
