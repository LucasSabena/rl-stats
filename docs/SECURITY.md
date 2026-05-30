# RL Stats — Security & Privacy Policy

> This document defines the security architecture, privacy guarantees, and operational security rules for RL Stats.

## Core Principle

**The user's data belongs to the user. Period.**

This app is designed with a "local-first, privacy-by-default" architecture. No match data, player names, statistics, or usage patterns are transmitted to any server without explicit, informed user consent.

---

## Data Classification

### Highly Sensitive (Never leaves device)
- Match history and results
- Player names encountered in matches
- Personal performance statistics
- Game behavior patterns
- Any data derived from the RL Stats API stream

### Sensitive (Opt-in only)
- Crash reports and diagnostics
- Anonymous usage analytics
- Cloud sync data (only after explicit login + active cloud sync plan)

### Non-Sensitive (Required for functionality)
- App version (for update checks)
- OS version and architecture (for update checks)
- App settings (stored locally)

---

## Threat Model

### Threat: Unauthorized Data Exfiltration
**Scenario**: Malicious code or third-party library sends user data to external servers.
**Mitigation**:
- No analytics libraries (Google Analytics, Mixpanel, etc.)
- No crash reporting without explicit opt-in
- No network requests except for updater checks
- CSP `default-src 'self'` prevents inline scripts and external resources
- Code review required for any new dependency with network capability

### Threat: Man-in-the-Middle on Updates
**Scenario**: Attacker intercepts update download and serves malicious binary.
**Mitigation**:
- All updates cryptographically signed with Ed25519
- Public key embedded in binary
- Signature verification before installation
- HTTPS-only for update endpoints
- No downgrade attacks (version check enforced)

### Threat: Local Privilege Escalation
**Scenario**: App vulnerability allows attacker to execute arbitrary code.
**Mitigation**:
- Tauri's minimal permissions model
- No shell plugin access
- No arbitrary file system access outside app directory
- Input sanitization on all external data
- Regular dependency updates

### Threat: SQLite Injection
**Scenario**: Malformed data from game stream corrupts database.
**Mitigation**:
- Parameterized queries exclusively
- Input validation on all parsed fields
- JSON schema validation for event data
- Database WAL mode for crash recovery

### Threat: Memory Exposure
**Scenario**: Sensitive data remains in memory after app closes.
**Mitigation**:
- No password/credential storage (none needed)
- SQLite connection pool properly closed on exit
- Rust's ownership model prevents use-after-free

---

## Operational Security

### Development
1. No secrets in source code (checked by CI)
2. All dependencies pinned and audited
3. `cargo audit` runs in CI pipeline
4. `npm audit` runs in CI pipeline
5. No `println!` or `console.log` of sensitive data

### Release
1. Code signing certificate for Windows binaries
2. Signed update manifests
3. SHA256 checksums published with releases
4. Reproducible builds where possible
5. Release artifacts built in GitHub Actions (transparent)

### Incident Response
1. Security issues reported privately (not in public issues)
2. Security advisory published for confirmed vulnerabilities
3. Patch released within 72 hours for critical issues
4. Users notified via update mechanism

---

## Privacy Policy (User-Facing)

### What We Collect
**By default: Nothing.**

The app operates entirely on your local machine. Your match data, statistics, and settings are stored in a local SQLite database on your computer.

### What We Don't Collect
- No account creation required
- No personal information collected
- No match data sent to our servers
- No analytics or tracking by default
- No advertising
- No third-party cookies

### Optional Features (with consent)
**Crash Reports**: If you opt-in, anonymous crash data may be sent to help us fix bugs. This includes stack traces and app version, but NO match data or personal information.

**Cloud Sync**: If you create an account and activate a cloud sync plan, the app may upload profile metadata, settings, match history, player rows, match events, sessions, caches, friends, and presets needed to reproduce the same local experience on another device. Cloud sync remains off unless the user explicitly enables it.

**Update Checks**: The app checks our GitHub releases page for updates. This sends your app version and OS platform so we can serve the correct update file.

### Your Data Rights
- **Access**: All your data is visible in the app
- **Export**: You can export your data to JSON at any time
- **Deletion**: You can clear all data from the settings
- **Portability**: Export format is documented and open

### Data Storage Location
```
Windows: %APPDATA%\rl-stats\data.db
Settings: %APPDATA%\rl-stats\settings.json
Logs: %APPDATA%\rl-stats\logs\
```

### Third-Party Services
- **GitHub**: Used for hosting releases and update manifests
- **Supabase**: Planned optional cloud sync backend for authenticated users only
- **Stripe**: Planned optional subscription billing provider

---

## Tauri Security Configuration

### Capabilities (Minimal)
```json
{
  "permissions": [
    "core:app:default",
    "core:event:default",
    "core:window:default",
    "core:path:default",
    "core:fs:allow-appdata-read",
    "core:fs:allow-appdata-write",
    "core:process:allow-restart",
    "updater:default"
  ]
}
```

### Content Security Policy
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
connect-src 'self' https://api.github.com;
```

### Disabled Features
- No `shell` plugin
- No `clipboard` plugin (unless explicitly needed)
- No `global-shortcut` plugin
- No HTTP requests from frontend (only Rust backend)

---

## Compliance

- GDPR: Local-first design minimizes compliance burden
- CCPA: No personal information sold or shared
- COPPA: No data collection from minors (app doesn't know user age)

---

## Contact

Security concerns: Please open a private security advisory on GitHub or email the maintainers.

Privacy questions: Open a GitHub Discussion or Issue.
