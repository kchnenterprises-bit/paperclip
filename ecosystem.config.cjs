module.exports = {
  apps: [{
    name: 'paperclip',
    cwd: '/Users/andrewmcculloch/paperclip-fork',
    script: 'pnpm',
    args: 'dev',
    env: {
      PAPERCLIP_DEPLOYMENT_MODE: 'authenticated',
      HOST: '0.0.0.0',
      BETTER_AUTH_BASE_URL: 'https://andrews-mac-mini.tail953c05.ts.net'
    }
  }]
}
