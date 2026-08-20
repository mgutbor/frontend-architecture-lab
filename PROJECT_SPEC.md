# PROJECT_SPEC — Especificación Técnica

- **Versión:** 0.2
- **Estado:** Aprobada (Fase 0.1 — Specification Hardening)
- **Fecha:** 2026-08-20
- **Proyecto:** Frontend Architecture Lab

> Este documento es la **fuente de verdad técnica** del proyecto. Las fases de implementación posteriores deben cumplir esta especificación. Cualquier cambio que la contradiga requiere un ADR y aprobación explícita.
>
> Reglas de idioma: este documento y toda la documentación se escriben en español. El código y la configuración se escriben en inglés.

---

## 1. Propósito

Frontend Architecture Lab es un laboratorio arquitectónico cuyo propósito es **comparar arquitecturas frontend de forma objetiva y reproducible**. Cada arquitectura se implementa como un experimento que resuelve los mismos requisitos funcionales sobre el mismo producto ficticio — **Operations Hub** — para que las diferencias observadas sean atribuibles a la arquitectura y no al dominio.

El laboratorio existe para sustituir suposiciones por evidencia, documentar decisiones con contexto y sus trade-offs, y servir de referencia reutilizable para proyectos futuros.

## 2. Objetivos

1. Implementar cada arquitectura seleccionada como un experimento con **requisitos funcionales equivalentes**.
2. Establecer una **metodología de medición** común y documentar sus limitaciones.
3. Registrar todas las decisiones arquitectónicas como **ADR**.
4. Mantener un repositorio monorepo limpio, profesional y mantenible.
5. Tratar la **accesibilidad como requisito de primera clase** en todos los experimentos.
6. Evitar tecnología por la tecnología misma: cada herramienta debe justificar su inclusión.

## 3. Operations Hub (dominio)

**Operations Hub** es el producto ficticio que sirve de dominio para todos los experimentos.

- El dominio y sus requisitos funcionales equivalentes están **definidos y congelados** (Fase 0.1); los experimentos se implementan contra esta especificación.
- Ningún experimento puede introducir funcionalidad de dominio no definida en la especificación del producto.
- El dominio debe ser lo suficientemente rico como para ejercitar las diferencias relevantes entre arquitecturas, y lo suficientemente acotado como para ser implementable varias veces.
- Documentos de referencia (definidos y aprobados en la Fase 0.1):
  - [docs/architecture/domain-model.md](docs/architecture/domain-model.md) — modelo de dominio (entidades, estados, transiciones, reglas).
  - [docs/architecture/dataset.md](docs/architecture/dataset.md) — dataset determinista común.
  - [docs/architecture/functional-contract.md](docs/architecture/functional-contract.md) — contrato funcional y criterios de aceptación.

## 4. Experimentos

Experimentos planificados:

| Experimento      | Enfoque                                            |
| ---------------- | -------------------------------------------------- |
| React Monolith   | Aplicación monolítica con React + Vite.            |
| Angular Monolith | Aplicación monolítica con Angular.                 |
| Web Components   | Componentes web nativos.                           |
| Lit              | Componentes web con Lit.                           |
| Microfrontends   | Descomposición de la aplicación en microfrontends. |

Reglas comunes:

- Todos los experimentos implementan **requisitos funcionales equivalentes** (principio 8) según el [contrato funcional](docs/architecture/functional-contract.md).
- Cada experimento se documenta en `docs/experiments/`; las comparativas en `docs/comparisons/`.
- Ningún experimento se implementa en las Fases 0 y 0.1.
- **Alcance del MVP:** el MVP solo requiere React Monolith y Angular Monolith; Web Components, Lit y Microfrontends pertenecen a fases posteriores (ver [docs/architecture/mvp.md](docs/architecture/mvp.md)).

## 5. Principios de arquitectura

