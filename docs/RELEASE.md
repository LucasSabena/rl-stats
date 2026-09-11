# Release Process

This document describes how to create a new release of **RL Stats**.

## Prerequisites

- [ ] You have push access to the GitHub repository.
- [ ] You have set up the required GitHub Secrets (see [Secrets Setup](#secrets-setup) below).
- [ ] All changes for the release are merged into the `main` branch.
- [ ] CI is passing on `main`.

---

## 1. Update Versions

All three version fields must be identical:

1. **package.json**
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **src-tauri/Cargo.toml**
   ```toml
   [package]
   version = "0.2.0"
   ```

3. **src-tauri/tauri.conf.json**
   ```json
   {
     "version": "0.2.0"
   }
   ```

You can verify consistency with:
```powershell
.\scripts\check-versions.ps1 -ExpectedVersion "0.2.0"
```

---

## 2. Update Changelog

Edit `docs/CHANGELOG.md` and add a new section for the release:

```markdown
## [0.2.0] - 2026-05-15

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Change description
```

Follow [Keep a Changelog](https://keepachangelog.com/) format.

---

## 3. Commit Version Bump

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json docs/CHANGELOG.md
git commit -m "chore(release): prepare v0.2.0"
git push origin main
```

Wait for CI to pass.

---

## 4. Create and Push Git Tag

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

Pushing the tag automatically triggers the **`Release`** workflow (`.github/workflows/release.yml`).

---

## 5. Monitor Release Workflow

Go to **Actions > Release** in the GitHub repository to monitor the build progress.

The workflow performs the following steps:
1. Creates a GitHub Release **draft**
2. Builds the Windows x64 Tauri app (MSI + NSIS)
3. Signs the updater manifest (if signing key is configured)
4. Uploads all artifacts to the release
5. Verifies `latest.json` is present

Build time is typically **15–30 minutes**.

---

## 6. Verify Artifacts

Once the workflow completes:

1. Go to **Releases** in the GitHub repository.
2. Open the draft release for `v0.2.0`.
3. Verify the following assets are attached:
   - `RL Stats_0.2.0_x64-setup.exe` (NSIS installer)
   - `RL Stats_0.2.0_x64_en-US.msi` (MSI installer)
   - `latest.json` (Tauri updater manifest)
   - `checksums.txt` (SHA256 hashes)

### Recommended release page sections

For every public release, keep the GitHub release description easy to scan:

```markdown
## What this app does
- Captures Rocket League match data from the official local Stats API
- Builds a private local match history on your PC
- Shows live match dashboards, detailed match breakdowns, and analytics

## Download
- MSI: Recommended Windows installer
- EXE: NSIS installer
- latest.json: Updater manifest for existing installs

## Notes
- Windows 10/11 only
- Rocket League must be installed on the same machine
- All data stays local unless you export it yourself
```

### Packages / downloads positioning

- Use **GitHub Releases** as the public download page for installers.
- Attach MSI, NSIS, updater manifest, and checksums to each release.
- If GitHub Packages is used later, reserve it for developer-facing artifacts only. End users should still be directed to Releases.

4. Verify `latest.json` contains:
   - Correct `version` field
   - Valid `platforms.windows-x86_64.url` pointing to the release asset
   - A `signature` field (required for the updater to accept the update)

---

## 7. Publish the Release

1. Review the draft release notes.
2. Click **Publish release**.

> **Do not publish** if `latest.json` is missing or unsigned — the auto-updater will break for existing users.

---

## 8. Test Updater from Previous Version

Before announcing the release, verify the auto-updater works:

1. Install the **previous version** of the app (e.g., `v0.1.0`).
2. Launch the app and trigger a manual update check (or wait for automatic check).
3. Confirm the app detects `v0.2.0` and installs it successfully.
4. After restart, verify the app reports version `0.2.0` in the UI or logs.

If the updater fails:
- Check that `latest.json` is accessible at:
  ```
  https://github.com/LucasSabena/rl-stats/releases/latest/download/latest.json
  ```
- Verify the signature in `latest.json` matches the public key in `tauri.conf.json`.
- Check the app logs for updater errors.

---

## Secrets Setup

The following secrets must be configured in **Settings > Secrets and variables > Actions**:

| Secret | Required | Description |
|--------|----------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | **Yes** | The private key used to sign the updater manifest. Generate with `tauri signer generate`. The corresponding public key must be in `tauri.conf.json`. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | If encrypted | Password for the private key, if it was generated with one. |
| `WINDOWS_CERTIFICATE` | No | Base64-encoded `.pfx` code signing certificate for Windows. Optional but recommended for production. |
| `WINDOWS_CERTIFICATE_PASSWORD` | If cert provided | Password for the `.pfx` certificate. |

### Generating Updater Signing Keys

```bash
# Install Tauri CLI if not already installed
npm install -g @tauri-apps/cli

# Generate a new key pair
tauri signer generate

# This outputs:
# - Private key (save to GitHub Secret TAURI_SIGNING_PRIVATE_KEY)
# - Public key (paste into tauri.conf.json -> plugins.updater.pubkey)
```

> **Keep the private key secure.** Anyone with access to it can forge updates for your users.

### Windows Code Signing (Optional)

For production releases, obtain a code signing certificate from a trusted CA (e.g., DigiCert, Sectigo). Export it as `.pfx` and encode it:

```powershell
$bytes = [IO.File]::ReadAllBytes("certificate.pfx")
[Convert]::ToBase64String($bytes) | Set-Clipboard
```

Paste the base64 string into the `WINDOWS_CERTIFICATE` secret and the PFX
password into `WINDOWS_CERTIFICATE_PASSWORD`.

The release workflow detects both secrets (`if: env.WINDOWS_CERTIFICATE != ''`),
imports the certificate into `Cert:\CurrentUser\My` **before** the build, and
passes its thumbprint to the bundler with
`pnpm tauri build --config '{"bundle":{"windows":{"certificateThumbprint":"..."}}}'`.
No thumbprint is committed to `tauri.conf.json` and no secret is echoed. Without
the secrets the build runs exactly as before (unsigned).

Notes:
- SmartScreen reputation builds over time even with a valid OV certificate;
  EV certificates or Azure Trusted Signing are the only ways to skip the
  reputation period. Azure can be added later as an extra install/sign step.
- After signing, verify the installer shows your publisher: right-click the
  `.exe` → Properties → Digital Signatures (or `Get-AuthenticodeSignature`).
- When the certificate expires, replace the secret; the old signatures on
  already-published installers remain valid.

---

## Rollback Procedure

If a critical issue is discovered after release:

1. **Immediately unpublish** the release (convert to draft or delete).
2. Restore the previous `latest.json` from the prior release so users do not download the broken version.
3. Fix the issue, bump the version (e.g., `v0.2.1`), and create a new release.

Do **not** overwrite an existing tag. Always create a new version.

---

## Manual Release Trigger

In emergency situations, you can trigger a release manually:

1. Go to **Actions > Release**.
2. Click **Run workflow**.
3. Enter the tag name (must already exist).
4. Choose whether to create a draft release.
5. Click **Run workflow**.

This is useful for rebuilding artifacts if the original workflow failed.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| CI fails on `cargo clippy` | Fix warnings or run `cargo clippy --fix` locally. |
| `latest.json` missing from release | Check that `tauri.conf.json` has the updater plugin configured and `TAURI_SIGNING_PRIVATE_KEY` is set. |
| Updater signature invalid | Ensure the public key in `tauri.conf.json` matches the private key used in CI. |
| Windows SmartScreen warning | Purchase and configure a code signing certificate. Unsigned executables trigger warnings. |
| E2E tests fail in CI | Check Playwright logs in the uploaded artifact. Ensure tests don't depend on local Rocket League being open. |
