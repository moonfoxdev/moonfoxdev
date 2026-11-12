# JÉEN Villas app

A mobile-first, installable web app (PWA) for JÉEN Villas — [@jeen.villas](https://www.instagram.com/jeen.villas).
No build step: plain HTML/CSS/JS.

## Screens
- **Home** – brand image, intro, villa cards, Instagram link
- **Villas** – Villa 1 and Villa 3, each with photo gallery (tap to enlarge, swipe), amenities, price
- **Book** – pick villa, dates, guests → sends the request via WhatsApp, email or Instagram DM
- **Contact** – Instagram / WhatsApp / phone / email, plus "Install app" on supported phones

## Editing content
Everything is in **`js/data.js`**: tagline, location, contact details, villa
descriptions, guests/bedrooms, prices and amenities. Fields marked `TODO`
still need real info.

## Adding photos
1. Copy photos into `assets/villas/villa-1/` and `assets/villas/villa-3/`
2. List the file names in that villa's `photos: [...]` in `js/data.js`
   (first one = cover photo)

## Run locally
```
cd jeen-villas
python3 -m http.server 8000
```
Open http://localhost:8000.

## Publish
Any static host works (GitHub Pages, Netlify, Vercel). For GitHub Pages:
repo Settings → Pages → deploy from branch, then open `/jeen-villas/`.
On a phone, open the site and choose **Add to Home Screen** to install it like an app.

After changing files on a live site, bump `VERSION` in `sw.js` so phones pick up the update.

## 3D tours
Each villa can have a Matterport tour: set `tour` in `js/data.js` to the ID
after `?m=` in the tour link. Villa 1 uses `xHiJJNx9nob` and Villa 3 uses
`Y6P8ZuSc916`; swap them there if they are the wrong way round.

## 3D landscape (home page)
The home hero is an interactive 3D map of the resort, built with Three.js
(vendored in `js/vendor/`, no build step). Files:

- `js/scene.js` – scene, camera, controls, villa picking, render loop
- `js/terrain.js` – the mountains (generated, or from a heightmap PNG)
- `js/villa-models.js` – the low-poly villa models, highlight rings, `.glb` loading
- `js/tour-overlay.js` – the villa panel and the full-screen Matterport tour

Phones and low-power devices get a lighter version (coarser terrain, no
shadows). Without WebGL the original image hero is shown instead.

### Move a villa on the map
Edit `map` for that villa in `js/data.js`:
`map: { x: -40, z: 10, rotation: 18 }`. Units are metres from the middle of
the terrain: `x` to the right, `z` towards the viewer (negative `z` = towards
the mountains). `rotation` is in degrees. The height is found automatically
and the ground is levelled under the villa. Keep villas about 40 m apart.

### Mark a villa unavailable
Set `available: false`. It turns grey on the map, its label reads
"Villa N · Unavailable", tapping it shows "This villa is currently
unavailable.", and it is left out of the villa list and the booking form.
Set it back to `true` to make it bookable again.

### Use a real heightmap
Save a greyscale PNG (black = lowest, white = highest, e.g. 1024×1024) as
`assets/terrain/heightmap.png` and set
`terrain: { heightmap: "assets/terrain/heightmap.png", heightScale: 90, size: 900 }`.
The image covers the whole `size` × `size` square; its top edge is the far
side (behind the villas). `heightScale` is the height of pure white in metres.

### Use real 3D models
Export each villa as a `.glb` (1 unit = 1 metre, origin at ground level in the
middle of the footprint, terrace/pool side facing +z), put it in
`assets/models/` and set `model: "assets/models/villa-1.glb"`. If the model is
in another unit, add `scale` to `map` (e.g. `scale: 0.01` for centimetres).
If a file fails to load, the built-in model is used.
