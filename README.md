# CraftLift

**Host your own Minecraft server on Google Cloud — without learning the cloud.**

[繁體中文說明](README.zh-TW.md)

CraftLift is a desktop app that sets up and manages a Minecraft server on Google Cloud
Platform, using the **$300 / 90-day free trial credit** that Google gives every new account.

---

## Read this before you start

CraftLift is **not** a true one-click tool, and any project claiming otherwise is lying to you.

Google requires you to create a Google account and add a credit card by hand, in a browser,
before any software can create resources on your behalf. **No application can automate that
step.** CraftLift picks up right after it and automates everything else: creating the project,
enabling APIs, provisioning the machine, installing Java and the server, configuring the
firewall, backups, and day-to-day management.

Realistically: **about five minutes of following an illustrated guide, then it's automatic.**

### About money

- Google gives new accounts **$300 of credit, valid for 90 days**. Whichever runs out first ends
  the trial.
- **Google never charges your card automatically.** When the credit or the trial period runs out,
  your trial billing account closes and your resources stop. You are not charged unless *you*
  manually upgrade to a paid account.
- As long as your billing account stays in trial status, **CraftLift cannot cost you real money.**
- CraftLift shows a cost estimate before you create a server, priced from live rates in Google's
  Cloud Billing Catalog API. Treat it as an estimate: it covers the machine, the fixed address and
  the disk, and **excludes network egress, discounts and free-tier allowances**. CraftLift also
  sets up a budget alert so Google emails you directly, and gives you a button that opens Google's
  own billing page — **those are the numbers that count**.
- CraftLift never touches your card details. Payment happens on Google's site, in your browser.

> **On the standing of this section.** The statements above about Google Cloud billing, trial
> terms and how resources are handled are **for reference only**; [Google's own published
> terms](https://cloud.google.com/free) always govern. Google may change these policies at any
> time without notice. This project makes no warranty as to their accuracy, currency or
> completeness, and accepts no liability for any charges, data loss or other damages arising from
> them. **Your Google Cloud usage and bill are your own responsibility.**

**CraftLift is provided without warranty. You are responsible for your own Google Cloud
usage and charges.** See the [licence](LICENSE) for the full disclaimer.

---

## What it does

- Detects and helps you install the Google Cloud CLI
- Signs you in through Google's official tooling — **no "unverified app" warning screen, no user cap**
- Creates a dedicated Google Cloud project so that "delete everything" is guaranteed to leave
  nothing behind that could bill you
- Provisions a VM sized by how many people will play, not by machine model numbers
- Installs a Vanilla Minecraft server managed by `systemd`, so it restarts on boot and after crashes
- Live console and log view, driven over RCON
- A file manager that works like Windows Explorer — multi-select, right-click menus, drag and drop,
  rename, cut/copy/paste — plus a built-in text editor for `server.properties`, so you can drop in
  datapacks or swap the server jar yourself
- Automatic rotating backups on the VM, and the world is pulled back to your PC before shutdown
- Graphical `server.properties` editor and player (whitelist / op / ban) management
- Sign out of your Google account from Settings, which revokes the credentials on this PC and
  returns the app to first-run setup

## Updates

CraftLift checks [GitHub Releases](https://github.com/antony0702/CraftLift/releases) for a newer
version a few seconds after launch, and you can check any time under **Settings → Software update**.

When one is found you get a single line at the top of the window. It **does not download and does
not install on its own** — both steps are yours to press. The download is verified against the
SHA512 recorded in the release, and is discarded if it does not match.

An update replaces the application only. None of the following live in the install directory, so
none of them are touched:

| Data | Location |
| --- | --- |
| Preferences | `%APPDATA%\CraftLift\preferences.json` |
| Google Cloud credentials | `%APPDATA%\gcloud` (managed by the Google Cloud CLI) |
| SSH key | `~\.ssh\google_compute_engine` (created by the Google Cloud CLI) |
| Local backups | `Documents\CraftLift Backups` (configurable) |
| Servers and world saves | On your Google Cloud account |

## Verifying your download

The installer is not built on anyone's laptop. It is built by GitHub Actions from the source in
this repository, using a workflow you can read:
[`.github/workflows/release.yml`](.github/workflows/release.yml).

When the build finishes, GitHub issues a **build provenance attestation** binding the installer's
digest to the repository, the commit, the workflow and that specific run, and records it in a
public transparency log. The signing key is minted for that run and thrown away — **nobody can
obtain it**, including this project's author.

Before installing, verify it with the [GitHub CLI](https://cli.github.com):

```bash
gh attestation verify CraftLift-1.0.0-Setup.exe --repo antony0702/CraftLift
```

If it passes, the file you hold really was built from the source here, and you can see exactly
which commit it came from. You can then go read that code — **which is what "open source" is
supposed to be worth to a user.**

You can also check the digest against `SHA256SUMS.txt` on the release page:

```powershell
Get-FileHash CraftLift-1.0.0-Setup.exe -Algorithm SHA256
```

Be aware of what a checksum can and cannot do: we compute and publish it ourselves, so it only
proves the file was not altered in transit — not that the publisher was honest. The attestation
above is what covers the second case.

> **About the Windows warning.** The installer is not code-signed, so Windows SmartScreen will
> report an unknown publisher. That warning reflects the absence of a paid certificate, not a
> problem with the file. Use the verification above to decide whether to trust it.

## Status

1.0.0 is the first public release.

Exercised against real Google Cloud accounts: first-run setup, creating a server, starting and
stopping it, the console and commands, editing `server.properties`, player management, the file
manager, backups and pulling them to the PC, and deleting an individual server along with its disk
and static IP.

**Not yet exercised end to end:** "Delete everything" in Settings, which removes the whole cloud
project. The feature is implemented, but that path has never actually been run.

Expect rough edges. Bug reports and suggestions are welcome, either through **Settings → Feedback**
in the app or as an issue here.

## Requirements

- Windows 10 / 11
- A Google account and a credit card for the Google Cloud free trial
- Google Cloud CLI (CraftLift will guide you through installing it)

## Building from source

```bash
npm install
npm run dev        # run in development
npm run build:win  # build a Windows installer
```

> **Note on `npm audit` warnings.** You will see high-severity advisories from
> `electron-builder`'s dependency tree (they all trace back to one ReDoS issue in
> `brace-expansion`). These packages only ever run on *your* machine at build time — none
> of them ship inside the application. Do **not** run `npm audit fix --force`; it downgrades
> `electron-builder` and breaks the build.

## Licence

[GPL-3.0-or-later](LICENSE). If you distribute a modified version, you must publish your
changes under the same licence.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
