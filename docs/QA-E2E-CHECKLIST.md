# QA E2E Checklist

## Flujo principal
- Crear plan de carga desde `Nueva Estiba`.
- Ejecutar optimizacion (`baseline` e `intelligent`).
- Verificar colocados/no colocados y validaciones.
- Guardar plan.
- Abrir `Ver 3D` y confirmar visualizacion correcta.
- Entrar a `Editar Carga de Unidad`.
- Mover/rotar varias cajas, guardar `Version Manual`.
- Confirmar nueva version en historial.
- Restaurar version previa y validar resultado.
- Descargar PDF y revisar contenido base.

## Validaciones de layout 3D
- Sin gaps verticales erraticos al apilar.
- Sin colisiones evidentes entre cajas.
- Sin cajas fuera del contenedor.
- `UNSUPPORTED_STACK` solo cuando realmente no hay soporte.
- Camara/zoom/orbita funcionales en desktop y laptop.

## Casos borde
- Producto con `floorOnly`.
- Producto con `noStackAbove`.
- Fragilidad alta y muy alta.
- Alturas no multiplos de 10 cm.
- Carga mixta con pesos muy distintos.

## Criterio de salida
- 0 errores bloqueantes en flujo principal.
- 0 falsos positivos criticos en validaciones.
- Todas las rutas clave responden sin error 5xx.
