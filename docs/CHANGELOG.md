# Changelog

Todas las mejoras relevantes del proyecto se registran aqui.

## 2026-03-12

### MVP operable consolidado
- Flujo principal operativo completo:
  - `Nueva Estiba -> Optimizar -> Ver 3D -> Editar Carga de Unidad -> Guardar Version -> Restaurar Version -> PDF`.
- Mejora de legibilidad de validaciones/warnings en UI.
- Integracion de foco visual en 3D para warnings relevantes.

### Layout 3D y edicion manual
- Submodulo `Editar Carga de Unidad` habilitado para ajuste manual.
- Persistencia por pieza con `instanceKey` en `load_plan_placements`.
- Guardado de version manual y restauracion por `load_plan_versions`.
- Ajustes de hardening para apilado y reduccion de gaps/falsos `UNSUPPORTED_STACK`.

### Optimizacion inteligente
- Priorizacion mas prudente ante riesgos criticos:
  - ejes,
  - estabilidad,
  - desbalance longitudinal.
- Mejor criterio para seleccionar candidatos de layout.

### Calidad, QA y salida a produccion
- Checklists de QA y release documentados.
- Pruebas de regresion y smoke scripts disponibles.
- Documentacion de cierre de puntos 1, 4 y 5 creada.
