import { z } from 'zod'

export const loadPlanItemInputSchema = z.object({
  productId: z.string().trim().min(1, 'productId es requerido'),
  quantity: z.coerce.number().int().positive('quantity debe ser mayor a 0'),
  routeStop: z.coerce.number().int().positive('routeStop debe ser mayor a 0').optional(),
})

export const createLoadPlanSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido'),
  description: z.string().trim().optional(),
  vehicleId: z.string().trim().min(1, 'vehicleId es requerido'),
  items: z.array(loadPlanItemInputSchema).min(1, 'items es requerido'),
})

export const updateLoadPlanSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().nullable().optional(),
  vehicleId: z.string().trim().min(1).optional(),
  status: z.enum(['pendiente', 'optimizado', 'aprobado', 'ejecutado']).optional(),
  items: z.array(loadPlanItemInputSchema).min(1).optional(),
})

export const previewOptimizeSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId es requerido'),
  items: z.array(loadPlanItemInputSchema).min(1, 'items es requerido'),
  strategy: z.enum(['baseline', 'intelligent']).optional(),
  iterations: z.coerce.number().int().min(2).max(40).optional(),
})

export const manualCubeSchema = z.object({
  instanceId: z.string().trim().min(1).optional(),
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  z: z.coerce.number().finite().optional(),
  width: z.coerce.number().finite().optional(),
  height: z.coerce.number().finite().optional(),
  depth: z.coerce.number().finite().optional(),
  rotY: z.coerce.number().finite().optional(),
  routeStop: z.coerce.number().int().positive().optional(),
  productId: z.string().trim().min(1, 'productId es requerido'),
})

export const persistOptimizeSchema = z.object({
  manualCubes: z.array(manualCubeSchema).default([]),
  strategy: z.enum(['baseline', 'intelligent']).optional(),
  iterations: z.coerce.number().int().min(2).max(40).optional(),
  telemetry: z.object({
    moves: z.coerce.number().int().min(0).optional(),
    swaps: z.coerce.number().int().min(0).optional(),
    rotates: z.coerce.number().int().min(0).optional(),
    undos: z.coerce.number().int().min(0).optional(),
    redos: z.coerce.number().int().min(0).optional(),
    keyNudges: z.coerce.number().int().min(0).optional(),
    updatedAt: z.coerce.number().int().optional(),
  }).optional(),
})

export const restoreLoadPlanVersionSchema = z
  .object({
    versionId: z.string().trim().uuid().optional(),
    version: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => Boolean(data.versionId || data.version), {
    message: 'versionId o version es requerido',
  })

export const loadPlanTemplateSchema = z.object({
  name: z.string().trim().min(1, 'name es requerido'),
  description: z.string().trim().optional(),
  vehicleId: z.string().trim().min(1, 'vehicleId es requerido').optional(),
  items: z.array(loadPlanItemInputSchema).min(1, 'items es requerido'),
  metadata: z.record(z.any()).optional(),
})

export type LoadPlanItemInput = z.infer<typeof loadPlanItemInputSchema>
export type CreateLoadPlanInput = z.infer<typeof createLoadPlanSchema>
export type UpdateLoadPlanInput = z.infer<typeof updateLoadPlanSchema>
export type PreviewOptimizeInput = z.infer<typeof previewOptimizeSchema>
export type ManualCubeInput = z.infer<typeof manualCubeSchema>
export type PersistOptimizeInput = z.infer<typeof persistOptimizeSchema>
export type RestoreLoadPlanVersionInput = z.infer<typeof restoreLoadPlanVersionSchema>
export type LoadPlanTemplateInput = z.infer<typeof loadPlanTemplateSchema>

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}
