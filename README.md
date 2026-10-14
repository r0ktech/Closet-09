# Closet Nº 9

A clothing storefront whose landing page is a 3D walk-in closet.

```bash
npm install
npm run dev
```

- **Closet** – hover a piece to part the rail, drag hangers to shove clothes along it, click (or Enter) to open. Arrow keys / the on-screen arrows step through the rail.
- **Detail** – the piece worn by a 175 cm mannequin with live measurements; switch colour, size S/M/L, or "Compare S · M · L" side by side.

Where things live:

- `src/data/products.js` – catalogue: names, prices, colours, S/M/L measurements.
- `src/three/garments.js` – flat garments and hangers for the closet rail.
- `src/three/worn.js` – the 3D mannequin and garments built around it (sizes are morph targets).
- `src/components/ClosetScene.jsx` – the wardrobe and the rail physics.
- `src/components/ProductDetail.jsx` / `ProductViewer.jsx` – product sheet and 3D try-on view.
