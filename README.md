# Insight

Insight is the web portal for Answer United customers to access their messages and call recordings.

- **Version:** 2.0.0
- **Company:** Answer United, Inc.
- **License:** Proprietary — see [LICENSE](./LICENSE)

## Tech Stack

- [Nuxt 4](https://nuxt.com)
- [Nuxt UI](https://ui.nuxt.com) with [Tailwind CSS](https://tailwindcss.com)
- TypeScript
- ESLint
- pnpm

## Setup

Install the dependencies:

```bash
pnpm install
```

## Development

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Quality Checks

```bash
pnpm lint       # Run ESLint
pnpm typecheck  # Run vue-tsc type checking
```

These also run in CI on every push (see `.github/workflows/ci.yml`).

## Production

Build the application for production:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

See the [Nuxt deployment documentation](https://nuxt.com/docs/getting-started/deployment) for hosting options.

## Dependency Updates

Dependency updates are managed by [Renovate](https://docs.renovatebot.com) (configured in `renovate.json`).

---

© Answer United, Inc. All rights reserved.