1. **Simplicidad sobre abstracción innecesaria.** Se prefiere la solución más simple que cumple los requisitos.
2. **Evidencia sobre suposiciones.** Las decisiones se apoyan en mediciones y datos, no en preferencias.
3. **Las decisiones de arquitectura deben tener contexto.** Toda decisión registrada explica el contexto que la motiva.
4. **Los trade-offs deben documentarse.** Toda decisión reconoce explícitamente qué sacrifica.
5. **Evitar tecnología por la tecnología misma.** Toda herramienta o patrón debe justificar su inclusión.
6. **El código compartido debe tener un límite de propiedad claro.** Cada paquete compartido tiene dueño y responsabilidad definidos.
7. **La duplicación pequeña puede ser preferible al acoplamiento innecesario.** No se abstrae código compartido prematuramente.
8. **Todos los experimentos deben usar requisitos funcionales equivalentes.** La comparación solo es válida sobre bases iguales.
9. **La accesibilidad es un requisito de primera clase.** Se evalúa en todos los experimentos, no como añadido opcional.
10. **Las mediciones deben explicar su metodología y sus limitaciones.** Una métrica sin metodología no es evidencia.

## 6. Estrategia de monorepo

- Monorepo gestionado con **pnpm** (workspaces) y **Turborepo** (orquestación de tareas).
- Estructura de dos directorios raíz: `apps/` (aplicaciones / experimentos) y `packages/` (código compartido).
- La configuración de calidad (ESLint, Prettier, TypeScript base) se centraliza en la raíz cuando aporta valor real; se evita la abstracción prematura.
- El turbo pipeline es mínimo en la Fase 0; se ampliará cuando existan aplicaciones reales.
- No se crean aplicaciones ni paquetes ficticios para poblar directorios.

## 7. Estructura del repositorio

