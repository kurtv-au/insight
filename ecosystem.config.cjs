/**
 * PM2, on the production instance. See docs/DEPLOYMENT.md.
 *
 * The instance runs a prebuilt release (scripts/build-release.sh); there is no
 * source, pnpm or build on it. `current` is a symlink to the active release,
 * swapped by deploy/activate.sh, and the env file lives outside the releases
 * so it survives every deploy. APP_ROOT is only overridden to rehearse a deploy
 * somewhere other than /opt/insight.
 */
const { readFileSync } = require('node:fs')

const APP_ROOT = process.env.APP_ROOT || '/opt/insight'

// Read when PM2 (re)starts the app, after activate.sh has switched `current`,
// so /api/health names the release this process is actually running.
function releaseVersion() {
  try {
    return readFileSync(`${APP_ROOT}/current/VERSION`, 'utf8').trim()
  } catch {
    return 'unknown'
  }
}

module.exports = {
  apps: [
    {
      name: 'insight',
      cwd: `${APP_ROOT}/current`,
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',

      // Node's own --env-file: no dotenv, nothing parses .env here. The heap cap
      // and the restart threshold keep the process well inside a t4g.small
      // (2 GB) and leave room for nginx, PM2 and the system.
      node_args: [`--env-file=${APP_ROOT}/shared/.env`, '--max-old-space-size=768'],
      max_memory_restart: '900M',
      kill_timeout: 10000,

      env: {
        NODE_ENV: 'production',
        // Only nginx (deploy/nginx/insight.conf) talks to Node; it is never exposed directly.
        HOST: '127.0.0.1',
        PORT: 3000,
        NUXT_PUBLIC_APP_VERSION: releaseVersion()
      }
    }
  ]
}

// One process, on purpose: the sign-in rate limits (server/utils/rateLimit.ts)
// live in this process's memory, so a second process would halve them.
