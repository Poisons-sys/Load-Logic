'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type MeResponse = {
  success: boolean
  data: {
    user: {
      id: string
      name: string | null
      email: string
      role: string
      companyId: string
      isActive: boolean
    }
    company?: { id: string; name: string }
  }
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [companyName, setCompanyName] = useState<string>('')

  const canSave = useMemo(() => !saving && name.trim().length > 0 && email.trim().length > 3, [saving, name, email])

  async function loadMe() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'No se pudo cargar el perfil')
      }
      const json = (await res.json()) as MeResponse
      setName(json.data.user.name ?? '')
      setEmail(json.data.user.email ?? '')
      setRole(json.data.user.role ?? '')
      setCompanyName(json.data.company?.name ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando perfil')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMe()
  }, [])

  async function onSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || 'No se pudo guardar')

      setSuccess(body?.message || 'Perfil actualizado')
      await loadMe()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error guardando perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-sm text-gray-600">Administra tu información de cuenta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mi Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-600">Cargando…</p>
          ) : (
            <>
              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : null}
              {success ? (
                <div className="text-sm text-green-600">{success}</div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@dominio.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Input value={role} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Input value={companyName} disabled />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={onSave} disabled={!canSave}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
                <Button variant="outline" onClick={loadMe} disabled={saving}>
                  Recargar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
