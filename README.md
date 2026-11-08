# CleanHearth

A quiet home screen for **rooted** LG webOS TVs: your photo, a small clock and your apps, laid out as a **Dock** (a glass bar along the bottom) or a **List** (large app names on the left). It opens instead of LG Home: the Home button, Back out of an app and the TV's start all land here.

| Dock | List |
| --- | --- |
| Apps as white marks on a glass bar; clock top left; LG Home, System Settings and Settings top right | Large app names on the left; clock top right; the same controls bottom right |

- App ID `com.elfellahmed.cleanhearth`. Rooted TVs only, installed and updated through the **Homebrew Channel**.
- Reference TV: LG CX (OLED55CX), webOS 5, rooted, with [Glasshouse](https://github.com/rorygallagher2024/glasshouse) running beside it.
- Design after [CleanFrame](https://github.com/nthnclrk/CleanFrame) by Nathan Clark (Samsung Tizen); built on [Hearth](https://github.com/rudra-avatar/Hearth) by rudra-avatar. Both MIT. Credits and third-party terms: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Install

1. On the TV, open the **Homebrew Channel** → Settings → **Add repository** and enter
   `https://raw.githubusercontent.com/elfellahmed/Hearth/main/repo/apps.json`
   (from a computer: `ares-launch org.webosbrew.hbchannel -p '{"launchMode":"addRepository","url":"https://raw.githubusercontent.com/elfellahmed/Hearth/main/repo/apps.json"}'`).
2. Install **CleanHearth** from the list. New releases show up there as updates.
3. Open CleanHearth → Settings → **System**:
   - **TV start → Replace LG Home (helper)**: CleanHearth opens whenever LG Home would.
   - **Remote control → Map home button**: the Home button opens CleanHearth directly (no LG Home flash).
   - **TV start → When the TV turns on, open…**: CleanHearth.
4. Settings → **Look → Layout → Home screen**: Dock or List (Classic is Hearth's original row of icons).

## With Glasshouse on the same TV

Glasshouse can keep running for everything else (picture, privacy, OLED care, Home Assistant). Only **Glasshouse Home** must stay off, or it takes LG Home's place and competes for the Home button. CleanHearth checks this:

- a few seconds after it starts, it warns if Glasshouse Home is on;
- Settings → System → Remote control → **Glasshouse Home** shows its state and switches it off through Glasshouse's local API (on webOS 5 and 6 this restarts the TV's app manager once).

CleanHearth stays in Glasshouse's app list; nothing else in Glasshouse changes.

## App marks

The Dock and List draw each app as a white mark. By default the TV converts each app's own icon once. For a cleaner result, make marks from the official icons on your TV:

```sh
npm ci
npm run marks -- pull --tv <TV address>    # SSH as root (Homebrew Channel → SSH on); copies the icons into .local/icons/
npm run marks -- make                      # white marks into public/marks/, preview at .local/marks-preview.html
npm run package                            # an .ipk with the marks inside
```

The default list: Netflix, Prime Video, YouTube, Apple TV, HBO Max, Nanomid, Spotify, DAZN, ARD, ZDF, arte. `npm run marks -- list --tv <address>` prints every app's title and id; tune one app in `.local/marks.json` or put your own one-colour logo in `.local/marks-src/<app id>.png`. The marks are the apps' own logos, so Git ignores them: they only go into the `.ipk` you build and install yourself (with webOS Dev Manager or `ares-install`), not into the public release.

## Release

1. Raise the version in `public/appinfo.json`, `package.json` and `src/config/version.ts` (the tests check they match).
2. Commit to `main`, then tag and push:
   ```sh
   git tag -a v1.0.1 -m "What changed|Another line" && git push origin main v1.0.1
   ```
3. The **Release** workflow tests and builds the `.ipk`, publishes the GitHub release, and updates `repo/apps.json` (Homebrew Channel) and `repo/updates.json` (Settings → System → Check for updates) on `main`.

GitHub Actions must be enabled for this repository (forks start with it off: **Actions** tab → enable).

## Develop

```sh
npm ci
npm run dev        # browser preview at http://localhost:5173 (arrow keys, Enter, Escape); app launches need a TV
npm test           # the language scan needs TypeScript 5: npm install --no-save --prefix /tmp/ast typescript@5
npm run package    # build/com.elfellahmed.cleanhearth_<version>_all.ipk
```

The page runs in the TV's own browser engine (Chromium 68 on webOS 5); `npm run build` also makes an ES5 bundle for older engines. The Frame home screen is `src/screens/FrameHome.tsx` and `src/theme/frame.css`; everything underneath (root helpers, Home button, start-up, app list, wallpapers, screen saver) is Hearth's. Hearth's full documentation, including troubleshooting and the webOS 11 permission step, is in [docs/HEARTH-README.md](docs/HEARTH-README.md); where it says *Hearth*, read *CleanHearth*.

## Undo

Settings → System: switch **Replace LG Home (helper)** and **Map home button** off first, then uninstall CleanHearth from the Homebrew Channel. LG Home is back as it was.
