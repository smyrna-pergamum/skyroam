# SkyRoam ✈

**A browser flight game over the real world.** Take off over the Bosphorus, Cappadocia, the Alps or the Grand Canyon and just fly. No install, no server: one static page.

**Gerçek dünya haritası üzerinde tarayıcıda uçuş oyunu.** Boğaz'ın, Kapadokya'nın, Alplerin ya da Büyük Kanyon'un üstünden kalk ve uç. Kurulum yok, sunucu yok: tek bir statik sayfa.

---

## Features / Özellikler

- Real satellite imagery, real terrain and 3D buildings ([CesiumJS](https://cesium.com/platform/cesiumjs/))
- Arcade flight model: stalls, coordinated turns, landing and crashing
- **Free flight** and a timed **ring course** (best times saved locally)
- Chase and cockpit cameras, HUD with an artificial horizon
- Keyboard and gamepad, synthesised engine sound (no audio files)
- Turkish and English UI
- 10 start locations: Istanbul, Cappadocia, Pamukkale, Matterhorn, Grand Canyon, New York, Rio, Mount Fuji, Geirangerfjord, Everest

## Map modes and your Cesium ion token

The game **never ships with a token**. Each player can add their own free token:

| Mode | What you get | Needs |
|---|---|---|
| **Lite** | Satellite imagery on a flat globe | Nothing |
| **3D** | Real terrain (mountains, valleys) + OSM 3D buildings | Free Cesium ion token |
| **3D photorealistic** (experimental) | Google Photorealistic 3D Tiles | Cesium ion token with access to that asset |

How to get a token:

1. Create a free account at [ion.cesium.com](https://ion.cesium.com/signup).
2. **Access Tokens → Create token**, tick only the **`assets:read`** scope. Don't use your Default Token.
3. Optionally restrict it to your site under **Allowed URLs**.
4. In the game: **Map settings** → paste the token → **Save and reload**.

The token is stored only in the player's browser (`localStorage`, or `sessionStorage` if "remember" is off) and is only sent to Cesium's servers. Nothing is sent anywhere else.

## Controls / Kontroller

| Action | Keyboard | Gamepad |
|---|---|---|
| Nose down / up | `W` `S` / `↑` `↓` | Left stick Y |
| Bank left / right | `A` `D` / `←` `→` | Left stick X |
| Rudder | `Q` `E` | LB / RB |
| Throttle | `R` `F` / `+` `−` | RT / LT |
| Air brake / wheel brake | `Space` | B |
| Camera (chase / cockpit) | `C` | A |
| Pause / menu | `P` / `Esc` | Start |
| Sound | `M` | Y |
| Restart after crash | `Enter` | A |

Keys are read by physical position, so WASD works on AZERTY and other layouts too.

**Landing tip:** keep vertical speed above −5 m/s, wings within ±15° and speed below ~340 km/h.

## Run locally

ES modules need an HTTP server (opening `index.html` as a file will not work):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

Push the folder to a repository, then **Settings → Pages → Deploy from branch → `main` / root**. There is no build step.

## Project structure

```
index.html        page, menu, HUD markup
style.css         UI and HUD styles
js/main.js        viewer setup, map modes, game loop, camera, HUD, menu
js/flight.js      fixed-step (120 Hz) arcade flight model
js/input.js       keyboard + gamepad actions, radial deadzone
js/plane.js       the plane, built from boxes (no external model)
js/rings.js       ring course generation and pass detection
js/audio.js       WebAudio engine, wind, chime and crash sounds
js/locations.js   start locations
js/i18n.js        Turkish / English strings
```

## Roadmap ideas

- Touch / tilt controls for phones
- Collision with 3D buildings
- Landing missions at real airports (OurAirports data)
- Daily route challenge, more aircraft

## Credits and data terms

- [CesiumJS](https://github.com/CesiumGS/cesium) (Apache-2.0), loaded from jsDelivr
- 3D mode: Cesium World Terrain, Bing Maps imagery and Cesium OSM Buildings via Cesium ion (© OpenStreetMap contributors)
- Lite mode: Esri World Imagery tiles (© Esri, Maxar, Earthstar Geographics). Check [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) before heavy or commercial use.
- Attributions are shown in the in-game credit bar and must stay visible.
