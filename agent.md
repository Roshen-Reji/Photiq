# FIX.md — Photiq: images/downloads broken for anyone who isn't the host machine

## Read this first (human summary)

There are **two separate, confirmed bugs**, not one. Both only "hide" when you
personally test the app, which is why it looked fine to you:

1. **Student Portal calls an admin-only endpoint.** The photo `<img>` and the
   download button on the Student Portal go through `/api/uploads/stream/:id`,
   which is protected by `requireAuth` (admin JWT / agent token only). A real
   student — who only ever has a per-student share token, never an admin
   login — gets a 401 on every single preview and download, forever, on any
   device, including yours in an incognito window. It only "worked" for you
   because your browser still had `gradsync_admin_token` in `localStorage`
   from testing the Admin/Monitor dashboard in the same browser profile.
   There is already a correct, public, token-scoped endpoint for this in
   `server/routes/drive.cjs` — the frontend just isn't using it.

2. **The image URL builder bakes in a machine-specific `localhost` address.**
   `src/utils/imageUrl.js` builds image/download URLs using
   `import.meta.env.VITE_BACKEND_URL`. That value is fixed once, at build /
   dev-server-start time, and shipped identically to *every* browser that
   loads the page. If your local `.env` has `VITE_BACKEND_URL` set to
   something like `http://localhost:8787` or `http://127.0.0.1:8787` (a very
   common thing to set for local dev), then every other laptop/phone that
   opens the site over the LAN gets JavaScript that tries to fetch images
   from **its own machine**, not yours. Only your laptop — which happens to
   also be running the backend — resolves `localhost` correctly. This is
   exactly why the Monitor tab shows the filename (that data comes from a
   normal relative API/socket call) but not the image, and why downloads
   fail or come back empty on other devices.

Fix both. Fixing only #2 will still leave the Student Portal broken for real
students. Fixing only #1 will still leave Admin/Monitor broken for any
teammate on another laptop.

---

# Bug 1 — Student Portal uses the wrong (admin-gated) endpoint

### Where

`src/pages/StudentPortal.jsx` — the `StudentPhotoCard` component (top of the
file).

### Current (broken) code

```jsx
const StudentPhotoCard = ({ photo, badge }) => {
  const [hasError, setHasError] = useState(false);
  const [useFallbackCdn, setUseFallbackCdn] = useState(false);

  const primaryUrl = resolveImageUrl(photo);
  const cdnUrl = resolveCdnThumbnailUrl(photo.driveFileId);
  const downloadUrl = resolveImageUrl(photo, true);
  ...
```

`resolveImageUrl()` (in `src/utils/imageUrl.js`) always builds a URL against
`/api/uploads/stream/:id`. In `server/index.cjs` that whole router is mounted
behind auth:

```js
app.use('/api/uploads', requireAuth, uploadsRoute);
```

Students authenticate via a per-student share token in the URL
(`/s/:token`), not an admin JWT — so `requireAuth` rejects every image and
download request from a real student with `401 Unauthorized`. In the UI this
shows up as: the card renders (filename/caption came from the already-public
`/api/drive/:token/photos` list), the `<img>` never loads (`onError` fires →
`hasError` becomes true → grey placeholder box, i.e. "a small item pops up
but never loads"), and the download link 401s (shows as a failed / near-empty
download).

The app already has the correct routes for this, unauthenticated and
token-scoped, in `server/routes/drive.cjs` (mounted **without** `requireAuth`):

- `GET /api/drive/:token/preview/:uploadId` — fast inline preview, local file
  → DB `preview_base64` fallback. No `Content-Disposition`, safe for `<img src>`.
- `GET /api/drive/:token/photo/:filename` — full local-first → preview →
  Drive fallback, sets `Content-Disposition: attachment`. Correct for
  downloads.

There's even a dead, never-called function in the same file,
`handleDownloadSingle()`, that already builds the right URL
(`/api/drive/${token}/photo/${photo.Path}`) — it was written correctly at
some point and then the UI was wired to `resolveImageUrl` instead.

### Required fix

1. Pass `token` down into `StudentPhotoCard` as a prop everywhere it's
   rendered (currently `<StudentPhotoCard key={...} photo={p} badge={badge} />`
   around line 337 — add `token={token}`).

2. Replace the URL construction inside `StudentPhotoCard` with token-scoped,
   public routes instead of `resolveImageUrl`:

```jsx
const StudentPhotoCard = ({ photo, token, badge }) => {
  const [hasError, setHasError] = useState(false);

  // Prefer the fast preview-by-upload-id route; fall back to the
  // filename-based route if there's no matching Upload record (rare —
  // e.g. a file dropped straight into the Drive folder outside the app).
  const primaryUrl = photo._upload_id
    ? `/api/drive/${token}/preview/${photo._upload_id}`
    : `/api/drive/${token}/photo/${encodeURIComponent(photo.Path)}`;

  const downloadUrl = `/api/drive/${token}/photo/${encodeURIComponent(photo.Path)}`;

  const handleImageError = () => setHasError(true);
  ...
```

