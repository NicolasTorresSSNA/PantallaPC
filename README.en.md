# PantallaPC

**English** · [Español](README.md)

Stream your Windows PC screen to any web browser (for example, your phone's) over the
local network, **without accepting a permission prompt every time**: pair a device once
and it reconnects on its own afterwards.

> ### ⚠️ Modified fork of Deskreen CE
>
> PantallaPC is a **derivative work of [Deskreen CE](https://github.com/pavlobu/deskreen)
> v3.2.16** (© Pavlo Buidenkov and contributors, licensed under **AGPL-3.0**). This version
> was **modified by Nicolas Torres on 23–24 October 2026**. The complete, dated list of
> changes is in [CHANGES.md](CHANGES.md) (in Spanish, with file paths).
>
> This is a personal project, published in case the changes are useful to someone. It is
> **not affiliated with, endorsed by, or maintained by Deskreen or deskreen.com.** The
> original README is kept in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md). Commits
> that come from the original project keep their authorship and hashes.

## What differs from Deskreen CE

| | Deskreen CE (original) | PantallaPC |
|---|---|---|
| Connecting a device | QR + "Allow" prompt **on every connection** | Pair **once**; later connections need no prompt |
| What to share | Chosen after connecting | Can be **chosen beforehand**; starts as soon as the device is accepted |
| Address | Changes with the PC's IP | Optional `deskreen-<host>.local` (mDNS) |
| Ownerless room | Dead QR code, silently | Detected; a new room is created |
| Data profile | AppData | Next to the executable (`data/`), or `%APPDATA%\PantallaPC` when installed |
| Update checks | Queries the original's releases | Disabled (no outgoing request) |
| Electron | 37 | 45 (fixes known vulnerabilities) |

## Usage

Build the **installer** (`PantallaPC-Setup-<version>.exe`, per-user, no admin) or the
**portable folder** (`PantallaPC.exe`, data in `data/` next to it) — see
[Build](#build). First connection:

1. Open PantallaPC; allow **private networks** if Windows asks about the firewall.
2. On your phone (same Wi-Fi) scan the QR code or type the address shown.
3. On the PC you will see a **6-digit code** that must match the one on the phone.
4. Tick **"Remember this device"** and press **Allow**.

From then on that phone connects with no prompt. You can choose **what to share** in
advance under *Connection options*.

**Stable `.local` address (optional):** browsers store the phone's identity *per address*,
so a changing PC IP would force re-pairing. Enabling *Use a stable address (.local)*
advertises `deskreen-<hostname>.local`. **Chrome on Android cannot resolve `.local`
names**; if that happens, turn it off and reserve a fixed IP for the PC in your router.

## Security and privacy

- Transport is **plain HTTP on your LAN** (as in the original); video uses WebRTC. Use it
  only on networks you trust.
- Pairing needs your approval on the PC. Afterwards the phone proves its identity by
  **signing a single-use challenge** (Ed25519) bound to its connection and room. 5 failed
  attempts within a minute from an IP block that IP for 5 minutes. Devices expire after 30
  days and can be revoked.
- **Known limitation:** the 6-digit code does **not** protect against an active attacker on
  your own network who intercepts the pairing (that needs TLS with certificate pinning,
  not implemented yet). Pair only on trusted networks.
- Stored: `trusted-devices.json` (each device's name and **public key** only) and
  `deskreen-ce-storage.json` (settings).
- **No telemetry of its own.** The viewer inherits a "Google Analytics" notice, but builds
  from this repository configure **no Analytics tag**, so none is loaded. The update check
  against the original project's GitHub is disabled.

## Status and limits

Tested on **Windows 11** with **Chrome on Android**; macOS/Linux not tested in this fork.
The executable and installer are **unsigned** (SmartScreen may warn). Some `npm audit`
warnings remain (e.g. `node-forge`, no fix available).

## Build

Node.js ≥ 23 (24 used) and npm ≥ 10. Tested on Windows.

```bash
npm install
cd src/client-viewer && npm install && cd ../..
npm run dev
npm test          # 97 tests (Vitest)
```

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build
npx electron-builder --win dir nsis --config electron-builder.yml
```

## License and credits

**GNU AGPL v3** (see [LICENSE](LICENSE)), same as the original. If you run a modified
version for others over a network, the AGPL requires you to offer them the corresponding
source.

- **Deskreen CE** — © Pavlo Buidenkov and contributors — https://github.com/pavlobu/deskreen
- **PantallaPC modifications** — Nicolas Torres, 2026 (assisted by Claude, by Anthropic;
  commit trailers say so).
- New dependencies: `@noble/curves`, `@noble/hashes`, `bonjour-service`, `vitest` (all MIT).