```text
frontend-architecture-lab/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/                  # Aplicaciones (experimentos)
├── packages/              # Paquetes compartidos
├── docs/
│   ├── architecture/      # Documentación de arquitectura
│   ├── decisions/         # ADRs
│   ├── experiments/       # Documentación de experimentos
│   └── comparisons/       # Comparativas
├── scripts/               # Scripts de apoyo
├── .editorconfig
├── .gitignore
├── .prettierignore
├── .prettierrc
├── CONTRIBUTING.md
├── LICENSE
├── PROJECT_SPEC.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 8. Responsabilidades de paquetes

Definidas a nivel de política; los paquetes concretos se crean en fases posteriores:

- **`apps/*`**: aplicaciones ejecutables; cada experimento es una aplicación.
- **`packages/*`**: código compartido con responsabilidad única y **límite de propiedad claro** (principio 6). Solo se crean cuando existe duplicación real justificada (principios 1 y 7).
- **`packages/domain` (previsto, Fase 1):** paquete compartido con los contratos del dominio (tipos, validación) y el fixture determinista `operations-hub-v1.json`; única fuente de datos para todos los experimentos.
- **`scripts/*`**: scripts de apoyo del repositorio (no de negocio).

## 9. Stack tecnológico

| Herramienta    | Uso                                                     | Estado en Fase 0          |
| -------------- | ------------------------------------------------------- | ------------------------- |
| TypeScript     | Lenguaje, configuración estricta compartida             | Configuración base creada |
| pnpm           | Gestor de paquetes (versión fijada en `packageManager`) | Activo                    |
| Turborepo      | Orquestación de tareas                                  | Configuración mínima      |
| React + Vite   | Experimento React Monolith                              | Fase posterior            |
| Angular        | Experimento Angular Monolith                            | Fase posterior            |
| Lit            | Experimento Lit                                         | Fase posterior            |
| Web Components | Experimento Web Components                              | Fase posterior            |
| Vitest         | Testing unitario                                        | Fase posterior            |
| Playwright     | Testing e2e                                             | Fase posterior            |
| Storybook      | Desarrollo de componentes                               | Fase posterior            |
| ESLint         | Linting (configuración plana)                           | Activo                    |
| Prettier       | Formateo                                                | Activo                    |
| GitHub Actions | CI                                                      | Workflow activo           |
| Docker         | Entornos reproducibles                                  | Fase posterior            |

Regla: ninguna dependencia se añade sin justificación (principio 5). En la Fase 0 solo están instaladas las herramientas necesarias para la fundación.

## 10. Estrategia de testing

- **Testing unitario:** Vitest, junto al código de cada paquete o aplicación.
- **Testing e2e:** Playwright, ejercitando los requisitos funcionales equivalentes de cada experimento.
- **Storybook:** desarrollo y revisión visual de componentes (experimentos que usen componentes).
- Todos los experimentos deben cubrir los **mismos requisitos funcionales** en sus pruebas para que la comparación sea válida.
- La metodología de cualquier medición derivada de pruebas se documenta junto con sus limitaciones.

En la Fase 0 no hay suites de pruebas (no hay código que probar).

## 11. Quality gates

Para que una PR se considere válida:

1. `pnpm format:check` sin errores.
2. `pnpm lint` sin errores.
3. `pnpm typecheck` sin errores.
4. `pnpm test` en verde (cuando existan suites).
5. `pnpm build` en verde (cuando existan paquetes).
6. CI en verde.
7. ADR adjunto cuando la PR introduce una decisión arquitectónica.

## 12. Métricas

- La metodología de métricas está **definida y aprobada** en [docs/experiments/metrics.md](docs/experiments/metrics.md).
- Se distinguen dos categorías que **no se mezclan**: **A. métricas objetivas** (tamaño de bundle, tiempo de build, tiempo de pruebas, Lighthouse, dependencias, paquetes) y **B. criterios cualitativos** (mantenibilidad, DX, autonomía de equipo, complejidad) evaluados por rúbrica.
- Toda medición documenta su metodología y sus limitaciones (principio 10); se produce **medición comparativa de ingeniería**, no un benchmark científicamente exacto.

## 13. Scorecards

- La metodología de scorecard está **definida y aprobada** en [docs/comparisons/scorecard.md](docs/comparisons/scorecard.md): escala 1–5 con rúbrica, separación estricta entre mediciones objetivas y evaluación cualitativa, y **evidencia trazable** para toda puntuación.
- **Sin ponderación ni nota global:** el objetivo es el entendimiento arquitectónico, no la gamificación; los criterios se presentan por separado con su evidencia.

## 14. Estrategia ADR

- Las decisiones arquitectónicas se registran como ADR en `docs/decisions/`.
- Proceso: identificar → proponer alternativas → discutir → registrar ADR → revisar y aprobar → implementar.
- Los ADR que cambian materialmente la arquitectura requieren **aprobación explícita** antes de implementarse.
- Una decisión supercedida se reemplaza por un ADR nuevo; el anterior se marca como `Deprecated` y no se reescribe.
- No se crean ADR ficticios ni de demostración.
- Ver `docs/decisions/README.md` para el marco completo.

## 15. Reglas de idioma de la documentación

- **Código y configuración: inglés.** Nombres de archivos, directorios, paquetes, variables, scripts, mensajes de commit y comentarios.
- **Documentación: español.** README, CONTRIBUTING, PROJECT_SPEC, ADRs, documentación de arquitectura, experimentos y comparativas.
- Esta regla es obligatoria para todas las contribuciones.

## 16. Principios de accesibilidad

- La accesibilidad es un **requisito funcional de primera clase** (principio 9): se planifica, se implementa y se verifica en todos los experimentos.
- Nivel de referencia: **WCAG 2.2 AA**, con criterios verificables ACC-1…ACC-8 definidos en el [contrato funcional](docs/architecture/functional-contract.md).
- Las comparativas deben evaluar accesibilidad con la misma metodología en todos los experimentos.

## 17. Principios de CI/CD

- CI valida la fundación del repositorio y, en fases posteriores, cada aplicación y paquete.
- La configuración de CI debe **seguir siendo útil** cuando se añadan aplicaciones (los comandos raíz orquestan el resto).
- **Sin despliegue**, sin infraestructura cloud ni despliegue Docker en CI por ahora.
- Los cambios entran únicamente por pull request con CI en verde.

## 18. Roadmap de IA

- Las Fases 0 y 0.1 **no incluyen ninguna funcionalidad de IA**.
- La posible integración de IA en el laboratorio (p. ej. asistentes de código, generación de experimentos) es un tema abierto que **requiere ADR y aprobación explícita** antes de cualquier implementación.
- **Pendiente de definición:** alcance, herramientas y criterios de evaluación de IA para el laboratorio.

## 19. Reglas Freebuff

- **No introducir en silencio** tecnologías o decisiones arquitectónicas nuevas.
- Ante una decisión ambigua: identificarla, explicar las alternativas, recomendar una y **esperar aprobación** si cambia materialmente la arquitectura.
- **No sobre-ingenierizar.**
- **No generar grandes cantidades de boilerplate.**
- **No implementar fases futuras.**
- Ante contradicciones o ambigüedades en la especificación: explicar el problema, proponer una solución y no decidir en silencio.

## 20. Definition of Done

Una tarea o fase está completa cuando:

1. Cumple los requisitos funcionales definidos para ella.
2. Pasa todos los quality gates (sección 11).
3. Incluye las pruebas requeridas y documenta su metodología.
4. La documentación necesaria está actualizada (en español) y es coherente con esta especificación.
5. Las decisiones arquitectónicas están registradas en ADR aprobados.
6. No introduce dependencias sin justificar.
7. No introduce funcionalidad de fases posteriores.

## 21. Roadmap

| Fase     | Contenido                                                                                  | Alcance MVP | Estado     |
| -------- | ------------------------------------------------------------------------------------------ | ----------- | ---------- |
| Fase 0   | Fundación del repositorio (tooling, CI, documentación, ADR)                                | MVP         | Completada |
| Fase 0.1 | Endurecimiento de la especificación (dominio, contrato, dataset, métricas, scorecard, MVP) | MVP         | Completada |
| Fase 1   | Operations Hub: dominio y contratos compartidos (paquete de dominio, fixture determinista) | MVP         | Pendiente  |
| Fase 2   | React Monolith                                                                             | MVP         | Pendiente  |
| Fase 3   | Angular Monolith                                                                           | MVP         | Pendiente  |
| Fase 4   | Web Components y Lit                                                                       | Posterior   | Pendiente  |
| Fase 5   | Microfrontends                                                                             | Posterior   | Pendiente  |
| Fase 6   | IA / AI Architecture Advisor (requiere ADR)                                                | Posterior   | Pendiente  |

El alcance del MVP se define en [docs/architecture/mvp.md](docs/architecture/mvp.md). La transición de fase requiere aprobación explícita; **no se pasa a la siguiente fase automáticamente**.

## 22. Definición de MVP

La definición completa y verificable del MVP está en [docs/architecture/mvp.md](docs/architecture/mvp.md). Resumen:

- **Alcance:** Fases 0, 0.1, 1, 2 (React Monolith) y 3 (Angular Monolith).
- **Criterios de salida:** criterios verificables MVP-1…MVP-14: fundación válida, especificación completa, dominio congelado, contratos comunes, dataset determinista, ambas implementaciones cumplen el contrato funcional con escenarios equivalentes, pruebas, accesibilidad, mediciones básicas recogibles, metodología de comparación documentada y decisiones en ADR.
- **No-goals del MVP:** despliegue en producción, autenticación, backend real, infraestructura cloud, IA, microfrontends, Web Components/Lit, observabilidad avanzada, colaboración en tiempo real e i18n.
- La transición a fases posteriores al MVP requiere aprobación explícita; **no se avanza automáticamente**.
