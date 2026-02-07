'use client'

import React from 'react'
import { Truck, User, Bell, LogOut } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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

export default function Header({ userName, userRole, companyName, onLogout }: HeaderProps) {
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
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
          </Button>

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
