# GradSync — Graduation Photo & Queue Controller

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![Vite](https://img.shields.io/badge/Vite-6.0-purple.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-4.8-black.svg)
![License](https://img.shields.io/badge/License-ISC-yellow.svg)

**GradSync** is a real-time graduation ceremony queue controller, physical card scanner / student identifier, private QR link generator, photo router, and tethered camera upload agent.

---

## ✨ Features

- 📜 **Ceremony Queue Management**: Real-time synchronized queue tracking for stage announcements.
- 🎴 **Physical Card & QR Mapping**: Scans physical student cards and instantly links student IDs to unique QR photo galleries.
- 📷 **Tethered Camera Upload Agent**: Background agent on photographer laptops with automatic retries and RClone sync so photography is never delayed by network outages.
- 📁 **Roster Import**: Bulk CSV roster validation supporting `Student ID`, `Name`, and `Department`.
- ⚡ **Real-time Web Sockets**: Instant UI synchronization across stage monitors, scanners, and camera operators using Socket.io.

---

## 📁 Repository Structure

```text
├── agents/
│   ├── camera-upload-agent.cjs        # Node.js background agent for tethered camera laptops
│   └── camera-agent.config.example.json # Example agent configuration file
├── data/
│   └── .gitkeep                        # Runtime storage for event-state.json (git ignored)
├── server/
│   ├── index.cjs                      # Express + Socket.io main backend server
│   ├── store.cjs                      # State management & persistent storage helper
│   └── defaults.cjs                   # Initial default configuration settings
├── src/
│   ├── App.jsx                        # React frontend UI (Queue, Roster, Camera Status)
│   ├── main.jsx                       # Vite entry point
│   ├── styles.css                     # Main styling
│   └── xlsx-import.js                 # Roster CSV parser & validator
├── templates/
│   └── student-roster-template.csv    # Sample roster file for testing
├── index.html                         # Application HTML template
├── vite.config.js                     # Vite build configuration
└── package.json                       # Dependencies & scripts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher

### Installation & Run

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Roshen-Reji/graduation-qr.git
   cd graduation-qr
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Development Server** (Frontend + Backend concurrently):
   ```bash
   npm run local
   ```

4. **Production Build & Run**:
   ```bash
   npm run build
   npm run start
   ```
   Open [http://127.0.0.1:8787](http://127.0.0.1:8787) in your browser.

---

## 📋 Roster Import

The controller accepts a CSV roster with `Student ID`, `Name`, and `Department` columns.
A ready-to-edit template is available at [`templates/student-roster-template.csv`](templates/student-roster-template.csv).

- **Excel Users**: Use **Save As → CSV UTF-8** before importing.
- **Validation**: The client validates required columns, and the controller rejects duplicate IDs.

---

## 📷 Camera & RClone Setup

1. **Configure RClone** on photographer laptops:
   ```bash
   rclone config
   ```
2. **Setup Agent Configuration**:
   Copy `agents/camera-agent.config.example.json` to `agents/camera-agent.config.json` and set your tether output directory, remote target, and `dryRun` preference.
3. **Authentication Token**:
   Set `GRADSYNC_AGENT_TOKEN` on the server and matching `agentToken` in each agent config.
4. **Run Agent**:
   ```bash
   npm run agent:camera
   ```
   The agent maintains a local JSON queue in `agents/runtime` and retries automatically after failed network or sync transfers.

---

## 🛡️ License

Distributed under the ISC License.
