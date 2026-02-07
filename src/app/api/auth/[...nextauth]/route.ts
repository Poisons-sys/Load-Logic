import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email y contraseña son requeridos')
        }

        try {
          // Buscar usuario en BD
          const user = await db.query.users.findFirst({
            where: eq(users.email, credentials.email.toLowerCase()),
            with: {
              company: true,
            },
          })

          if (!user) {
            throw new Error('Credenciales inválidas')
          }

          // Verificar si usuario está activo
          if (!user.isActive) {
            throw new Error('Usuario desactivado')
          }

          // Verificar contraseña
          const isValidPassword = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isValidPassword) {
            throw new Error('Credenciales inválidas')
          }

          // Actualizar último login
          await db.update(users)
            .set({ lastLogin: new Date() })
            .where(eq(users.id, user.id))

          // Retornar usuario sin contraseña
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || 'operativo',
            companyId: user.companyId || '',
            isActive: user.isActive,
          }
        } catch (error) {
          console.error('Error en authorize:', error)
          throw error
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.companyId = user.companyId
        token.isActive = user.isActive
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.companyId = token.companyId as string
        session.user.isActive = token.isActive as boolean
      }
      return session
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 horas
  },
  jwt: {
    maxAge: 24 * 60 * 60, // 24 horas
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
