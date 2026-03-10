'use client'

import React, { useEffect, useState } from 'react'
import { Save, Building2, Bell, Shield, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

type NotificationSettings = {
  emailAlerts: boolean
  loadCompleted: boolean
  nomExpiration: boolean
  weightAlerts: boolean
  weeklyReports: boolean
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailAlerts: false,
  loadCompleted: false,
  nomExpiration: false,
  weightAlerts: false,
  weeklyReports: false,
}

export default function SettingsPage() {
  const [companySettings, setCompanySettings] = useState({
    name: '',
    rfc: '',
    address: '',
    phone: '',
    email: '',
  })

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS
  )

  const [saving, setSaving] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [notificationsFeedback, setNotificationsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [companyRes, meRes] = await Promise.all([
          fetch('/api/companies', { cache: 'no-store' }),
          fetch('/api/auth/me', { cache: 'no-store', credentials: 'include' }),
        ])

        if (!companyRes.ok) return
        const companyJson = await companyRes.json()
        const c = companyJson?.data
        if (!c) return
        setCompanySettings({
          name: c.name || '',
          rfc: c.rfc || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        })

        if (meRes.ok) {
          const meJson = await meRes.json()
          const ns = meJson?.data?.user?.notificationSettings
          if (ns && typeof ns === 'object') {
            setNotificationSettings({
              emailAlerts: Boolean(ns.emailAlerts),
              loadCompleted: Boolean(ns.loadCompleted),
              nomExpiration: Boolean(ns.nomExpiration),
              weightAlerts: Boolean(ns.weightAlerts),
              weeklyReports: Boolean(ns.weeklyReports),
            })
          }
        }
      } catch {
        // ignore
      }
    })()
  }, [])

  const saveCompany = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companySettings.name,
          address: companySettings.address,
          phone: companySettings.phone,
          email: companySettings.email,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        alert(json?.error || 'No se pudo guardar')
        return
      }
      alert('Cambios guardados')
    } finally {
      setSaving(false)
    }
  }

  const saveNotificationSettings = async () => {
    try {
      setSavingNotifications(true)
      setNotificationsFeedback(null)
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notificationSettings }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'No se pudieron guardar las preferencias.')
      }
      setNotificationsFeedback({ type: 'success', message: 'Preferencias de notificaciones guardadas.' })
    } catch (e: any) {
      setNotificationsFeedback({ type: 'error', message: e?.message || 'No se pudieron guardar las preferencias.' })
    } finally {
      setSavingNotifications(false)
    }
  }

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      setPasswordFeedback({ type: 'error', message: 'Completa contrasena actual y nueva contrasena.' })
      return
    }

    try {
      setChangingPassword(true)
      setPasswordFeedback(null)
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setPasswordFeedback({ type: 'error', message: json?.error || 'No se pudo cambiar la contrasena' })
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setPasswordFeedback({ type: 'success', message: 'Contrasena actualizada correctamente.' })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuracion</h1>
        <p className="text-gray-500">Administre la configuracion del sistema</p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">Empresa</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="security">Seguridad</TabsTrigger>
          <TabsTrigger value="compliance">Normativas</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informacion de la Empresa
              </CardTitle>
              <CardDescription>Datos generales de la empresa registrada</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nombre de la Empresa</Label>
                  <Input
                    id="companyName"
                    value={companySettings.name}
                    onChange={(e) => setCompanySettings({ ...companySettings, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rfc">RFC</Label>
                  <Input
                    id="rfc"
                    value={companySettings.rfc}
                    disabled
                    onChange={(e) => setCompanySettings({ ...companySettings, rfc: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Direccion</Label>
                  <Input
                    id="address"
                    value={companySettings.address}
                    onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefono</Label>
                  <Input
                    id="phone"
                    value={companySettings.phone}
                    onChange={(e) => setCompanySettings({ ...companySettings, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electronico</Label>
                  <Input
                    id="email"
                    type="email"
                    value={companySettings.email}
                    onChange={(e) => setCompanySettings({ ...companySettings, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={saveCompany} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Configuracion de Notificaciones
              </CardTitle>
              <CardDescription>
                Define que alertas desea recibir para la operacion de carga.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    id: 'email-alerts',
                    key: 'emailAlerts' as const,
                    label: 'Alertas por correo electronico',
                    description: 'Recibir alertas importantes por email',
                  },
                  {
                    id: 'load-completed',
                    key: 'loadCompleted' as const,
                    label: 'Carga completada',
                    description: 'Notificacion cuando se complete un plan de carga',
                  },
                  {
                    id: 'nom-expiration',
                    key: 'nomExpiration' as const,
                    label: 'Vencimiento de certificaciones NOM',
                    description: 'Alertas antes del vencimiento de certificaciones',
                  },
                  {
                    id: 'weight-alerts',
                    key: 'weightAlerts' as const,
                    label: 'Alertas de peso',
                    description: 'Notificacion cuando se excedan los limites de peso',
                  },
                  {
                    id: 'weekly-reports',
                    key: 'weeklyReports' as const,
                    label: 'Reportes semanales',
                    description: 'Recibir reportes automaticos cada semana',
                  },
                ].map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <input
                      type="checkbox"
                      id={item.id}
                      className="mt-1 rounded"
                      checked={notificationSettings[item.key]}
                      onChange={() =>
                        setNotificationSettings((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                    />
                    <div>
                      <Label htmlFor={item.id} className="font-medium">{item.label}</Label>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {notificationsFeedback && (
                <p className={`mt-4 text-sm ${notificationsFeedback.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {notificationsFeedback.message}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <Button onClick={saveNotificationSettings} disabled={savingNotifications}>
                  <Save className="h-4 w-4 mr-2" />
                  {savingNotifications ? 'Guardando...' : 'Guardar Notificaciones'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Seguridad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Cambiar Contrasena</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Contrasena Actual</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={changingPassword}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nueva Contrasena</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={changingPassword}
                      />
                    </div>
                  </div>
                  {passwordFeedback && (
                    <p className={`mt-3 text-sm ${passwordFeedback.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {passwordFeedback.message}
                    </p>
                  )}
                  <Button className="mt-4" variant="outline" onClick={changePassword} disabled={changingPassword}>
                    {changingPassword ? 'Actualizando...' : 'Cambiar Contrasena'}
                  </Button>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Autenticacion de Dos Factores</h4>
                  <p className="text-sm text-gray-500 mb-4">
                    Anada una capa adicional de seguridad a su cuenta
                  </p>
                  <Button variant="outline">Configurar 2FA</Button>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Sesiones Activas</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <p className="font-medium">Navegador Chrome - Windows</p>
                        <p className="text-sm text-gray-500">Ultima actividad: Hace 5 minutos</p>
                      </div>
                      <Badge>Sesion Actual</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Cumplimiento Normativo
              </CardTitle>
              <CardDescription>
                Configuracion de normativas y regulaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-3">Normas Mexicanas (NOM)</h4>
                  <div className="space-y-3">
                    {[
                      { code: 'NOM-002-SCT/2023', name: 'Materiales Peligrosos', enabled: true },
                      { code: 'NOM-012-SCT-2-2017', name: 'Peso y Dimensiones', enabled: true },
                      { code: 'NOM-015-SCT-2-2022', name: 'Estiba y Sujecion', enabled: true },
                      { code: 'NOM-068-SCT-2-2014', name: 'Condiciones Fisico-Mecanicas', enabled: true },
                      { code: 'NOM-120-SSA1-1994', name: 'Practicas de Higiene (Alimentos)', enabled: true },
                      { code: 'NOM-194-SSA1-2004', name: 'Transporte Refrigerado', enabled: true },
                    ].map((nom) => (
                      <div key={nom.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{nom.code}</p>
                          <p className="text-sm text-gray-500">{nom.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={nom.enabled ? 'default' : 'destructive'}>
                            {nom.enabled ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <input type="checkbox" className="rounded" defaultChecked={nom.enabled} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Regulaciones de Estados Unidos</h4>
                  <div className="space-y-3">
                    {[
                      { code: '49 CFR', name: 'Hazardous Materials Regulations', enabled: true },
                      { code: 'FMCSR', name: 'Federal Motor Carrier Safety Regulations', enabled: true },
                      { code: 'FSMA', name: 'Food Safety Modernization Act', enabled: true },
                      { code: 'DOT', name: 'Department of Transportation', enabled: true },
                    ].map((reg) => (
                      <div key={reg.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{reg.code}</p>
                          <p className="text-sm text-gray-500">{reg.name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={reg.enabled ? 'default' : 'destructive'}>
                            {reg.enabled ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <input type="checkbox" className="rounded" defaultChecked={reg.enabled} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
