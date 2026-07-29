# Performance & Bug Fix Request

This is **not a UI redesign**. Focus only on fixing bugs, improving performance, reducing latency, and making the system reliable.

## 1. Image Upload Pipeline

The current image upload system is slow and unreliable.

### Required behavior

* As soon as the photographer captures an image, begin uploading immediately.
* If the upload takes too long, automatically generate a compressed preview image (WebP/JPEG at lower quality) and send that to the Monitor Dashboard for instant viewing.
* Continue uploading the original full-resolution image to Google Drive in the background.
* Never wait for the full-resolution upload before updating the UI.
* The monitor should always see the preview almost instantly.

Implement:

* Background uploads
* Progressive uploads
* Retry mechanism on failure
* Upload queue
* Upload progress tracking
* Automatic retry with exponential backoff
* Offline recovery if the network drops

---

## 2. Separate Preview and Original Images

Implement two image versions:

### Preview Image

* Small size
* Compressed
* Optimized for speed
* Used only inside:

  * Monitor Dashboard
  * Student Portal live preview
  * Camera Dashboard

### Original Image

* Full resolution
* Stored in Google Drive
* Never compressed
* Used for downloading and final delivery

The preview should appear immediately while the original continues uploading in the background.

---

## 3. Live Synchronization

Currently updates are delayed.

Replace polling wherever possible with real-time synchronization.

Use:

* WebSockets
* Firebase realtime listeners
* Supabase realtime
* Server-Sent Events

(Use whichever best matches the existing stack.)

Whenever:

* a photo is uploaded,
* a student changes,
* upload completes,
* image status changes,

every connected device should update instantly without refreshing.

---

## 4. Student Portal Delay

Problem:
The Student Portal linked to the Drive account shows the image after a long delay.

Fix:

* Remove unnecessary waiting.
* Cache metadata.
* Update immediately after upload.
* Show the compressed preview first.
* Automatically replace it with the original once available.

Target:
Student should see the image within 1–2 seconds.

---

## 5. Student Portal on Other Devices

Current issue:
On another laptop, the same student's portal shows **0 images** even though the image exists.

Investigate and fix:

* Authentication issues
* Drive permission problems
* Cache invalidation
* Database synchronization
* API response issues
* Firestore/Database listeners
* CORS problems
* State management bugs

The portal should display the same images on every authorized device.

---

## 6. Monitor Dashboard

Current issue:
The "Add Node" button does nothing.

Fix:

* Restore full functionality.
* Verify event listeners.
* Verify backend API.
* Verify state updates.
* Display proper success/error messages.
* Remove silent failures.

---

## 7. Performance Optimization

Optimize the entire application.

Reduce:

* Initial load time
* API latency
* Image loading time
* Re-renders
* Memory usage
* Network requests

Implement:

* Lazy loading
* Image caching
* Browser caching
* Memoization
* Code splitting
* Debouncing where necessary
* Optimized database queries
* Batched writes
* Parallel uploads where appropriate

---

## 8. Real-Time Status Indicators

Display live status for every upload:

* Waiting
* Uploading Preview
* Preview Ready
* Uploading Original
* Upload Complete
* Failed
* Retrying

Users should always know what is happening.

---

## 9. Error Handling

Never fail silently.

If something fails:

* Show meaningful error messages.
* Retry automatically.
* Log detailed errors.
* Recover gracefully.
* Keep the UI responsive.

---

## 10. Responsiveness

Ensure every page works smoothly on:

* Desktop
* Laptop
* Tablet
* Mobile

Eliminate layout shifts and UI freezes.

---

## 11. Code Quality

Refactor any inefficient code.

Remove:

* Duplicate logic
* Unused API calls
* Blocking operations
* Memory leaks
* Race conditions

Improve maintainability without changing functionality.

---

## 12. Final Objective

The application should feel instantaneous.

Expected workflow:

1. Photographer captures image.
2. Compressed preview uploads immediately.
3. Monitor Dashboard updates live.
4. Student Portal updates live.
5. Original image uploads to Google Drive in the background.
6. Preview is automatically replaced with the original once upload completes.
7. Every connected device stays synchronized in real time.

The entire system should be fast, responsive, reliable, fault-tolerant, and production-ready while preserving all existing functionality.
