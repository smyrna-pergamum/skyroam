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
  'models/cockpits/su-57.glb':     ['F/A-18C Hornet Cockpit Photogrammetry', 'VTX', 'CC BY-NC-SA 4.0'],
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

/** Cockpits made for one type. */
export const COCKPIT_BY_TYPE = {
  // the F/A-18C cockpit restyled as the Su-57's: frameless canopy, light blue-grey panels, round HUD
  'su-57': { url: 'models/cockpits/su-57.glb', eye: [0, 3.55, -5.0], kind: 'su57' },
};

/** Live screens of each cockpit file: quads in the model frame (top-left, top-right, bottom-left corners as
 *  the pilot sees them) and what they show (screens3d.js): pfd, nd, eicas, sys, hud, ufc, asi, ai, alt, hdg, vsi, turn. */
export const DISPLAYS = {
  // F/A-18C (cockpits/fighter.glb, su-57.glb): left and right DDI, AMPCD below, HUD between the posts
  'models/cockpits/fighter.glb': [
    { k: 'sys', tl: [0.223, 3.316, -4.376], tr: [0.119, 3.289, -4.304], bl: [0.255, 3.154, -4.341] },
    { k: 'pfd', tl: [-0.118, 3.281, -4.305], tr: [-0.246, 3.285, -4.317], bl: [-0.121, 3.147, -4.346] },
    { k: 'nd', tl: [0.071, 3.057, -4.329], tr: [-0.074, 3.058, -4.330], bl: [0.075, 2.876, -4.309] },
    { k: 'hud', tl: [0.075, 3.64, -4.30], tr: [-0.075, 3.64, -4.30], bl: [0.075, 3.49, -4.30] },
  ],
  'models/cockpits/f-16c.glb': [
    { k: 'sys', tl: [0.245, 1.932, -3.508], tr: [0.126, 1.932, -3.508], bl: [0.255, 1.809, -3.532] },
    { k: 'nd', tl: [-0.069, 2.043, -3.757], tr: [-0.230, 1.932, -3.508], bl: [-0.116, 1.809, -3.531] },
    { k: 'hdg', tl: [0.146, 2.068, -3.655], tr: [0.119, 2.022, -3.505], bl: [0.195, 1.949, -3.519] },
    { k: 'ai', tl: [0.062, 1.778, -3.677], tr: [-0.010, 1.778, -3.677], bl: [0.062, 1.709, -3.709] },
    { k: 'hud', tl: [0.07, 2.31, -3.74], tr: [-0.07, 2.31, -3.74], bl: [0.07, 2.17, -3.74] },
  ],
  'models/cockpits/f-15e.glb': [
    { k: 'pfd', tl: [0.304, 3.282, -4.115], tr: [0.138, 3.290, -4.128], bl: [0.322, 3.144, -4.141] },
    { k: 'nd', tl: [-0.141, 3.290, -4.128], tr: [-0.305, 3.283, -4.117], bl: [-0.157, 3.134, -4.130] },
    { k: 'ufc', tl: [0.092, 3.435, -4.242], tr: [-0.071, 3.435, -4.242], bl: [0.112, 3.312, -4.209] },
    { k: 'hud', tl: [0.08, 3.74, -4.09], tr: [-0.08, 3.74, -4.09], bl: [0.08, 3.58, -4.09] },
  ],
  'models/cockpits/f-35a.glb': [
    { k: 'pfd', tl: [0.266, 3.248, -2.685], tr: [0.006, 3.247, -2.685], bl: [0.278, 3.060, -2.744] },
    { k: 'nd', tl: [0.002, 3.247, -2.685], tr: [-0.260, 3.248, -2.687], bl: [0.002, 3.049, -2.728] },
    { k: 'ufc', tl: [-0.009, 2.981, -2.764], tr: [-0.079, 2.981, -2.764], bl: [-0.009, 2.947, -2.788] },
  ],
  'models/cockpits/f-14a.glb': [
    { k: 'pfd', tl: [0.109, 2.609, -3.922], tr: [-0.090, 2.609, -3.922], bl: [0.115, 2.511, -3.917] },
    { k: 'nd', tl: [0.109, 2.510, -3.929], tr: [-0.094, 2.510, -3.929], bl: [0.113, 2.372, -3.968] },
    { k: 'hud', tl: [0.085, 2.87, -3.75], tr: [-0.085, 2.87, -3.75], bl: [0.085, 2.70, -3.75] },
  ],
  'models/cockpits/f-4e.glb': [
    { k: 'ai', tl: [0.054, 2.999, -4.566], tr: [-0.046, 2.999, -4.566], bl: [0.055, 2.907, -4.587] },
    { k: 'hdg', tl: [0.055, 2.865, -4.596], tr: [-0.047, 2.865, -4.596], bl: [0.057, 2.767, -4.618] },
    { k: 'nd', tl: [0.067, 3.227, -4.715], tr: [-0.060, 3.227, -4.715], bl: [0.068, 3.150, -4.738] },
  ],
  'models/cockpits/f-117a.glb': [
    { k: 'pfd', tl: [0.298, 1.488, -4.116], tr: [0.166, 1.485, -4.109], bl: [0.301, 1.360, -4.165] },
    { k: 'sys', tl: [-0.146, 1.488, -4.116], tr: [-0.282, 1.485, -4.109], bl: [-0.148, 1.360, -4.165] },
    { k: 'nd', tl: [0.114, 1.436, -4.118], tr: [-0.093, 1.434, -4.114], bl: [0.112, 1.301, -4.190] },
    { k: 'ufc', tl: [0.073, 1.654, -4.332], tr: [-0.061, 1.654, -4.329], bl: [0.075, 1.628, -4.332] },
  ],
  'models/cockpits/mig-23mf.glb': [
    { k: 'ai', tl: [0.188, 1.710, -4.511], tr: [0.110, 1.711, -4.513], bl: [0.203, 1.603, -4.509] },
    { k: 'hdg', tl: [0.198, 1.598, -4.513], tr: [0.116, 1.597, -4.512], bl: [0.214, 1.478, -4.514] },
    { k: 'asi', tl: [0.285, 1.701, -4.524], tr: [0.212, 1.706, -4.533], bl: [0.301, 1.624, -4.524] },
    { k: 'alt', tl: [0.293, 1.622, -4.542], tr: [0.220, 1.627, -4.551], bl: [0.311, 1.536, -4.543] },
    { k: 'vsi', tl: [-0.144, 1.719, -4.530], tr: [-0.218, 1.719, -4.530], bl: [-0.155, 1.632, -4.524] },
  ],
  // C-17 flight deck (airliner.glb): captain's PFD, standby, engine display (no HUD: most airliners have none)
  'models/cockpits/airliner.glb': [
    { k: 'pfd', tl: [0.729, 4.538, -1.865], tr: [0.505, 4.538, -1.865], bl: [0.741, 4.306, -1.902] },
    { k: 'ai', tl: [0.470, 4.492, -1.878], tr: [0.385, 4.492, -1.878], bl: [0.467, 4.401, -1.886] },
    { k: 'eicas', tl: [0.246, 4.584, -1.846], tr: [0.041, 4.586, -1.850], bl: [0.237, 4.377, -1.909] },
  ],
  // King Air (turboprop.glb): EFIS attitude and HSI tubes, airspeed, altimeter, centre display
  'models/cockpits/turboprop.glb': [
    { k: 'pfd', tl: [0.460, 2.176, -2.389], tr: [0.349, 2.176, -2.389], bl: [0.463, 2.079, -2.403] },
    { k: 'nd', tl: [0.460, 2.042, -2.396], tr: [0.347, 2.042, -2.396], bl: [0.463, 1.937, -2.410] },
    { k: 'asi', tl: [0.574, 2.185, -2.397], tr: [0.480, 2.185, -2.397], bl: [0.582, 2.089, -2.402] },
    { k: 'alt', tl: [0.332, 2.177, -2.398], tr: [0.244, 2.177, -2.395], bl: [0.330, 2.089, -2.402] },
    { k: 'eicas', tl: [0.011, 2.098, -2.404], tr: [-0.136, 2.098, -2.401], bl: [-0.008, 1.973, -2.414] },
  ],
  // Cessna 182 G1000 (ga.glb): PFD, MFD and the three standby gauges
  'models/cockpits/ga.glb': [
    { k: 'pfd', tl: [0.394, 1.722, -2.076], tr: [0.156, 1.722, -2.076], bl: [0.405, 1.537, -2.049] },
    { k: 'nd', tl: [0.041, 1.721, -2.070], tr: [-0.208, 1.722, -2.076], bl: [0.014, 1.539, -2.055] },
    { k: 'asi', tl: [0.107, 1.493, -2.034], tr: [0.048, 1.497, -2.044], bl: [0.141, 1.508, -2.215] },
    { k: 'ai', tl: [0.033, 1.497, -2.044], tr: [-0.036, 1.497, -2.044], bl: [0.023, 1.425, -2.036] },
    { k: 'alt', tl: [-0.050, 1.497, -2.044], tr: [-0.119, 1.497, -2.045], bl: [-0.060, 1.429, -2.044] },
  ],
  // Spitfire blind-flying panel (warbird.glb)
  'models/cockpits/warbird.glb': [
    { k: 'asi', tl: [0.152, 1.089, -0.677], tr: [0.077, 1.088, -0.677], bl: [0.159, 1.003, -0.677] },
    { k: 'vsi', tl: [-0.071, 1.089, -0.677], tr: [-0.146, 1.089, -0.678], bl: [-0.074, 1.003, -0.677] },
    { k: 'alt', tl: [0.161, 0.973, -0.677], tr: [0.082, 0.970, -0.673], bl: [0.168, 0.877, -0.677] },
    { k: 'hdg', tl: [0.044, 0.992, -0.677], tr: [-0.048, 1.042, -0.767], bl: [0.047, 0.873, -0.677] },
    { k: 'turn', tl: [-0.073, 1.032, -0.779], tr: [-0.164, 0.973, -0.677], bl: [-0.088, 0.877, -0.677] },
  ],
  'models/cockpits/su-57.glb': [
    { k: 'nd', tl: [0.223, 3.316, -4.376], tr: [0.119, 3.289, -4.304], bl: [0.255, 3.154, -4.341] },
    { k: 'sys', tl: [-0.118, 3.281, -4.305], tr: [-0.246, 3.285, -4.317], bl: [-0.121, 3.147, -4.346] },
    { k: 'pfd', tl: [0.071, 3.057, -4.329], tr: [-0.074, 3.058, -4.330], bl: [0.075, 2.876, -4.309] },
    { k: 'hud', tl: [0.095, 3.66, -4.30], tr: [-0.095, 3.66, -4.30], bl: [0.095, 3.47, -4.30] },
  ],
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
  const withScreens = c => c && { ...c, displays: DISPLAYS[c.url] || [] };
  if (COCKPIT_BY_TYPE[ac.baseId]) return withScreens(COCKPIT_BY_TYPE[ac.baseId]);
  const m = ac.model;
  if (m && m.eye) return withScreens({ url: m.cockpit || m.url, eye: m.eye, own: true });
  const kind = cockpitKind(ac.base.spec, ac.cockpit && ac.cockpit.style);
  return kind ? withScreens({ ...COCKPITS[kind], kind }) : null;
}
