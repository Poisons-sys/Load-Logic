'use client'

import React, { useMemo, useState } from 'react'
import { Truck, User, Bell, LogOut, AlertTriangle, Info, CheckCircle2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  userName: string
  userRole: string
  companyName: string
  onLogout: () => void
}

type HeaderAlert = {
  id: string
  message: string
  type: 'warning' | 'success' | 'info'
  vehicle?: string
  isRead?: boolean
}

export default function Header({ userName, userRole, companyName, onLogout }: HeaderProps) {
  const [alerts, setAlerts] = useState<HeaderAlert[]>([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  const unreadCount = useMemo(
    () => alerts.filter((a) => !a.isRead).length,
    [alerts]
  )

  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true)
      setAlertsError(null)
      const res = await fetch('/api/alerts', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudieron cargar las alertas')
      }
      const json = await res.json()
      setAlerts(Array.isArray(json?.data) ? json.data : [])
    } catch (e: any) {
      setAlertsError(e?.message ?? 'Error cargando alertas')
    } finally {
      setLoadingAlerts(false)
    }
  }

  const markAllAsRead = async () => {
    const unreadIds = alerts.filter((a) => !a.isRead).map((a) => a.id)
    if (unreadIds.length === 0) return
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ alertIds: unreadIds }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudieron marcar alertas')
      }
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
    } catch (e: any) {
      setAlertsError(e?.message ?? 'Error marcando alertas')
    }
  }

  const alertIcon = (type: HeaderAlert['type']) => {
    if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />
    if (type === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    return <Info className="h-4 w-4 text-blue-600" />
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo y nombre */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Load Logic</h1>
            <p className="text-xs text-gray-500">Optimización de Estiba</p>
          </div>
        </div>

        {/* Información de la empresa */}
        <div className="hidden md:flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">{companyName}</span>
        </div>

        {/* Acciones del usuario */}
        <div className="flex items-center gap-3">
          <DropdownMenu onOpenChange={(open) => {
            if (open) {
              void fetchAlerts()
            }
          }}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] leading-4 text-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[340px]">
              <DropdownMenuLabel className="flex items-center justify-between gap-2">
                <span>Notificaciones</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void fetchAlerts()}
                    title="Actualizar"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                    Marcar leídas
                  </Button>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {loadingAlerts && (
                <div className="px-3 py-4 text-sm text-gray-500">Cargando alertas...</div>
              )}
              {alertsError && (
                <div className="px-3 py-4 text-sm text-red-600">{alertsError}</div>
              )}
              {!loadingAlerts && !alertsError && alerts.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500">Sin alertas pendientes.</div>
              )}
              {!loadingAlerts && !alertsError && alerts.length > 0 && (
                <div className="max-h-80 overflow-y-auto">
                  {alerts.map((alert) => {
                    const isUnread = !alert.isRead
                    return (
                      <div
                        key={alert.id}
                        className={`px-3 py-3 border-b last:border-b-0 ${isUnread ? 'bg-blue-50/40' : 'bg-white'}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{alertIcon(alert.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">{alert.message}</p>
                            {alert.vehicle && (
                              <p className="text-xs text-gray-500 mt-1">{alert.vehicle}</p>
                            )}
                          </div>
                          {isUnread && <Badge variant="outline">Nueva</Badge>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <div className="bg-gray-100 p-1.5 rounded-full">
                  <User className="h-4 w-4" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Radix/shadcn: usa asChild para que el item sea realmente un link navegable */}
              <DropdownMenuItem asChild>
                <Link href="/profile">Perfil</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">Configuración</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
