'use client'

import React, { useEffect, useState } from 'react'
import { Save, Building2, Bell, Shield, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  const [companySettings, setCompanySettings] = useState({
    name: '',
    rfc: '',
    address: '',
    phone: '',
    email: '',
  })

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/companies', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const c = json?.data
        if (!c) return
        setCompanySettings({
          name: c.name || '',
          rfc: c.rfc || '',
          address: c.address || '',
          phone: c.phone || '',
          email: c.email || '',
        })
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">Administre la configuración del sistema</p>
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
                Información de la Empresa
              </CardTitle>
              <CardDescription>
                Datos generales de la empresa registrada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nombre de la Empresa</Label>
                  <Input 
                    id="companyName" 
                    value={companySettings.name}
                    onChange={(e) => setCompanySettings({...companySettings, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rfc">RFC</Label>
                  <Input 
                    id="rfc" 
                    value={companySettings.rfc}
                    disabled
                    onChange={(e) => setCompanySettings({...companySettings, rfc: e.target.value})}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input 
                    id="address" 
                    value={companySettings.address}
                    onChange={(e) => setCompanySettings({...companySettings, address: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input 
                    id="phone" 
                    value={companySettings.phone}
                    onChange={(e) => setCompanySettings({...companySettings, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input 
                    id="email" 
                    type="email"
                    value={companySettings.email}
                    onChange={(e) => setCompanySettings({...companySettings, email: e.target.value})}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={saveCompany} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Guardando…' : 'Guardar Cambios'}
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
                Configuración de Notificaciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { id: 'email-alerts', label: 'Alertas por correo electrónico', description: 'Recibir alertas importantes por email' },
                  { id: 'load-completed', label: 'Carga completada', description: 'Notificación cuando se complete un plan de carga' },
                  { id: 'nom-expiration', label: 'Vencimiento de certificaciones NOM', description: 'Alertas antes del vencimiento de certificaciones' },
                  { id: 'weight-alerts', label: 'Alertas de peso', description: 'Notificación cuando se excedan los límites de peso' },
                  { id: 'weekly-reports', label: 'Reportes semanales', description: 'Recibir reportes automáticos cada semana' },
                ].map((item) => (
                  <div key={item.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <input 
                      type="checkbox" 
                      id={item.id} 
                      className="mt-1 rounded"
                      defaultChecked={false}
                    />
                    <div>
                      <Label htmlFor={item.id} className="font-medium">{item.label}</Label>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                  </div>
                ))}
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
                  <h4 className="font-medium mb-2">Cambiar Contraseña</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Contraseña Actual</Label>
                      <Input id="currentPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nueva Contraseña</Label>
                      <Input id="newPassword" type="password" />
                    </div>
                  </div>
                  <Button className="mt-4" variant="outline">
                    Cambiar Contraseña
                  </Button>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Autenticación de Dos Factores</h4>
                  <p className="text-sm text-gray-500 mb-4">
                    Añada una capa adicional de seguridad a su cuenta
                  </p>
                  <Button variant="outline">Configurar 2FA</Button>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Sesiones Activas</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white rounded border">
                      <div>
                        <p className="font-medium">Navegador Chrome - Windows</p>
                        <p className="text-sm text-gray-500">Última actividad: Hace 5 minutos</p>
                      </div>
                      <Badge>Sesión Actual</Badge>
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
                Configuración de normativas y regulaciones
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
                      { code: 'NOM-015-SCT-2-2022', name: 'Estiba y Sujeción', enabled: true },
                      { code: 'NOM-068-SCT-2-2014', name: 'Condiciones Físico-Mecánicas', enabled: true },
                      { code: 'NOM-120-SSA1-1994', name: 'Prácticas de Higiene (Alimentos)', enabled: true },
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
                          <input 
                            type="checkbox" 
                            className="rounded"
                            defaultChecked={nom.enabled}
                          />
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
                          <input 
                            type="checkbox" 
                            className="rounded"
                            defaultChecked={reg.enabled}
                          />
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
