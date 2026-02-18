import { z } from 'zod'

export const loadPlanItemInputSchema = z.object({
  productId: z.string().trim().min(1, 'productId es requerido'),
  quantity: z.coerce.number().int().positive('quantity debe ser mayor a 0'),
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
  status: z.enum(['pendiente', 'optimizado', 'aprobado', 'ejecutado']).optional(),
  items: z.array(loadPlanItemInputSchema).min(1).optional(),
})

export const previewOptimizeSchema = z.object({
  vehicleId: z.string().trim().min(1, 'vehicleId es requerido'),
  items: z.array(loadPlanItemInputSchema).min(1, 'items es requerido'),
})

export const manualCubeSchema = z.object({
  x: z.coerce.number().finite().optional(),
  y: z.coerce.number().finite().optional(),
  z: z.coerce.number().finite().optional(),
  width: z.coerce.number().finite().optional(),
  height: z.coerce.number().finite().optional(),
  depth: z.coerce.number().finite().optional(),
  rotY: z.coerce.number().finite().optional(),
  productId: z.string().trim().min(1, 'productId es requerido'),
})

export const persistOptimizeSchema = z.object({
  manualCubes: z.array(manualCubeSchema).default([]),
})

export type LoadPlanItemInput = z.infer<typeof loadPlanItemInputSchema>
export type CreateLoadPlanInput = z.infer<typeof createLoadPlanSchema>
export type UpdateLoadPlanInput = z.infer<typeof updateLoadPlanSchema>
export type PreviewOptimizeInput = z.infer<typeof previewOptimizeSchema>
export type ManualCubeInput = z.infer<typeof manualCubeSchema>
export type PersistOptimizeInput = z.infer<typeof persistOptimizeSchema>

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}
