# SkyRoam ✈

**A browser flight game over the real world.** Pick an aircraft, pick any city on Earth or a world-famous historic site, and fly. No install, no server: one static page.

**Gerçek dünya haritası üzerinde tarayıcıda uçuş oyunu.** Uçağını seç, dünyadaki herhangi bir şehri ya da ünlü bir tarihi alanı seç ve uç. Kurulum yok, sunucu yok: tek bir statik sayfa.

**▶ Play / Oyna: <https://smyrna-pergamum.github.io/skyroam/>**

---

## Features / Özellikler

- **Real world** via [CesiumJS](https://cesium.com/platform/cesiumjs/): satellite imagery, real terrain and 3D buildings
- **11 aircraft** in three classes, each with its own flight model:
  - Civil: light trainer, aerobatic biplane, glider (no engine), business jet
  - Commercial: turboprop regional, narrow-body jetliner, four-engine wide-body
  - Military: classic prop fighter, jet fighter, four-prop cargo, flying-wing bomber
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
- **On-screen throttle lever**: drag it with mouse or finger, or use the mouse wheel over it
- Keyboard and gamepad, synthesised engine sound (prop / jet / glider)
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
js/aircraft.js    aircraft roster: flight parameters + part lists, mods
js/places.js      continents / countries / cities, historic sites, natural wonders
js/flight.js      fixed-step (120 Hz) arcade flight model
js/plane.js       builds an aircraft's parts into one Cesium primitive
js/input.js       keyboard + gamepad actions, radial deadzone
js/rings.js       ring course generation and pass detection
js/audio.js       WebAudio engine, wind, chime and crash sounds
js/storage.js     safe localStorage helpers, token storage
js/i18n.js        Turkish / English strings
```

Adding an aircraft: add an entry to `AIRCRAFT` in `js/aircraft.js` (physics + a `build()` list of boxes/cylinders). Adding a place: add a row to `js/places.js`.

## Roadmap ideas

- Touch / tilt controls for phones
- Collision with 3D buildings
- Landing missions at real airports (OurAirports data)
- Daily route challenge, multiplayer ghosts

## Credits and data terms

- [CesiumJS](https://github.com/CesiumGS/cesium) (Apache-2.0), loaded from jsDelivr
- 3D mode: Cesium World Terrain, Bing Maps imagery and Cesium OSM Buildings via Cesium ion (© OpenStreetMap contributors)
- Lite mode: Esri World Imagery tiles (© Esri, Maxar, Earthstar Geographics). Check [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) before heavy or commercial use.
- City search: [Open-Meteo Geocoding API](https://open-meteo.com/) (data from GeoNames, CC BY 4.0)
- All aircraft are original low-poly designs made from simple shapes for this project.
- Attributions are shown in the in-game credit bar and must stay visible.
