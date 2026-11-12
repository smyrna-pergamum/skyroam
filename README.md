# SkyRoam ✈

**A browser flight game over the real world.** Pick an aircraft, pick any city on Earth or a world-famous historic site, and fly. No install, no server: one static page.

**Gerçek dünya haritası üzerinde tarayıcıda uçuş oyunu.** Uçağını seç, dünyadaki herhangi bir şehri ya da ünlü bir tarihi alanı seç ve uç. Kurulum yok, sunucu yok: tek bir statik sayfa.

**▶ Play / Oyna: <https://smyrna-pergamum.github.io/skyroam/>**

---

## Features / Özellikler

- **Real world** via [CesiumJS](https://cesium.com/platform/cesiumjs/): satellite imagery, real terrain and 3D buildings
- **100 real-world aircraft** in four groups (commercial 27, civil 24, military 25, historic 24): A320neo, 737 MAX, 777, 787, A380, Concorde, Cessna 172, Cirrus SR22, ASK 21 glider, F-16, F-35, Eurofighter, KAAN, Hürkuş, Bayraktar TB2, Akıncı, B-2, C-130J, Wright Flyer, Fokker Dr.I, Spitfire, P-51, DC-3, Vecihi K-VI, Nu.D.36 and many more
  - Each model is generated from the type's real dimensions and layout: smooth lofted fuselage, tapered and swept wings, T-tails, twin tails, canards, deltas, biplanes and triplanes, engine nacelles and propellers, canopies, cabin windows, winglets and livery
  - Each flight model comes from the type's real top and stall speeds and handling class (supersonic speeds are compressed so the map can keep up)
  - Search by name, maker, country or year, and filter by group
  - Optional: drop a `.glb` model into the project and point an aircraft's `model` field at it
- **Retractable landing gear**: folds up after take-off and comes down automatically near the ground (or press `G`). Landing with the gear up counts as a crash.
- **Hangar**: modify any aircraft (engine power, wingspan, agility, three colours), name it and save it. Changes show live on the plane and in its stats.
- **Take off anywhere**:
  - Continent → country → city lists (all 81 provinces of Türkiye plus resort towns, 190+ cities in 86 other countries)
  - 46 world-famous historic sites and landmarks (Giza, Petra, Machu Picchu, Ephesus, Pergamon, Göbekli Tepe, Hagia Sophia, Colosseum…)
  - 22 natural wonders (Cappadocia, Everest, Matterhorn, Grand Canyon, Fjords…)
  - **Search** for any city, town or village, or take off from your own location
  - **Coordinates**: type or paste latitude/longitude (decimal or 41°00′29″N), with optional heading and altitude
- **Free flight** and a timed **ring course** (best times saved per place and aircraft)
- Arcade flight model: stalls, coordinated turns, landing and crashing, fixed 120 Hz physics
- **Cockpit interior** with live instruments, different per aircraft class:
  - analog six-pack, engine gauges, radios and a moving yoke (props)
  - glass cockpit with PFD, ND, engine display and autopilot panel (jets, airliners)
  - green HUD, MFDs and a moving stick (jet fighter)
  - minimal panel with variometer and a yaw string (glider)
- Three cameras: chase, cockpit interior, nose
- **Speed you can feel**: the field of view widens with speed and kicks when you open the throttle, the chase camera falls back while accelerating, and there are speed lines and a light buffet at high speed, on the ground roll and in a stall. "Reduce camera motion" in the menu turns these off.
- **Minimap** (bottom right): a heading-up OpenStreetMap with a compass ring, coordinates and the name of the place below you. Press `N` to toggle it.
- **Touch controls** for phones and tablets: the left thumb works a floating stick, the right thumb has the throttle lever, rudder, brake, gear and camera buttons. Landscape works best.
- **On-screen throttle lever**: drag it with mouse or finger, or use the mouse wheel over it
- Keyboard, gamepad and touch
- Recorded engine, turbine, wind, crash and landing-gear sounds (from Pixabay) layered over a small synthesiser
- Turkish and English UI

## Map modes and your Cesium ion token

On first launch the game shows a short **Cesium setup screen** with the warnings below. You can paste a token or **skip** and play in Lite mode.

The game **never ships with a token**. Each player adds their own free one:

| Mode | What you get | Needs |
|---|---|---|
| **Lite** | Satellite imagery on a flat globe | Nothing |
| **3D** | Real terrain (mountains, valleys) + OSM 3D buildings | Free Cesium ion token |
| **3D photorealistic** (experimental) | Google Photorealistic 3D Tiles | Cesium ion token with access to that asset |

How to get a token:

1. Create a free account at [ion.cesium.com](https://ion.cesium.com/signup).
2. **Access Tokens → Create token**, tick only the **`assets:read`** scope. Don't use your Default Token.
3. Optionally restrict it to your site under **Allowed URLs**.
4. Paste it on the welcome screen, or later under **Settings**.

The token is stored only in the player's browser (`localStorage`, or `sessionStorage` if "remember" is off) and is only sent to Cesium's servers. Treat it like a password: don't share it or show it in screenshots.

## Privacy

- City search sends only the typed place name to the [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api).
- "Take off from where I am" uses the browser's location permission; the position stays in the browser.
- The minimap loads map tiles from tile.openstreetmap.org. About every 20 seconds, and only after you have moved a few kilometres, it sends your rounded position to [Nominatim](https://nominatim.org/) to show the place name. This follows the [OSM tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) usage policies.
- Settings, custom aircraft and best times are kept in `localStorage`. There is no server and no tracking.

## Controls / Kontroller

| Action | Keyboard | Gamepad |
|---|---|---|
| Nose down / up | `W` `S` / `↑` `↓` | Left stick Y |
| Bank left / right | `A` `D` / `←` `→` | Left stick X |
| Rudder | `Q` `E` | LB / RB |
| Throttle | `R` `F` / `+` `−` / drag the on-screen lever | RT / LT |
| Air brake / wheel brake | `Space` | B |
| Camera (chase / cockpit / nose) | `C` | A |
| Pause / menu | `P` / `Esc` | Start |
| Sound | `M` | Y |
| Landing gear (manual override) | `G` | |
| Minimap | `N` | |
| Restart after crash | `Enter` | A |

Keys are read by physical position, so WASD works on AZERTY and other layouts too.

**Landing tip:** keep vertical speed above about −5 m/s (−4 for airliners), wings within ±15°, and touch down below the aircraft's landing speed.

## Run locally

ES modules need an HTTP server (opening `index.html` as a file will not work):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

**Settings → Pages → Deploy from branch → `main` / root**. There is no build step.

## Project structure

```
index.html        page: welcome screen, menu (flight / aircraft / settings), HUD
style.css         UI and HUD styles
js/main.js        viewer, map modes, game loop, camera, HUD
js/menu.js        menu tabs, place picker + search + coordinates, aircraft grid, hangar, welcome
js/cockpit.js     cockpit interiors drawn on a canvas overlay (GA, glass, fighter, glider)
js/fleet.js       100 real aircraft: dimensions, wing/tail/engine layout, speeds, livery
js/fleetgen.js    turns a fleet entry into a 3D model (lofted meshes) and a flight model
js/aircraft.js    roster, mods (hangar), old-id aliases
js/feel.js        speed feel: dynamic FOV, camera lag, shake, speed lines
js/minimap.js     OpenStreetMap minimap with compass
js/touch.js       two-thumb touch controls
js/places.js      continents / countries / cities, historic sites, natural wonders
js/flight.js      fixed-step (120 Hz) arcade flight model
js/plane.js       builds an aircraft's parts into one Cesium primitive
js/input.js       keyboard + gamepad actions, radial deadzone
js/rings.js       ring course generation and pass detection
js/audio.js       WebAudio: recorded loops + synthesiser, chime, crash, gear
sounds/           Pixabay sound effects (see credits)
js/storage.js     safe localStorage helpers, token storage
js/i18n.js        Turkish / English strings
```

Adding an aircraft: add an entry to `FLEET` in `js/fleet.js`. The model and the flight model are generated from it. Adding a place: add a row to `js/places.js`.

## Roadmap ideas

- Tilt steering for phones
- Collision with 3D buildings
- Landing missions at real airports (OurAirports data)
- Daily route challenge, multiplayer ghosts

## Credits and data terms

- [CesiumJS](https://github.com/CesiumGS/cesium) (Apache-2.0), loaded from jsDelivr
- 3D mode: Cesium World Terrain, Bing Maps imagery and Cesium OSM Buildings via Cesium ion (© OpenStreetMap contributors)
- Lite mode: Esri World Imagery tiles (© Esri, Maxar, Earthstar Geographics). Check [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) before heavy or commercial use.
- City search: [Open-Meteo Geocoding API](https://open-meteo.com/) (data from GeoNames, CC BY 4.0)
- Minimap: map tiles and place names © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL), via tile.openstreetmap.org and Nominatim
- Aircraft models are generated in code from public dimensions for this project. They are simplified likenesses, not official models. Aircraft names are their makers' trademarks and are used only to identify the types.
- Sounds from [Pixabay](https://pixabay.com/sound-effects/) under the [Pixabay Content License](https://pixabay.com/service/license-summary/):
  - `prop.mp3`: "Propeller.wav" by freesound_community
  - `jet.mp3`: "Jet Engine" by freesound_community
  - `turbine.mp3`: "Airplane Turbine Engine Loop" by Audley_Fergine
  - `wind.mp3`: "Wind Loop" by freesound_community
  - `crash.mp3`: "Boom Crash" by DRAGON-STUDIO
  - `gear.mp3`: "Cockpit Sound of Landing Gear Deployment" by arunangshubanerjee
- Attributions are shown in the in-game credit bar and must stay visible.
