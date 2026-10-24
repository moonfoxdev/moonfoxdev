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
