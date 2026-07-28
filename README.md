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
- **Google never charges your card automatically.** When the credit or the 90 days run out, your
  trial billing account closes, your resources stop, and after a 30-day grace period they are
  deleted. You are not charged unless *you* manually upgrade to a paid account.
- As long as your billing account stays in trial status, **CraftLift cannot cost you real money.**
- CraftLift never displays its own cost estimates, because a wrong estimate is worse than none.
  It gives you a button that opens Google's own billing page instead, and sets up a budget alert
  so Google emails you directly.
- CraftLift never touches your card details. Payment happens on Google's site, in your browser.

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
- File manager with a built-in text editor, so you can edit `server.properties`, drop in datapacks,
  or swap the server jar yourself
- Automatic rotating backups on the VM, plus pull-to-local backups before shutdown and before the
  trial expires
- Graphical `server.properties` editor and player (whitelist / op / ban) management
- An SSH terminal for when you want to get your hands dirty

## Status

Early development. Not yet usable.

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
