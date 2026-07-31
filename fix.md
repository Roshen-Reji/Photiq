# FIX.md

## Objective

Resolve all networking, upload, preview, download, and synchronization issues in the Photiq platform.

The system must always prioritize local files and should never block the user interface while background cloud synchronization is occurring.

---

# Critical Issues

## 1. Student Portal

### Blank "Syncing..." Card

Problem:
- Students see an empty card while Google Drive/rclone syncing is in progress.
- Image preview is hidden until sync completes.

Required Fix:
- Never hide the image because of sync status.
- Always render the local image immediately.
- Sync status should only be a small badge.
- Download button must remain available at all times.

Expected Behaviour

✔ Local image appears instantly.

✔ "Cloud Syncing..." badge is only informational.

✔ Download works immediately even before Drive sync completes.

---

### Broken Downloads on Other Devices

Problem

The frontend still contains localhost or 127.0.0.1 URLs.

External laptops attempt to download from their own localhost instead of the server.

Required Fix

- Remove every hardcoded localhost reference.
- Remove every hardcoded 127.0.0.1 reference from frontend pages.
- Use VITE_API_BASE_URL or relative URLs.
- Downloads should always point to backend endpoints.

Search Entire Repository For

http://localhost

https://localhost

127.0.0.1

Replace with

```
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
```

---

# 2. Admin Dashboard

## Upload Delay

Problem

New uploads only appear after several seconds because uploads wait for cloud operations.

Required Fix

Upload flow must become:

Camera Capture

↓

Save locally

↓

Insert MongoDB record

↓

Return HTTP response immediately

↓

Background Drive Sync

The API must never wait for:

- rclone
- Google Drive
- Compression
- Any cloud operation

---

## Slow Refresh

Replace manual refreshes with automatic polling.

Requirements

Poll:

```
/api/uploads/unassigned
```

every

```
2500ms
```

Refresh without page reload.

---

## Broken Image Icons

Problem

Image previews show broken placeholders while files are still writing.

Required Fix

Every preview image must have

```
onError
```

fallback handling.

The UI should gracefully retry or display a fallback image instead of a broken browser icon.

---

# 3. Backend

## Local Preview First

Preview endpoints must always check:

1. Local disk
2. Drive fallback

Never:

Drive

↓

Local

Correct priority:

Local

↓

Drive

---

## Download Endpoint

Downloads must:

- stream local files
- use attachment headers
- only redirect to Drive if the local file no longer exists

---

## Path Normalization

Every stored path must use:

```
/
```

Never

```
\
```

Normalize every

```
localPath

filePath
```

before storage and before serving.

---

## Static Uploads

Expose uploads directory using Express static middleware.

Requirements

- CORS enabled
- Cache disabled
- Cross-Origin Resource Policy configured

---

# 4. Networking

Server must listen on

```
0.0.0.0
```

NOT

```
127.0.0.1
```

NOT

```
localhost
```

Reason

Other laptops on the LAN must reach both:

- API
- Uploads
- Preview endpoints

---

# 5. Vite

Development server requirements

```
host: "0.0.0.0"
```

Proxy

```
/api
/uploads
```

to backend automatically.

---

# Code Cleanup

Search the entire repository for:

- localhost
- 127.0.0.1
- absolute API URLs

Replace them with environment-based URLs.

---

# Acceptance Tests

## Student Portal

- Local image appears instantly.
- Download works during syncing.
- No blank syncing cards.
- Sync badge is informational only.

---

## Admin Dashboard

- New uploads appear within 2.5 seconds.
- No broken preview icons.
- Images load immediately after capture.
- Dashboard updates automatically.

---

## Backend

- Preview endpoint returns local image immediately.
- Download endpoint serves local file.
- Drive used only as fallback.
- Upload API responds immediately after local save.

---

## Networking

Verify from another laptop:

```
http://<LAN-IP>:5173
```

Requirements

- Dashboard loads.
- Student Portal loads.
- Images render.
- Downloads succeed.
- No CORS errors.
- No localhost requests.

---

## Code Quality Requirements

The implementation must:

- Preserve existing functionality.
- Avoid introducing breaking API changes.
- Maintain backward compatibility.
- Keep cloud synchronization asynchronous.
- Prioritize local responsiveness over cloud completion.
- Log errors without blocking the user interface.

---

# Completion Criteria

The task is complete only when:

- No hardcoded localhost references remain.
- Images render immediately after capture.
- Student downloads work during syncing.
- Admin Dashboard updates automatically.
- External devices work over LAN.
- Local storage is always prioritized over cloud storage.
- All acceptance tests pass successfully.