3. Remove the `resolveImageUrl` / `resolveCdnThumbnailUrl` import and the
   `useFallbackCdn` branch from this component (no longer needed — the new
   endpoints already do local → preview → Drive fallback server-side, so the
   client doesn't need to guess).

4. Delete or actually keep-but-ignore `handleDownloadSingle()` — it's now
   redundant since the download link is fixed directly, but it's harmless to
   leave as-is if you'd rather not touch the parent component.

5. **Do not** change anything in `server/routes/drive.cjs` — it's already
   correct. Do not add `requireAuth` to it.

---

# Bug 2 — `imageUrl.js` bakes a machine-specific `localhost` URL into the bundle

### Where

`src/utils/imageUrl.js`

### Current (broken) code

```js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
```

This value is resolved once (at `vite build` time, or once per Vite dev
server process) and shipped as-is to every client. If your local `.env` sets:

```
VITE_BACKEND_URL=http://localhost:8787
```

...that literal string ends up in the JS every browser downloads. On your own
laptop, `localhost:8787` happens to be your own backend, so it works. On
anyone else's device, `localhost:8787` points at *their* machine, where
nothing is listening — the request fails outright (connection refused),
which is why the Monitor tab shows the name (fetched via a normal relative
API/socket call) but not the image, and why the download either errors out
or produces an empty file.

Note that `vite.config.js` already proxies `/api`, `/uploads`, and
`/socket.io` to the backend correctly:

```js
proxy: {
  '/api': 'http://127.0.0.1:8787',
  '/uploads': 'http://127.0.0.1:8787',
  '/socket.io': { target: 'ws://127.0.0.1:8787', ws: true },
},
```

...and `server/index.cjs` serves the built frontend directly from the same
origin in production. In **both** dev and prod, a plain relative URL
(`/api/uploads/stream/...`) already resolves correctly no matter which
machine's browser is asking, because it's resolved relative to whatever host
the page itself was loaded from. `VITE_BACKEND_URL` should only ever be a
*real, stable, deployed* backend URL (e.g. your Render URL) used for
cross-domain production splits (Vercel frontend + Render backend) — never
`localhost` / `127.0.0.1`.

### Required fix

1. In `src/utils/imageUrl.js`, make the backend URL resolution defensive so a
   stray `localhost`/`127.0.0.1` value in `.env` can never leak to a browser
   that isn't itself on localhost:

```js
const RAW_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// Never let a hardcoded localhost/127.0.0.1 backend URL reach a browser
// that isn't itself running on localhost — every other device on the LAN
// would otherwise try to reach a server on ITS OWN machine and fail.
const isLoopbackUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(RAW_BACKEND_URL);
const viewerIsLocalhost = typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

const BACKEND_URL = (isLoopbackUrl && !viewerIsLocalhost) ? '' : RAW_BACKEND_URL;
```

An empty `BACKEND_URL` makes `resolveImageUrl()` return a relative path,
which is always correct (proxied in dev, same-origin in prod).

2. The same footgun exists, duplicated, in every socket connection:

```js
const socket = io(import.meta.env.VITE_BACKEND_URL || window.location.origin);
```

found in `src/pages/MonitorDashboard.jsx`, `src/pages/StudentPortal.jsx`,
`src/pages/AdminDashboard.jsx`, and `src/pages/PhotoBooth.jsx`. This fallback
only protects you when `VITE_BACKEND_URL` is *unset* — if it's set to
`http://localhost:8787`, sockets on any other device will also try to reach
themselves and silently fail to connect. Extract one shared helper and use it
everywhere instead of repeating the raw env lookup:

```js
// src/utils/backendUrl.js
export function getBackendOrigin() {
  const raw = import.meta.env.VITE_BACKEND_URL || '';
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(raw);
  const viewerIsLocalhost = typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  if (!raw || (isLoopback && !viewerIsLocalhost)) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  return raw;
}
```

Then in each of the four page files:

```js
import { getBackendOrigin } from '../utils/backendUrl';
...
const socket = io(getBackendOrigin());
```

And in `src/utils/imageUrl.js`, reuse it too instead of duplicating the regex
logic (import it and use `getBackendOrigin() ... ` but keep the "empty means
relative" behavior for the stream-URL case — i.e. only fall back to
`window.location.origin` for sockets, and to `''` for the REST image URLs,
since a relative path and an explicit same-origin absolute URL behave
identically for `fetch`/`<img>`/`<a>`).

3. Check your **local `.env` file** (it's gitignored, so nobody else has
   seen it) and remove or fix `VITE_BACKEND_URL` if it's set to `localhost`
   or `127.0.0.1`. For LAN/local testing, leave it unset entirely. Only set
   it to a real deployed backend origin when doing an actual Vercel+Render
   split deployment.

---

# Verification checklist

Run these from **a second device** (a different laptop or a phone) on the
same network as the host machine — this is the only way to actually catch
regressions here, since testing from the host machine alone will pass even
if both bugs are still present.

- [ ] `grep -rn "localhost\|127\.0\.0\.1" src/` — no output except intentional,
      guarded fallbacks discussed above.
- [ ] From a second device, open the Admin login, log in fresh (no shared
      browser profile with the host), open Monitor Dashboard → incoming
      photo thumbnails load, not just filenames.
- [ ] From a second device, open a Student Portal link (`/s/<token>`) in a
      **private/incognito window** that has never logged into Admin →
      photos load and the download button produces a real, full-size file
      (not 0 bytes, not a JSON error body).
- [ ] "Download All" (ZIP) on the Student Portal still works (it already
      used the correct public route — confirm no regression).
- [ ] Confirm no request in the Network tab, on the second device, ever goes
      to `localhost` or `127.0.0.1` — everything should hit the LAN IP the
      page itself was loaded from.

# Non-goals — do not change

- `server/routes/drive.cjs` — already correct (local-first → preview →
  Drive, public, token-scoped). Do not add auth to it.
- `server/routes/uploads.cjs` local-first serving logic — correct for the
  Admin/Monitor (authenticated) surface once Bug 2 is fixed. Leave the
  `requireAuth` wall on `/api/uploads` in place; it's appropriate for the
  admin-only routes, the Student Portal just shouldn't be using them.
- `vite.config.js` proxy config and `server/index.cjs` static-serving /
  `0.0.0.0` binding — both already correct.
