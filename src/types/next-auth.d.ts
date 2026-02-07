import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      companyId: string
      isActive: boolean
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: string
    companyId: string
    isActive: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    companyId: string
    isActive: boolean
  }
}
