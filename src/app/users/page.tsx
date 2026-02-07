"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Users, Shield, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

type AppUser = {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: string
}

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  operator: 'Operador',
}

const createUserSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  role: z.string().min(1, 'Rol requerido'),
})

const editUserSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  password: z.string().optional().nullable(),
  role: z.string().min(1, 'Rol requerido'),
  isActive: z.boolean().optional().default(true),
})

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/users', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error cargando usuarios')
      setUsers(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando usuarios')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return users
    return users.filter(u =>
      u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)
    )
  }, [users, searchTerm])

  async function createUser(values: z.infer<typeof createUserSchema>) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo crear')
    await load()
    setIsCreateOpen(false)
  }

  async function updateUser(id: string, values: z.infer<typeof editUserSchema>) {
    const res = await fetch(`/api/users/${id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      }
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar')
    await load()
    setIsEditOpen(false)
    setEditing(null)
  }

  async function deleteUser(u: AppUser) {
    if (!confirm(`¿Eliminar "${u.email}"?`)) return
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar')
    await load()
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    setIsEditOpen(true)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500">Administración de accesos y roles</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Crear Usuario</DialogTitle>
              <DialogDescription>Disponible solo para administradores.</DialogDescription>
            </DialogHeader>
            <CreateUserForm onSubmit={createUser} />
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
              <DialogDescription>Actualiza rol/estado o cambia contraseña.</DialogDescription>
            </DialogHeader>
            <EditUserForm
              user={editing || undefined}
              disabled={!editing}
              onSubmit={(vals) => updateUser(editing!.id, vals)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o email…"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Lista de Usuarios ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No hay usuarios aún.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="gap-1">
                        {u.role === 'admin' ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                        {roleLabels[u.role] || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'secondary' : 'destructive'}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteUser(u)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CreateUserForm({
  onSubmit,
}: {
  onSubmit: (values: z.infer<typeof createUserSchema>) => Promise<void>
}) {
  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'operator' },
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handle(values: z.infer<typeof createUserSchema>) {
    setSaving(true)
    setFormError(null)
    try {
      await onSubmit({ ...values, email: values.email.toLowerCase() })
      form.reset()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handle)} className="space-y-4">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input disabled={saving} {...form.register('name')} />
        {form.formState.errors.name && (
          <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input disabled={saving} {...form.register('email')} />
        {form.formState.errors.email && (
          <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Contraseña</Label>
        <Input type="password" disabled={saving} {...form.register('password')} />
        {form.formState.errors.password && (
          <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Rol</Label>
        <Select value={form.watch('role')} onValueChange={(v) => form.setValue('role', v)} disabled={saving}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="operator">Operador</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Crear'}</Button>
      </DialogFooter>
    </form>
  )
}

function EditUserForm({
  user,
  disabled,
  onSubmit,
}: {
  user?: AppUser
  disabled?: boolean
  onSubmit: (values: z.infer<typeof editUserSchema>) => Promise<void>
}) {
  const form = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    values: {
      name: user?.name || '',
      password: '',
      role: user?.role || 'operator',
      isActive: user?.isActive ?? true,
    },
  })

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handle(values: z.infer<typeof editUserSchema>) {
    setSaving(true)
    setFormError(null)
    try {
      await onSubmit({
        ...values,
        password: values.password ? values.password : null,
      })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handle)} className="space-y-4">
      {user && (
        <div className="text-sm text-gray-600">
          <span className="font-medium">{user.email}</span>
        </div>
      )}
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}
      <div className="space-y-2">
        <Label>Nombre</Label>
        <Input disabled={saving || disabled} {...form.register('name')} />
      </div>
      <div className="space-y-2">
        <Label>Nueva contraseña (opcional)</Label>
        <Input type="password" disabled={saving || disabled} {...form.register('password')} />
      </div>
      <div className="space-y-2">
        <Label>Rol</Label>
        <Select value={form.watch('role')} onValueChange={(v) => form.setValue('role', v)} disabled={saving || disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="operator">Operador</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border p-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Activo</p>
          <p className="text-sm text-gray-500">Permite iniciar sesión</p>
        </div>
        <input
          type="checkbox"
          className="h-5 w-5"
          disabled={saving || disabled}
          checked={Boolean(form.watch('isActive'))}
          onChange={(e) => form.setValue('isActive', e.target.checked)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving || disabled}>{saving ? 'Guardando…' : 'Guardar'}</Button>
      </DialogFooter>
    </form>
  )
}
