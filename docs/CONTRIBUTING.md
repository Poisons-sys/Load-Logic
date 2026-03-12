# Guia de Contribucion

Normas para contribuir al proyecto sin romper estabilidad operativa.

## Flujo de ramas recomendado

- `main`: rama estable.
- `feature/<tema>`: nuevas funcionalidades.
- `fix/<tema>`: correcciones.
- `chore/<tema>`: mantenimiento/documentacion.

## Convencion de commits (recomendada)

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `test: ...`
- `chore: ...`

Ejemplos:

- `feat: add manual layout version restore flow`
- `fix: remove vertical gap on stacked cubes`
- `docs: update README and operations runbook`

## Criterio de "Done"

Antes de merge:

1. `npm run lint` en verde.
2. Si aplica, `npm run test:regression` en verde.
3. Validacion manual minima del flujo impactado.
4. Sin regresiones visuales evidentes en modulo 3D.
5. Documentacion actualizada si cambio comportamiento.

## Reglas de seguridad

- No subir secretos (`.env`, tokens, credenciales).
- Evitar logs con informacion sensible.
- Mantener scope por `companyId` en API multiempresa.

## Pull Request checklist

- Objetivo del cambio claro.
- Riesgos y mitigaciones descritos.
- Evidencia (capturas o pasos de prueba).
- Impacto en QA/release documentado cuando aplique.
