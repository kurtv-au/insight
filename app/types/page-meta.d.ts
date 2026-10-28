declare module '#app' {
  interface PageMeta {
    /**
     * `false`: page is public.
     * `'guest'`: page is public, and signed-in users are sent home (e.g. the login page).
     * Omitted: sign-in is required.
     */
    auth?: false | 'guest'
  }
}

export {}
