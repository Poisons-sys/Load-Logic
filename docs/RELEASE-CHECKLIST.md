# Release Checklist

## Pre-release tecnico
- `npm run lint` en verde.
- Pruebas de regresion de optimizacion ejecutadas.
- Smoke test de flujo de plan de carga ejecutado.
- Variables de entorno validadas en el entorno destino.
- Migraciones DB revisadas y aplicadas.

## Operacion y seguridad
- Validar roles/permisos para `load-plans`, `optimize` y `edit-layout`.
- Confirmar logs de actividad en guardado manual/restauracion.
- Confirmar respaldo DB reciente.
- Confirmar alertas y monitoreo de errores activos.

## Validacion funcional en entorno destino
- Crear, optimizar y guardar plan real.
- Editar layout manual y guardar nueva version.
- Restaurar version y verificar consistencia.
- Revisar validaciones legibles en UI.
- Descargar PDF y validar campos clave.

## Post-release
- Monitorear errores durante 24-48h.
- Revisar feedback operativo inicial.
- Registrar incidencias y prioridad de correccion.
