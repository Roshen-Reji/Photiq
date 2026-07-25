# Design Specification: AutoSync Grad-Photo System

## 1. Concept & Aesthetic Duality
The system requires a dual-aesthetic approach to serve two entirely different user mindsets. It bridges the high-pressure, fast-paced environment of the event monitor with the celebratory, image-focused experience of the graduating student.


---

## 2. Monitor Dashboard (The Control Center)

### Visual Identity
*   **Style:** Brutalist, Command-Line, High-Contrast, Retro-Futuristic.
*   **Colors:** 
    *   Primary Background: Deep Black (`#000000`).
    *   Primary Accent: Vibrant Orange (`#FF4500`) or Phosphor Green (`#0F0`) for active states, current student highlights, and critical alerts.
    *   Text/Lines: Monospace White/Light Gray (`#E0E0E0`) for data tables and grid borders.
*   **Typography:** Strict use of monospace fonts (e.g., *JetBrains Mono*, *Fira Code* or *Courier*) for all lists, logs, and queue data to reinforce the system's mechanical nature. All-caps for headings and system statuses.

### Layout & UI Components
The layout mimics a heads-up display (HUD) with exposed controls and a rigid, framed grid layout.

*   **Global Framing:** The screen is framed by minimal crosshairs (`+`) and stark, thin borders separating the panels. 
*   **`[QUEUE_VIEW]` Panel (Left Column):** 
    *   A dense, vertically scrolling list of names and IDs. 
    *   Features visible, brutalist drag handles (`|||`) for manual reordering.
    *   Quick-action buttons are raw text in brackets: `[EDIT]`, `[DEL]`, `[SKIP]`.
*   **`[ACTIVE_NODE]` Panel (Center Column):** 
    *   The focal point of the dashboard. Massive, high-contrast typography displaying the *currently active* student on stage.
    *   Displays a large, dynamically generated digital QR code block.
    *   Includes a prominent status indicator (e.g., a flashing `[SYNCING...]` or solid `[READY]`).
*   **`[SYSTEM_LOG]` Panel (Right or Bottom Panel):** 
    *   A terminal-like scrolling text box showing background events in real-time to give the operator confidence that files are moving.
    *   *Visual text example:* `> FOLDER CREATED: ID_10492 ... > QR ASSIGNED ... > AWAITING IMAGES`

---

## 3. Student Portal & Photo Booth Display

### Visual Identity
*   **Style:** Minimalist, Editorial, Distraction-free.
*   **Colors:** 
    *   Primary Background: Pure White (`#FFFFFF`) for a clean gallery feel, or Deep Charcoal (`#121212`) if a dark mode is preferred to make photo colors pop.
    *   Text: Dark Gray (`#222222`) or Soft Silver (`#CCCCCC`).
*   **Typography:** Clean, geometric Sans-Serif (e.g., *Inter*, *Helvetica Neue*) for high readability and a modern, polished look. Generous spacing.

### Layout & UI Components
*   **The Photo Booth Scanner (Kiosk UI):**
    *   Centered, large camera viewfinder interface taking up the majority of the screen.
    *   Minimal text prompting action: "Scan QR to Begin."
    *   When a code is scanned, a clean, elegant toast notification confirms the user (e.g., "Welcome, [Student Name].").
    *   **Group Mode UI:** A simple, pill-shaped list appears at the top or bottom of the screen showing the names of all successfully scanned users for a group shot.
*   **The Personal Gallery (Mobile/Web View):**
    *   **Hero:** A simple header greeting the student with their name and a download-all button `[↓ Download Full Gallery]`.
    *   **Grid System:** A responsive masonry grid that perfectly accommodates mixed portrait and landscape photos without harsh cropping.
    *   **Interaction:** Smooth, lazy-loading image reveals on scroll. Tapping an image opens a full-screen, edge-to-edge lightbox with simple swipe functionality.