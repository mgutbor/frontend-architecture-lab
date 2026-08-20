# Contributing

¡Gracias por contribuir a Frontend Architecture Lab!

Este documento define las reglas de colaboración del repositorio. Léelo completo antes de abrir tu primera pull request.

> **Regla de idioma:** los nombres de ramas, mensajes de commit y todo el código se escriben en **inglés**. La documentación se escribe en **español**.

## Configuración del entorno

1. Requisitos: Node.js ≥ 20 y pnpm 10.x (la versión exacta está fijada en `packageManager`).
2. Instala las dependencias:

   ```bash
   pnpm install
   ```

3. Verifica que todo funciona:

   ```bash
   pnpm check
   ```

## Ramas

Las ramas se nombran en inglés con el siguiente esquema:

```text
<tipo>/<descripcion-corta-kebab-case>
```

Tipos permitidos:

- `feature/` — nueva funcionalidad o experimento.
- `fix/` — corrección de errores.
- `refactor/` — refactorización sin cambio de comportamiento.
- `docs/` — cambios de documentación.
- `chore/` — tareas de mantenimiento (dependencias, tooling, configuración).

Ejemplos:

- `feature/react-monolith`
- `fix/accessibility-focus-order`
- `docs/adr-003-shared-config-package`

## Convención de commits

Los mensajes de commit se escriben en inglés siguiendo [Conventional Commits](https://www.conventionalcommits.org/):

```text
<tipo>(<alcance opcional>): <descripción>

[Descripción opcional más detallada.]
```

Tipos principales:

- `feat` — nueva funcionalidad.
- `fix` — corrección de errores.
- `refactor` — refactorización sin cambio de comportamiento.
- `docs` — documentación.
- `test` — pruebas.
- `build` — cambios en el sistema de build.
- `ci` — cambios en CI.
- `chore` — mantenimiento.

Ejemplos:

- `feat(react-monolith): add incidents list view`
- `docs: add comparison of rendering strategies`
- `ci: cache pnpm store in workflow`

## Pull requests

- Una pull request debe ser **pequeña y enfocada** en un único objetivo.
- El título y la descripción deben explicar **qué** se cambia y **por qué**.
- Si el cambio tiene implicaciones arquitectónicas, debe enlazar el **ADR** correspondiente.
- La PR debe pasar **toda la validación** (`pnpm check`) y tener **CI en verde**.
- Los cambios que introducen decisiones de arquitectura no se fusionan sin revisión explícita.

## Calidad de código

- **TypeScript estricto**: todo el código TypeScript debe cumplir la configuración base (`tsconfig.base.json`) sin excepciones injustificadas.
- **ESLint**: el código debe pasar el lint sin errores ni advertencias nuevas.
- **Prettier**: el código debe estar formateado con Prettier (`pnpm format`).
- **Nada de `any` implícito** ni supresión de errores de tipos sin justificación documentada.
- El código nuevo debe seguir los principios del proyecto (ver `PROJECT_SPEC.md`).

## Testing

- Todo cambio funcional debe incluir pruebas adecuadas a su nivel (unitarias, de integración o e2e según corresponda).
- Las pruebas deben ejecutarse localmente antes de abrir la PR.
- La **metodología** de cualquier medición debe explicarse junto con sus limitaciones (ver `PROJECT_SPEC.md`).

## Documentación

- La documentación se escribe en **español** y el código en **inglés**.
- Toda funcionalidad relevante debe estar documentada en `docs/`.
- `PROJECT_SPEC.md` es la fuente de verdad técnica: si un cambio la contradice, hay que actualizarla o justificar el cambio mediante un ADR.

## ADR (Architecture Decision Records)

- Cualquier decisión arquitectónica que afecte a una parte no trivial del sistema requiere un **ADR**.
- Los ADR se crean en `docs/decisions/` siguiendo la plantilla de `docs/decisions/templates/`.
- Un ADR es parte de la pull request que implementa la decisión.
- No se crean ADR «de demostración»: solo decisiones reales.

## Proceso de decisión arquitectónica

1. **Identificar** el problema o decisión pendiente.
2. **Proponer** alternativas y documentar sus trade-offs.
3. **Discutir** en la pull request o issue.
4. **Registrar** la decisión en un ADR.
5. **Revisar y aprobar** la decisión antes de implementarla.
6. **Implementar** la decisión en la misma PR que el ADR.

Las decisiones que cambien materialmente la arquitectura **no se toman en silencio**: requieren aprobación explícita antes de implementarse.
