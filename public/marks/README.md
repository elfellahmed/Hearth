# App marks (local only)

`node scripts/marks.mjs pull --tv <TV address>` then `node scripts/marks.mjs make` puts white marks here, made from the
official icons on your own TV, plus `index.json`. The Frame home screen (Dock and List) draws them instead of converting the
icons on the TV. They are the apps' own logos, so Git ignores everything here except this file; they go into the `.ipk`
you build with `npm run package`. See the top of `scripts/marks.mjs` for tuning one app.
