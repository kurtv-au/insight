// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    'nuxt-auth-utils'
  ],

  devtools: {
    enabled: true
  },

  app: {
    head: {
      // favicon.ico is a single 192px PNG; the touch icon is the same mark flattened onto white
      link: [
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  // Fonts are self-hosted (public/fonts, @font-face in main.css): @nuxt/fonts
  // would download them from Google at build time, and releases build offline
  ui: {
    fonts: false
  },

  runtimeConfig: {
    // nuxt-auth-utils' sealed cookie session (sealed with NUXT_APP_SECRET). A
    // sign-in lasts 30 days: the cookie and sealed data expire 30 days after
    // each write, and requireUser() also refuses a session whose sign-in
    // (loggedInAt) is older, so a copied cookie can't keep itself alive.
    session: {
      maxAge: 60 * 60 * 24 * 30
    },
    databaseUrl: '',
    email: {
      from: 'Insight <no-reply@answerunited.com>',
      // 'ses' sends through AWS SES; 'console' logs emails instead (local development)
      transport: 'ses'
    },
    aws: {
      region: 'us-east-1'
    },
    // Email domains platform admins must be at (comma-separated). Checked when
    // someone is made one; see shared/utils/platformAdmins.ts
    platformAdminDomains: 'answerunited.com',
    support: {
      // Where the /support form is delivered
      email: ''
    },
    // The recordings API (au-api /v1). Without a key, development uses mock recordings.
    auApi: {
      url: 'https://api.answerunited.net',
      key: ''
    },
    public: {
      appName: 'Insight',
      appUrl: 'http://localhost:3000',
      // The release (deploy/: PM2 sets NUXT_PUBLIC_APP_VERSION), shown by /api/health
      appVersion: 'dev'
    }
  },

  routeRules: {
    // The old Insight's sign-in page, for a redirect that keeps the path
    '/login.html': { redirect: { to: '/login?from=v1', statusCode: 301 } }
  },

  compatibilityDate: '2026-06-30',

  auth: {
    webAuthn: true
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
