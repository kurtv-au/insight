declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    isPlatformAdmin: boolean
    /** Personal timezone; null follows the account's */
    timezone: string | null
  }

  interface SecureSessionData {
    sessionVersion: number
  }
}

export {}
