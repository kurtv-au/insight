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

  runtimeConfig: {
    databaseUrl: '',
    email: {
      from: 'Insight <no-reply@answerunited.com>',
      // 'ses' sends through AWS SES; 'console' logs emails instead (local development)
      transport: 'ses'
    },
    aws: {
      region: 'us-east-1'
    },
    support: {
      // Where the /support form is delivered
      email: ''
    },
    public: {
      appName: 'Insight',
      appUrl: 'http://localhost:3000'
    }
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
  },

  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: ['100 900'] },
      { name: 'Bricolage Grotesque', provider: 'google', weights: ['200 800'] },
      { name: 'Spline Sans Mono', provider: 'google', weights: ['300 700'] },
      { name: 'Geist Mono', provider: 'google', weights: ['100 900'] },
      { name: 'Instrument Sans', provider: 'google', weights: ['400 700'] }
    ]
  }
})
