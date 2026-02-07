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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  userRole: string
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
  { name: 'Análisis', href: '/analytics', icon: BarChart3, roles: ['admin', 'supervisor'] },
  { name: 'Usuarios', href: '/users', icon: Users, roles: ['admin'] },
  { name: 'Configuración', href: '/settings', icon: Settings, roles: ['admin'] },
]

export default function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname()

  const filteredNav = navigation.filter(item => item.roles.includes(userRole))

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-300">Menú - {userRole}</h2>
      </div>
      
      <nav className="flex-1 px-3 py-4 space-y-1">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-400">
          <p>Load Logic v1.0</p>
          <p className="mt-1">© Derechos Reservados. 2026 </p>
        </div>
      </div>
    </aside>
  )
}
