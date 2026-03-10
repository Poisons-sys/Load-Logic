'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'

type MeResponse = {
  success: boolean
  data?: {
    user: { name: string; role: string }
    company?: { name: string }
  }
}

const PUBLIC_ROUTES = new Set(['/login'])

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()

  const isPublic = useMemo(() => {
    if (!pathname) return false
    return PUBLIC_ROUTES.has(pathname)
  }, [pathname])

  const [companyName, setCompanyName] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('ll.sidebarCollapsed')
    if (saved === '1') setSidebarCollapsed(true)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ll.sidebarCollapsed', next ? '1' : '0')
      }
      return next
    })
  }

  useEffect(() => {
    // Si es ruta pública, no forzamos sesión
    if (isPublic) return

    // En rutas privadas, si no hay sesión, mandamos a login
    if (status === 'unauthenticated') {
      const cb = pathname ? `?callbackUrl=${encodeURIComponent(pathname)}` : ''
      router.push(`/login${cb}`)
      return
    }

    // Cargar companyName desde /api/auth/me cuando ya hay sesión
    if (status === 'authenticated') {
      ;(async () => {
        try {
          const res = await fetch('/api/auth/me', { cache: 'no-store' })
          if (!res.ok) return
          const json = (await res.json()) as MeResponse
          const name = json?.data?.company?.name
          if (name) setCompanyName(name)
        } catch {
          // ignore
        }
      })()
    }
  }, [isPublic, pathname, router, status])

  if (isPublic) return <>{children}</>

  // Mientras se resuelve la sesión en el cliente
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Cargando…</p>
      </div>
    )
  }

  const userName = session?.user?.name || session?.user?.email || 'Usuario'
  const userRole = (session?.user as any)?.role || 'operativo'

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        userName={userName}
        userRole={userRole}
        companyName={companyName || '—'}
        onLogout={() => signOut({ callbackUrl: '/login' })}
      />
      <div className="flex flex-1">
        <Sidebar
          userRole={userRole}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
