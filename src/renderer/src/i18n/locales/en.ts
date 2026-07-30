export default {
  app: {
    name: 'CraftLift',
    tagline: 'Host your own Minecraft server on Google Cloud'
  },
  nav: { settings: 'Settings' },
  common: {
    error: 'Something went wrong',
    retry: 'Retry',
    copied: 'Copied',
    copy: 'Copy',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete',
    back: 'Back',
    refresh: 'Refresh'
  },
  state: {
    PROVISIONING: 'Provisioning',
    STAGING: 'Starting',
    RUNNING: 'Running',
    STOPPING: 'Stopping',
    TERMINATED: 'Stopped',
    SUSPENDED: 'Suspended',
    UNKNOWN: 'Unknown'
  },
  setup: {
    /* Small headings above each first-run page, so people know where they are */
    steps: {
      environment: 'Step 1 · Prerequisites',
      account: 'Step 2 · Google account',
      server: 'Step 3 · Create the project'
    },
    checking: {
      account: 'Checking your Google account…',
      billing: 'Looking up your billing accounts…',
      slow: 'Google’s command-line tool takes a few seconds to start up each time. That is its normal speed, not a hang.'
    },
    gcloudMissing: {
      title: 'Google Cloud CLI is required',
      desc: 'CraftLift drives your cloud account through Google’s official command-line tool. This way the sign-in flow never shows an “unverified app” warning, and there is no cap on how many people can use CraftLift.',
      how: 'Open Terminal or PowerShell, paste the command below and press Enter:',
      afterInstall: 'Once it finishes, restart CraftLift so it can pick up the newly installed tool.',
      download: 'Or visit the official download page',
      recheck: 'I’ve installed it — check again'
    },
    login: {
      title: 'Sign in with Google',
      desc: 'Your browser will open so you can sign in with the Google account you want to host the server under. CraftLift never sees your password or card details — those stay on Google’s own site.',
      button: 'Sign in with Google',
      waiting: 'Waiting for you to finish signing in…',
      waitingHint:
        'This screen continues automatically once you approve. If you closed the browser by accident, just press sign in again.'
    },
    noBilling: {
      title: 'No billing account available yet',
      desc: 'Your Google account has not activated Google Cloud yet. You have to do this yourself in a browser — no application can do it for you.',
      point1: 'Google gives new accounts $300 of credit, valid for 90 days. Whichever runs out first ends the trial.',
      point2: 'Activation needs a credit card for identity verification. CraftLift never sees your card number.',
      point3: 'Google does not charge you automatically when the credit or the 90 days run out — you have to manually upgrade to a paid account before anything is billed.',
      open: 'Open Google Cloud sign-up',
      recheck: 'I’ve activated it — check again',
      foundButClosed:
        'Found {{count}} billing account(s), but all of them are closed and cannot be used. Check in the Google Cloud console whether activation finished.',
      autoRecheck: 'Switch back to this window after finishing in the browser — it re-checks automatically.'
    },
    billing: {
      title: 'Preparing your cloud environment',
      signedInAs: 'Signed in as',
      select: 'Choose a billing account',
      whatHappens:
        'CraftLift creates a dedicated Google Cloud project for your servers. Everything lives inside it, so when you want to shut it all down, deleting that one project is guaranteed to leave nothing behind that could bill you. A budget alert is also set up so Google emails you directly as spending approaches the limit.',
      continue: 'Create project and continue',
      preparing: 'Preparing your cloud environment…',
      preparingHint:
        'Creating the project, linking billing, enabling the required services. The first run can take a minute or two.'
    }
  },
  list: {
    loading: 'Loading your worlds…',
    title: 'Your worlds',
    create: 'Create a server',
    manage: 'Manage',
    playing: '{{count}} playing',
    empty: 'No servers here yet.',
    emptyHint: 'Create one, send your friends the address, and you are playing together.',
    copyAddress: 'Click to copy the address'
  },
  create: {
    defaultName: 'My server',
    loading: 'Fetching Minecraft versions…',
    creating: 'Creating your server',
    creatingHint:
      'Provisioning the machine, configuring the firewall, installing Java and Minecraft. This usually takes three to five minutes.',
    title: 'Create a server',
    name: 'Server name',
    tier: 'Roughly how many people will play?',
    officialCalculator: 'Open the official Google pricing calculator',
    family: 'Machine family',
    familyHint:
      'E2 is cheap and fine for most cases; N2 and C3 have better single-core performance, which Minecraft benefits from when many people play. Available families differ by region.',
    machinesLoading: 'Loading machine types…',
    machinesUnavailable:
      'Could not load the machine types, so the two menus below are empty. Try signing out and back in from Settings.',
    predefined: 'Predefined',
    custom: 'Custom',
    customUnsupported: 'The {{family}} family does not support custom vCPU and memory — pick a predefined type.',
    machineType: 'Machine type',
    sharedCpu: 'shared core',
    cpus: 'vCPUs',
    cpusHint: 'Must be an even number above 1. Minecraft is mostly single-threaded, so more cores does not scale linearly.',
    memory: 'Memory (GB)',
    memoryHint:
      'Must be a multiple of 0.25 GB. Each family limits how much memory you can attach per core; Google rejects out-of-range values and explains why.',
    estimate: {
      title: 'Cost estimate',
      heap: '{{heap}} allocated to Minecraft',
      perMonth: 'per month, always on',
      perHour: 'per hour while running',
      diskPerMonth: 'disk per month (billed even when off)',
      calculating: 'Calculating…',
      unavailable: 'Pricing data is unavailable right now. This does not prevent you creating the server.',
      incomplete: 'Some components had no published price, so this estimate is incomplete.',
      disclaimer:
        'This is a rough estimate, useful for comparing configurations. Your actual cost is whatever Google bills you, and CraftLift takes no responsibility for the accuracy of this figure. It excludes network egress, discounts and free credits.'
    },
    version: 'Minecraft version',
    flavor: 'Server type',
    vanilla: 'Vanilla',
    modded: 'Modded',
    loaders: {
      fabric: { name: 'Fabric', desc: 'Light, updates fastest' },
      neoforge: { name: 'NeoForge', desc: 'The mainstream since 1.20.2' },
      forge: { name: 'Forge', desc: 'Most older mods' }
    },
    loaderNeeds: 'Needs Minecraft {{version}} or newer',
    loaderTooOld:
      '{{loader}} has no build for Minecraft {{version}}. Pick another loader, or choose a newer Minecraft version above.',
    loaderVersion: 'Loader version',
    loaderVersionHint:
      'Use the recommended one unless you know otherwise. Older builds are usually for a mod that only supports that version.',
    loaderRecommended: 'Recommended (latest stable)',
    loaderBeta: 'beta',
    loaderLoading: 'Loading versions…',
    loaderUnavailable: 'Could not load the version list; the recommended build will be used.',
    moddedNote:
      'Your players need the same loader and the same mods installed, or they cannot connect.',
    moddedMemory: 'Mods are memory hungry — {{gb}} GB or more is recommended.',
    showAdvanced: 'Show advanced settings',
    hideAdvanced: 'Hide advanced settings',
    zone: 'Data centre',
    zoneHint: 'The closer the data centre is to your players, the lower the latency.',
    disk: 'Disk space (GB)',
    floatingIp: 'Use a floating IP (not recommended)',
    floatingIpHint:
      'A floating IP costs nothing extra, but the server address changes every time the machine restarts, and you have to send the new address to all your friends. The default fixed address consumes a small amount of your credit.',
    disclaimer:
      'I understand that running a server consumes my Google Cloud credit, and that the usage and the bill are mine.',
    disclaimerNote:
      'A trial account is never charged — resources stop when the credit runs out, unless you upgrade to a paid account yourself. Google’s policy may change; their terms govern.',
    submit: 'Create server',
    tiers: {
      small: { name: 'Small', players: '2–4 players' },
      standard: { name: 'Standard', players: '5–10 players' },
      large: { name: 'Large', players: '10–20 players' }
    },
    zones: {
      'asia-east1': 'Taiwan',
      'asia-northeast1': 'Tokyo',
      'asia-southeast1': 'Singapore',
      'us-central1': 'US Central',
      'europe-west1': 'Belgium'
    }
  },
  detail: {
    confirmDelete:
      'Delete “{{name}}”? This removes the machine, its disk and its fixed address. The world will be gone too. Consider saving a backup to your PC first.',
    shutdown: 'Shut down',
    boot: 'Start',
    delete: 'Delete server',
    version: 'Version',
    loader: 'Loader',
    machine: 'Machine',
    zone: 'Data centre',
    shutdownNote:
      'When you shut down, CraftLift first takes a backup and copies the world to your PC before stopping the machine.',
    needRunning: 'The machine is not running',
    needRunningHint: 'Press “Start” in the top right to use this tab.',
    tabs: {
      console: 'Console',
      properties: 'Server settings',
      players: 'Players',
      mods: 'Mods',
      files: 'Files',
      backups: 'Backups'
    }
  },
  mods: {
    /* 英文要分單複數，跟「檔案」分頁同一套寫法 */
    count_one: '{{count}} mod',
    count_other: '{{count}} mods',
    disabledCount_one: '{{count}} disabled',
    disabledCount_other: '{{count}} disabled',
    upload: 'Upload mods',
    onlyJar: 'Mods must be .jar files.',
    someSkipped_one: '{{count}} file was not a .jar and was skipped.',
    someSkipped_other: '{{count}} files were not .jar files and were skipped.',
    restartNote: 'Mods are only loaded when Minecraft starts.',
    needRestart: 'Mods changed — restart Minecraft for it to take effect.',
    restartNow: 'Restart',
    restarting: 'Restarting…',
    confirmRestart:
      'Minecraft will restart and be unreachable for about a minute. The world is unaffected.',
    confirmPlayers: '{{n}} players are online and will be kicked.',
    on: 'Enabled',
    off: 'Disabled',
    enable: 'Enable',
    disable: 'Disable',
    empty: 'No mods yet. Drag .jar files in from your PC to upload them.',
    badExtension: '(extension is not lowercase .jar — Fabric will not load it)',
    detailsFileName: 'File name',
    columns: {
      name: 'Mod',
      modified: 'Modified',
      state: 'State',
      size: 'Size'
    },
    menu: {
      upload: 'Upload mods…'
    },
    busy: {
      /* 進度條旁邊的說明，後面會接一條進度條，所以不用刪節號 */
      upload: 'Uploading',
      download: 'Downloading',
      delete: 'Deleting…',
      enable: 'Enabling…',
      disable: 'Disabling…',
      checking: 'Checking…'
    },
    confirmDeleteTitle: 'Delete mods',
    confirmDelete_one: 'Delete this mod?',
    confirmDelete_other: 'Delete these {{count}} mods?',
    confirmDeleteNote:
      'You would have to download them again. To turn one off temporarily, use Disable instead.'
  },
  console: {
    machineOff: 'The machine is not running',
    machineOffHint: 'Press “Start” in the top right. It takes a minute or two.',
    running: 'Server running',
    starting: 'Minecraft is starting…',
    who: 'In here now',
    nobody: 'Nobody right now',
    players: '{{count}} / {{max}} players online',
    restart: 'Restart',
    restarting: 'Restarting…',
    stopMc: 'Stop Minecraft',
    stopping: 'Stopping…',
    startMc: 'Start Minecraft',
    confirmKick: '{{n}} player(s) online will be disconnected. Continue?',
    powerNote: 'This controls Minecraft only. The machine keeps running, and billing.',
    noLog: '(no log output yet)',
    commandPlaceholder: 'Type a command, e.g. time set day',
    send: 'Send'
  },
  files: {
    notEditable: 'This is not a text file, so it cannot be opened in the built-in editor. Download it instead.',
    root: 'Server',
    back: 'Back',
    forward: 'Forward',
    up: 'Up',
    upload: 'Upload file',
    newFolderName: 'New folder',
    revealSaved: 'Show in folder',
    folder: 'Folder',
    plainFile: 'File',
    empty: 'This folder is empty. Drag files here from your computer to upload them.',
    itemCount_one: '{{count}} item',
    itemCount_other: '{{count}} items',
    selectedCount_one: '{{count}} selected',
    selectedCount_other: '{{count}} selected',
    andMore_one: '…and {{count}} more',
    andMore_other: '…and {{count}} more',
    columns: {
      name: 'Name',
      modified: 'Date modified',
      type: 'Type',
      size: 'Size'
    },
    menu: {
      open: 'Open',
      download: 'Download',
      cut: 'Cut',
      copy: 'Copy',
      paste: 'Paste',
      rename: 'Rename',
      delete: 'Delete',
      details: 'Properties',
      newFolder: 'New folder',
      uploadFile: 'Upload files…',
      uploadFolder: 'Upload folder…',
      selectAll: 'Select all',
      refresh: 'Refresh'
    },
    busy: {
      open: 'Opening…',
      /* 這兩個後面會接一條進度條，所以不用刪節號 */
      upload: 'Uploading',
      download: 'Downloading',
      delete: 'Deleting…',
      rename: 'Renaming…',
      mkdir: 'Creating folder…',
      paste: 'Copying…',
      move: 'Moving…'
    },
    confirmDeleteTitle: 'Delete',
    confirmDelete_one: 'Delete this item?',
    confirmDelete_other: 'Delete these {{count}} items?',
    noRecycleBin: 'No recycle bin — deleted is gone. Folders go with their contents.',
    conflictTitle: 'Name already in use',
    conflictBody_one: 'This location already has an item with the same name:',
    conflictBody_other: 'This location already has {{count}} items with the same names:',
    conflictReplace: 'Replace',
    conflictKeep: 'Keep both',
    conflictSkip: 'Skip',
    detailsTitle: 'Properties',
    detailsPath: 'Location',
    jarHint:
      'Advanced: you can upload your own server jar (Paper, Fabric, …) named server.jar to replace Vanilla. This is unsupported — if it breaks, restoring it is up to you.',
    restartHint: 'Restart Minecraft for changes to take effect.'
  },
  props: {
    restartNote: 'Saving restarts Minecraft so changes take effect. You will be asked first.',
    saved: 'Saved',
    checking: 'Checking…',
    restarting: 'Restarting…',
    confirmTitle: 'Save and restart',
    confirmTitleStopped: 'Save settings',
    confirmRunning:
      'Minecraft restarts after saving. Unreachable for up to a minute. Your world is not affected.',
    confirmPlayers: '{{n}} player(s) online will be disconnected.',
    confirmStopped: 'Minecraft is not running. Settings are saved and apply on next start.',
    saveAndRestart: 'Save and restart',
    values: {
      peaceful: 'Peaceful',
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard',
      survival: 'Survival',
      creative: 'Creative',
      adventure: 'Adventure',
      spectator: 'Spectator'
    },
    fields: {
      motd: { label: 'Server message', hint: 'The line players see in their server list.' },
      'max-players': { label: 'Player limit', hint: 'How many people can be online at once.' },
      difficulty: { label: 'Difficulty', hint: 'Affects mob strength and hunger drain.' },
      gamemode: { label: 'Default game mode', hint: 'Mode new players join in.' },
      pvp: { label: 'Allow player combat', hint: 'Turn off so players cannot hurt each other.' },
      hardcore: { label: 'Hardcore', hint: 'Death turns the player into a spectator permanently.' },
      'white-list': {
        label: 'Enable whitelist',
        hint: 'Only listed players can join. Keeps strangers out.'
      },
      'online-mode': {
        label: 'Verify accounts with Mojang',
        hint: 'Only genuine Minecraft accounts can connect. Turning this off is a security risk and allows impersonation.'
      },
      'allow-nether': { label: 'Allow the Nether', hint: 'Turn off to block Nether portals.' },
      'allow-flight': {
        label: 'Allow flight',
        hint: 'Turning it off kicks flying players, but can also false-positive with some mods.'
      },
      'spawn-monsters': { label: 'Spawn monsters', hint: 'Turn off for no zombies, creepers, etc.' },
      'view-distance': {
        label: 'View distance',
        hint: 'How far players can see. Higher costs more CPU — lower it when many people play.'
      },
      'simulation-distance': {
        label: 'Simulation distance',
        hint: 'How far away blocks keep ticking (crops, redstone…).'
      },
      'spawn-protection': {
        label: 'Spawn protection radius',
        hint: 'Non-operators cannot build within this radius of spawn. 0 disables it.'
      },
      'level-seed': {
        label: 'World seed',
        hint: 'Leave blank for random. Only applies when the world is first generated.'
      }
    }
  },
  players: {
    lockedTitle: 'Nobody can join this server right now',
    lockedBody:
      'The whitelist is enabled but empty — nobody can connect, including you. Enter your Minecraft username in the Whitelist field below and add it. If you would rather let anyone join (not recommended — public servers get scanned by strangers within minutes), you can turn the whitelist off under Server settings.',
    note: 'Changes here take effect immediately via server commands — no restart needed.',
    namePlaceholder: 'Minecraft username',
    emptyList: '(empty)',
    whitelist: {
      title: 'Whitelist',
      desc: 'When the whitelist is enabled in Server settings, only these players can join.',
      add: 'Add to whitelist'
    },
    ops: {
      title: 'Operators',
      desc: 'Operators can run admin commands in-game, such as changing game mode or giving items. Grant carefully.',
      add: 'Make operator'
    },
    banned: { title: 'Banned', desc: 'Banned players cannot connect.', add: 'Ban player' }
  },
  backups: {
    warningTitle: 'These backups live on the cloud machine — they are not a safety net',
    warningBody:
      'If your credit runs out or the 90 days expire, Google deletes the whole machine including these backups. The only thing that really saves your world is pressing “Save to PC”. CraftLift does this automatically when you shut the server down.',
    keepNote: 'The newest {{count}} are kept automatically; older ones are deleted to save space.',
    createNow: 'Back up now',
    working: 'Working…',
    interval: 'Automatic backup interval (hours)',
    intervalHint:
      'The server backs itself up on this schedule, asking Minecraft to flush data to disk first.',
    empty: '(no backups yet)',
    saveToPc: 'Save to PC',
    groups: {
      world: {
        title: 'World',
        desc: 'Your save. Backed up automatically on the interval above.'
      },
      setup: {
        title: 'Server setup',
        desc: 'Mods, server settings, whitelist and operators. A new copy only appears when something actually changed.'
      }
    }
  },
  update: {
    title: 'Software update',
    current: 'Current version',
    safeNote:
      'Updating only replaces the app itself. Your settings, local backups, and the servers running in the cloud are untouched.',
    check: 'Check for updates',
    checking: 'Checking…',
    latest: 'You are on the latest version.',
    unsupported: 'Updates are not checked in development mode.',
    available: 'Version {{version}} is available',
    download: 'Download update',
    downloading: 'Downloading',
    ready: '{{version}} is downloaded — restart to apply',
    install: 'Restart and install',
    later: 'Later'
  },
  settings: {
    general: 'General',
    theme: 'Appearance',
    themes: { system: 'Match system', light: 'Light', dark: 'Dark' },
    scale: 'Interface size',
    scaleAuto: 'Match window size',
    scaleHint: 'Scales the whole interface — text, spacing and icons. With “Match window size”, everything grows as you enlarge the window. Takes effect immediately.',
    language: 'Language',
    launchAtLogin: 'Start CraftLift when I log in',
    launchAtLoginHint:
      'Waits in the tray at login. Unrelated to the cloud server, which runs regardless.',
    backupOnShutdown: 'Copy the world to my PC before shutting down',
    backupDir: 'Local backup folder',
    defaultDir: '(default: Documents\\CraftLift Backups)',
    choose: 'Choose folder',
    project: 'Current project',
    feedback: {
      title: 'Send feedback',
      desc: 'Tell me about problems or ideas. What you were doing, what you expected, and what actually happened is the most useful thing you can write.',
      open: 'Write feedback',
      subject: 'Subject',
      subjectPlaceholder: 'One line describing the problem',
      name: 'Your name (optional)',
      nameHint: 'So I know what to call you in a reply. Leave it blank if you prefer.',
      body: 'Details',
      bodyPlaceholder: 'What you were doing, what you expected, what actually happened',
      privateNote:
        'Only the developer sees this; it is not public. Your version and operating system are attached automatically. Do not include passwords or card details.',
      sending: 'Sending',
      sent: 'Sent — thank you',
      failed: 'Could not send. Your network may be down, or the form may be temporarily unavailable.',
      openInBrowser: 'Send via browser instead',
      send: 'Send feedback'
    },
    billing: {
      title: 'Cost and credit',
      note: 'CraftLift cannot read your remaining trial credit — Google provides no API for it. Check the real figure on the official page.',
      open: 'View my remaining credit'
    },
    account: {
      title: 'Google account',
      current: 'Signed in as',
      none: '(not signed in)',
      signOut: 'Sign out',
      working: 'Signing out…',
      note: 'Only revokes the credentials on this PC. Servers and worlds stay in the cloud.',
      confirm:
        'Sign out? You will return to setup and need to sign in again. Nothing in the cloud is deleted.'
    },
    danger: {
      title: 'Delete everything',
      desc: 'Deletes the entire Google Cloud project CraftLift created, including every server, disk, fixed address and firewall rule. This is the only way to guarantee no charges can appear later. Your worlds go with it — make sure you have saved any backups you care about to your PC.',
      button: 'Delete all cloud resources',
      working: 'Deleting…',
      confirm1:
        'This deletes every server and world, and CraftLift cannot undo it. Have you saved the backups you want to keep to your PC?',
      confirm2: 'Final confirmation: about to delete the entire project {{projectId}}. Continue?'
    }
  }
}
