'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Truck,
  Box,
  BarChart3,
  FileText,
  Settings,
  Users,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SidebarProps {
  userRole: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  roles: string[]
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'operativo', 'supervisor'] },
  { name: 'Productos', href: '/products', icon: Package, roles: ['admin', 'operativo', 'supervisor'] },
  { name: 'Unidades', href: '/vehicles', icon: Truck, roles: ['admin', 'operativo', 'supervisor'] },
  { name: 'Planes de Carga', href: '/load-plans', icon: Box, roles: ['admin', 'operativo', 'supervisor'] },
  { name: 'Nueva Estiba', href: '/optimize', icon: ClipboardList, roles: ['admin', 'operativo'] },
  { name: 'Reportes', href: '/reports', icon: FileText, roles: ['admin', 'supervisor'] },
  { name: 'Analisis', href: '/analytics', icon: BarChart3, roles: ['admin', 'supervisor'] },
  { name: 'Usuarios', href: '/users', icon: Users, roles: ['admin'] },
  { name: 'Configuracion', href: '/settings', icon: Settings, roles: ['admin'] },
]

export default function Sidebar({
  userRole,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()

  const filteredNav = navigation.filter((item) => item.roles.includes(userRole))

  return (
    <aside
      className={cn(
        'bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-200',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className={cn('p-3 border-b border-gray-800', collapsed ? 'px-2' : 'px-4')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && <h2 className="text-lg font-semibold text-gray-300">Menu - {userRole}</h2>}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="text-gray-300 hover:text-white hover:bg-gray-800"
            title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={cn('border-t border-gray-800', collapsed ? 'p-2' : 'p-4')}>
        <div className={cn('text-xs text-gray-400', collapsed && 'text-center')}>
          {!collapsed && <p>Load Logic v1.0</p>}
          <p className={cn(!collapsed && 'mt-1')}>© 2026</p>
        </div>
      </div>
    </aside>
  )
}
