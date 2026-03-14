# AQUO 🌊

**Deterministic web extraction. Zero-cloud. Zero-tracking. Engineering-grade precision on your machine.**

AQUO is a privacy-first, local-first data conduit. It extracts structured data from the web without sending a single byte to the cloud. No AI hallucinations, no probabilistic guesses—just robust, high-performance engineering.

---

## Why AQUO?

| | **AQUO (Deterministic)** | **AI-Based / Cloud Scrapers** |
|--|--------------------------|-------------------------------|
| **Accuracy** | **100% Reliability** (Rule-based) | Probabilistic (May hallucinate) |
| **Privacy** | **Total Isolation** (Stays in browser) | Data passes through 3rd-party LLMs/Servers |
| **Speed** | **Instant** (Native DOM processing) | High latency (Cloud round-trips/Inference) |
| **Cost** | **One-time License** | Per-credit or per-token billing |

AQUO is built for those who value **data integrity** and **absolute privacy** over AI-driven uncertainty.

---

## Features

- **Precision Extraction** — High-performance DOM-based logic to turn list-style content (contacts, businesses, products) into structured tables.
- **Rule-based Reliability** — Handles complex layouts using deterministic algorithms, ensuring consistent results every time you run it.
- **Multiple Scenarios** — Optimized for B2B leads, real estate listings, e-commerce comparisons, and social history archival.
- **Zero-Cloud Architecture** — No backend, no telemetry, no data collection. Even the licensing is handled via a lightweight, device-bound local check.
- **License Activation** — For **reviewers and judges**: use the **Reviewer Access Key** `DEV-PASS-2026` to unlock full functionality instantly.
- **Instant Export** — One-click export to XLSX directly from the Chrome side panel.

---

## Installation

### Option A: Pre-built ZIP (Recommended for Judges)

1. 📥 **Download** — Go to [Releases](https://github.com/Edd1eOS/AQUO_unsw2026/releases) and download `aquo-1.0.0-chrome.zip`.
2. 📂 **Unzip** — Extract the folder to your local machine.
3. 🔌 **Load in Chrome** — Open `chrome://extensions/` → Enable **Developer mode** → Click **Load unpacked** → Select the **extracted folder**.
4. 🔑 **Activate** — Enter the **Reviewer Access Key**: **`DEV-PASS-2026`**.

---

## Technical Stack

- **WXT** — Modern web extension framework.
- **React + TypeScript** — For a type-safe, responsive Side Panel UI.
- **Tailwind CSS** — Utility-first styling for a clean, professional look.
- **Native DOM APIs** — High-speed, local data processing (No external dependencies).
- **Lemon Squeezy** — Offline-first license validation API.

---

## Permissions

| Permission | Purpose (Least-Privilege Principle) |
|------------|------------------------------------|
| **`activeTab`** | Temporary access to the current page for extraction. |
| **`scripting`** | Injecting the extraction engine into the target page. |
| **`storage`** | Local persistence of license and user preferences. |
| **`alarms`** | Scheduled license-expiry check only; no network or cross-origin use. |
| **`sidePanel`** | Providing a consistent, non-intrusive workspace. |
| **`https://api.lemonsqueezy.com/*`** | One-way license validation only; no user data uploaded. |
| **`*://*/*`** | Content script runs only on the page the user chooses for extraction; all processing is local. |

---

## Pre-release checklist (before pushing to GitHub / Releases)

- **ZIP**: Publish only `aquo-*-chrome.zip` from `npm run zip`. Do not use `wxt zip --sources`. Run `npm run check-zip` to ensure no `.git` or `.env` in the zip.
- **Secrets**: Do not commit `.env` or `.env.local`. If ever committed, remove from history and rotate keys.

---

## License

Proprietary & Non-Commercial. See [LICENSE](LICENSE).
