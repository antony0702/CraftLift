export default {
  app: {
    name: 'CraftLift',
    tagline: 'Host your own Minecraft server on Google Cloud'
  },
  setup: {
    checking: 'Checking your environment…',
    steps: {
      environment: 'Environment',
      account: 'Sign in',
      server: 'Create server'
    },
    gcloudMissing: {
      title: 'Google Cloud CLI is required',
      desc: 'CraftLift drives your cloud account through Google’s official command-line tool. This way the sign-in flow never shows an “unverified app” warning, and there is no cap on how many people can use CraftLift.',
      how: 'Open Terminal or PowerShell, paste the command below and press Enter:',
      afterInstall: 'Once it finishes, restart CraftLift so it can pick up the newly installed tool.',
      download: 'Or visit the official download page',
      recheck: 'I’ve installed it — check again'
    },
    gcloudReady: {
      title: 'Environment ready',
      version: 'Version {{version}}'
    },
    login: {
      title: 'Sign in with Google',
      desc: 'Your browser will open so you can sign in with the Google account you want to host the server under. CraftLift never sees your password or card details — those stay on Google’s own site.',
      button: 'Sign in with Google',
      waiting: 'Waiting for you to finish signing in…',
      waitingHint:
        'This screen continues automatically once you approve. If you closed the browser by accident, just press sign in again.'
    },
    loggedIn: {
      title: 'Signed in',
      next: 'Next: create a server',
      comingSoon: '(Server creation is still under construction)'
    }
  },
  common: {
    error: 'Something went wrong',
    retry: 'Retry',
    copied: 'Copied'
  }
}
