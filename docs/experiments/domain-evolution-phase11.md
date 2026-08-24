# Fase 11 — Evolución del dominio y breaking changes

## 1. Pregunta experimental

> ¿Qué ocurre cuando el DOMINIO evoluciona y existen múltiples features que
> dependen de él? ¿Cuál es el coste arquitectónico, contractual y estructural
> de migrar el modelo compartido, y cómo lo absorben React y Angular sin
> degradar sus fronteras?

No se busca un ganador: se mide el **coste de evolucionar correctamente el
dominio** (blast radius, locality, duplicación, acoplamiento, recuperación)
bajo 4 migraciones reales y deliberadamente incómodas.

## 2. Contexto

Fases 1–10 establecieron la arquitectura base, la equivalencia funcional, el
coste de cambio puntual (Fase 6), el rendimiento y la escalabilidad. El
dominio de `@operations-hub/domain` (4 entidades, 2 con estado) está
documentado como _congelado_ (ADR-001, domain-model.md) — esta fase lo
evoluciona **deliberadamente** en una copia aislada para medir el coste.

## 3. Baseline

- Commit del árbol principal: `c8465c8` (snapshot BASELINE de la copia).
- `packages/domain`: 7 archivos prod / 760 LOC, 5 tests / 768 LOC.
- React: 25 archivos prod / 1859 LOC; Angular: 22 archivos prod / 1241 LOC.
- Consumidores directos del dominio: React 13, Angular 12.
- Invariantes verificadas en baseline: 0 imports entre features, 0 reglas de
  dominio duplicadas, 0 dependencias nuevas.

## 4. Arquitectura

Idéntica al laboratorio (copiada): `packages/domain` independiente de UI,
dependencia unidireccional (apps → domain), features aisladas, estado de
dominio fuera de la UI (ADR-002), sin `shared/` genérico. Las migraciones no
la modifican: se preservan ADR-001 y ADR-002.

## 5. Diseño experimental

Secuencia acumulativa en `/tmp/lab-phase11` (copia aislada con historial
git; cada estado validado y commiteado):

```
BASELINE (c8465c8) → M1 (e9476dc) → M2 (364383d) → M3 (221ece1) → M4 (fd79ff6)
```

Cada migración parte del estado anterior; antes de cada snapshot:
`format` + `format:check` + `lint` + `typecheck` + `test` + `build`. El
árbol principal no se modifica.

## 6. M1 — Refinamiento de un campo primitivo

**Cambio:** `ProjectStatus` gana el estado `'blocked'` (transiciones
`planned→blocked`, `active→blocked`, `blocked→planned|active`; `completed`
permanece terminal-salvo-reapertura). Convierte el contrato implícito del
estado en explícito con un caso real (proyectos bloqueados).

**Archivos (10):** domain `types/validation/transitions` + test de
transiciones; React `dashboard`, `projects-page` (+test); Angular
`dashboard.component`, `projects.component.html` (+spec).

**Resultado:** 0 errores de typecheck; 3 tests rotos (2 React, 1 Angular)
por la nueva transición — esperado y localizado; 3 tests modificados.
**locality 0,90** (la más alta).

## 7. M2 — Nueva entidad de dominio

**Cambio:** entidad persistida `Milestone` (`projectId, title, dueDate,
completed`) + BR-8 (`milestoneBelongsToProject`) + validación en
`validateDataset` + 12 hitos deterministas en el fixture + consumidores
reales (lista de hitos en project-detail, KPIs de hitos en dashboard) en
ambas apps.

**Archivos (17):** domain `types/rules/index` + fixture + 2 tests; React 4;
Angular 7 (component + template separados).

**Resultado:** 0 errores de typecheck (cambio aditivo); 9 tests del dominio
rotos por la nueva colección obligatoria en `Dataset` (esperado), 1 test de
fixture por el ID pattern; 3 tests modificados + 2 tests nuevos (BR-8,
PRJ-VIEW-4). **Es la migración con mayor delta de LOC (+278)** y la que más
archivos de app tocó en Angular (7).

## 8. M3 — Nueva regla de negocio derivada

**Cambio:** `getProjectHealth(project, tasks, milestones)` → `'on-track' |
'at-risk' | 'blocked' | 'completed'`, derivada de status + completion rate +
hitos pendientes/vencidos. Vive **una sola vez** en `packages/domain`
(`project-health.ts`, 1 archivo nuevo + tests) y se consume como badge en
project-detail y KPI "Projects at risk" en dashboard de ambas apps.

**Archivos (10):** domain 3 (index + project-health + test), React 3,
Angular 4.

**Resultado:** 0 errores de typecheck; 0 tests rotos (regla nueva, no
rompe); 1 test nuevo en el dominio (5 casos), 1 test de integración en
React. Verificado: **1 implementación** de la regla (H54).

## 9. M4 — Breaking change del contrato

**Cambio:** `Project.status: ProjectStatus` → `Project.status: {
value: ProjectStatus; changedAt: string }` (ProjectStatusInfo), con helpers
`makeProjectStatus`/`projectStatusValue` en el dominio y `statusChangedAt`
en `ProjectInput` para que el formulario selle el momento del cambio. Es un
cambio deliberadamente incómodo: **todos** los consumidores de `project.status`
se rompen.

**Errores de typecheck antes de corregir (contados sobre consumidores sin
migrar): 21 errores en 11 archivos** — 10 en React (6 archivos), 11 en
Angular (5 archivos): `TS2538` (status usado como índice), `TS2322` (status
asignado como string), `TS2345` (status pasado como ProjectStatus),
`TS2367` (comparación sin solapamiento en filters). **Todos los errores
aparecieron en consumidores legítimos del campo**; ninguno en features no
relacionadas ni en imports entre features.

**Archivos (29):** domain 10 (types/rules/validation/index/project-status/
project-health + fixture + 3 tests), React 9, Angular 10.

**Resultado:** 0 errores tras corregir; 15 tests rotos (8 React, 7 Angular)
por la nueva forma del status — todos en stores, forms y pages de projects;
ninguno en features no relacionadas. Tests modificados: 6 (3 por framework).

## 10. Métricas

Definidas en el JSON y el script (`scripts/measure-domain-evolution-phase11.mjs`):

- **files_changed / LOC delta**: `git diff --numstat` entre snapshots.
- **compile_errors_before_fix**: `tsc --noEmit` sobre consumidores sin
  migrar tras aplicar el cambio de contrato (M4: 21; M1–M3: 0 por ser
  aditivos).
- **consumers / breaking_consumers**: archivos prod que importan
  `@operations-hub/domain` (React 13, Angular 12) y cuántos requirieron
  cambio en cada migración.
- **blast_radius**: `files_changed + features_touched + tests_changed`
  (direct + indirect); `unrelated_features_touched` se contabiliza aparte.
- **migration_locality**: `(domain files + features touched + tests) /
files_changed` — proximidad del cambio a su causa.
- **domain_change_ratio**: `domain files / total files` por migración.
- **duplicación**: escaneo de 9 nombres de reglas del dominio reimplementados
  fuera del paquete; **0**.
- **acoplamiento**: escaneo de imports feature→feature; **0**.
- **time_to_implement**: **NO MEDIBLE** (no hay forma reproducible de medir
  tiempo humano; se priorizan métricas estructurales).

## 11. Resultados React

| Migración | Archivos |   LOC Δ | Tests rotos | Tests modif. | Errores typecheck (antes) |
| --------- | -------: | ------: | ----------: | -----------: | ------------------------: |
| M1        |        3 |      +6 |           2 |            2 |                         0 |
| M2        |        4 |     +42 |           0 |            1 |                         0 |
| M3        |        3 |     +18 |           0 |            1 |                         0 |
| M4        |        9 |     +12 |           8 |            3 |           10 (6 archivos) |
| **Total** |   **19** | **+78** |      **10** |        **7** |                    **10** |

## 12. Resultados Angular

| Migración | Archivos | LOC Δ | Tests rotos | Tests modif. | Errores typecheck (antes) |
|---|---:|---:|---:|---:|---:|---:|
| M1 | 3 | +5 | 1 | 1 | 0 |
| M2 | 7 | +25 | 0 | 1 | 0 |
| M3 | 4 | +21 | 0 | 0 | 0 |
| M4 | 10 | +20 | 7 | 3 | 11 (5 archivos) |
| **Total** | **24** | **+71** | **8** | **5** | **11** |

## 13. Matriz de impacto

| Cambio                 | Domain | React | Angular | Features afectadas         | Tests | Blast radius |
| ---------------------- | -----: | ----: | ------: | -------------------------- | ----: | -----------: |
| M1 (refinar status)    |      4 |     3 |       3 | dashboard, projects        |     3 |           15 |
| M2 (entidad Milestone) |      6 |     4 |       7 | dashboard, projects        |     3 |           22 |
| M3 (regla health)      |      3 |     3 |       4 | dashboard, projects        |     2 |           14 |
| M4 (breaking status)   |     10 |     9 |      10 | dashboard, projects, teams |     6 |           38 |

| Cambio        | Cross-feature imports | Duplicación | Nuevas deps | Violaciones |
| ------------- | --------------------: | ----------: | ----------: | ----------: |
| M1–M4 (todas) |                     0 |           0 |           0 |           0 |

## 14. Blast radius

| Migración | Archivos | Features | Tests | **Blast** | Unrelated features |
| --------- | -------: | -------: | ----: | --------: | -----------------: |
| M1        |       10 |        2 |     3 |        15 |              **0** |
| M2        |       17 |        2 |     3 |        22 |              **0** |
| M3        |       10 |        2 |     2 |        14 |              **0** |
| M4        |       29 |        3 |     6 |        38 |              **0** |

`unrelated_features_touched = 0` en las 4 migraciones: **el blast radius
crece solo con los consumidores reales** (H58). La feature `teams` se tocó
en M4 porque muestra `project.status` (consumidor legítimo), no por
acoplamiento.

## 15. Migration locality

| Migración | Files | Directos (domain+features+tests) | **Locality** | Domain ratio |
| --------- | ----: | -------------------------------: | -----------: | -----------: |
| M1        |    10 |                                9 |     **0,90** |         4/10 |
| M2        |    17 |                               11 |     **0,65** |         6/17 |
| M3        |    10 |                                7 |     **0,70** |         3/10 |
| M4        |    29 |                               19 |     **0,66** |        10/29 |

La locality es alta en todos los casos; baja ligeramente en M2/M4 porque los
tests del dominio y las apps (que son parte del cambio correcto) cuentan en
el denominador. No aparece ningún archivo "no relacionado" modificado.

## 16. Contratos

- **M1/M2/M3** (aditivos): el typecheck pasó sin errores en el primer
  intento; los tests de dominio detectaron los cambios obligatorios (nueva
  colección en `Dataset`, ID pattern, distribución del fixture).
- **M4** (breaking): el typecheck detectó **21 errores en 11 archivos,
  todos en consumidores legítimos** de `project.status`. La localización de
  los errores coincidió con el mapa de consumidores esperado: stores,
  filters, forms, detail, dashboard, teams — **ningún error fuera del área
  esperada** (H56). La migración fue incremental: dominio → helpers → stores
  → UI → tests, con typecheck verde entre cada paso.

## 17. Tests

| Migración |      Rotos |               Añadidos | Modificados | Suite (verde al final)           |
| --------- | ---------: | ---------------------: | ----------: | -------------------------------- |
| M1        |          3 |                      0 |           3 | domain 113, react 84, angular 61 |
| M2        | 9 (domain) |                      2 |           3 | domain 113, react 85, angular 62 |
| M3        |          0 | 6 (5 domain + 1 react) |           1 | domain 118, react 86, angular 62 |
| M4        |         15 |                      0 |           6 | domain 118, react 86, angular 62 |

Los tests rotos siempre aparecieron en las áreas del cambio; **ninguno en
features no relacionadas** (H61). Los tests de dominio guiaron la migración
de M2 (colección obligatoria) y M4 (nueva forma del status).

## 18. Duplicación

**0.** Escaneo automático de 9 reglas del dominio
(`canTransitionProject`, `canTransitionTask`, `validateProjectInput`,
`validateTaskInput`, `getProjectHealth`, `milestoneBelongsToProject`,
`buildGlobalReport`, `buildProjectReport`, `buildTeamReport`): ninguna
reimplementada en las apps. `getProjectHealth` (M3) tiene **1 única
implementación** en `packages/domain` y 5 consumidores (H54). Criterio de
revisión manual documentado: solo se marcan como duplicadas las definiciones
que no importan del dominio.

## 19. Acoplamiento

**0 imports feature→feature** en las 4 migraciones y en el estado final
(React y Angular). Las apps se acoplan al dominio, no entre sí; los stores
se mantienen como única capa de mutación (ADR-002). La evolución de una
entidad no introdujo imports entre features (H55).

## 20. Violaciones

**0.** Invariantes verificadas tras M4: 0 imports entre features, 0 reglas
duplicadas, 0 dependencias nuevas (git diff de los 4 package.json), dominio
sin imports de apps, ADR-001/ADR-002 intactos (H60).

## 21. Hallazgos inesperados

1. **React tuvo más tests rotos que Angular en M4 (8 vs 7) pese a tener
   menos archivos afectados (9 vs 10)** — sus tests de store y page
   verifican el estado del proyecto directamente (más aserciones sobre la
   forma del dato); Angular los verifica más vía template. Es una diferencia
   de estilo de tests, no de arquitectura.
2. **M2 fue la migración de mayor coste (LOC +278, 17 archivos)** — más que
   el breaking change M4 (LOC +99, 29 archivos). Añadir una entidad con
   consumidores reales cuesta más que romper un campo: el breaking change es
   mecánico (seguir los errores), la entidad nueva exige diseño (modelo +
   regla + fixture + UI + tests).
3. **El fixture cambió dos veces** (M2: `milestones`; M4: `status.changedAt`)
   — los datos de benchmark evolucionan con el contrato; el `validateDataset`
   los protege en cada paso.
4. **Angular tocó más archivos en M2 (7 vs 4) por la separación
   component.ts + .html** — el mismo cambio funcional requiere dos archivos
   en Angular (clase + template) frente a uno en React (JSX co-ubicado).
   Estructural, no peor.

## 22. Limitaciones

- Un solo conjunto de migraciones en una sola máquina; los deltas dependen
  del estilo de implementación del experimento (código idiomático de cada
  framework, no forzado a ser idéntico).
- `time_to_implement` es **NO MEDIBLE** (sin forma reproducible de medir
  tiempo humano).
- Los errores de typecheck "antes de corregir" solo se registraron para M4
  (único breaking change); M1–M3 son aditivos y no rompen el contrato.
- El experimento modifica deliberadamente el dominio congelado del ADR-001,
  **solo en la copia aislada**; el árbol principal conserva el dominio
  original (verificado con `git status`/`git diff`).
- La comparación React/Angular mezcla archivos de estructura distinta
  (JSX co-ubicado vs .ts + .html); los números por framework son
  informativos, no de calidad.

## 23. Amenazas a la validez

- **Selección de migraciones**: elegidas por ser evoluciones reales del
  producto (estado bloqueado, hitos con fecha límite, salud de proyecto,
  trazabilidad del status); otra elección podría dar costes distintos.
- **Implementación manual**: el coste depende de quien migra; se mitiga con
  commits por estado y validaciones completas en cada paso.
- **Métricas de archivos/LOC** sensibles al estilo (React es más conciso en
  UI por JSX; Angular separa clase y template).
- **`unrelated_files_touched`** excluye servicios/adapters/app-shell por
  diseño (son consumidores legítimos del dominio); revisado manualmente.

## 24. Veredictos H53–H62

| Hipótesis                             | Veredicto      | Evidencia                                                                                                                                                                   |
| ------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H53 — Evolución localizada**        | **CONFIRMADA** | Los cambios afectan solo a consumidores legítimos; `unrelated_features_touched = 0` en las 4 migraciones.                                                                   |
| **H54 — Fuente única de verdad**      | **CONFIRMADA** | `getProjectHealth` (M3) tiene 1 implementación en el dominio y 5 consumidores; 0 reglas duplicadas detectadas.                                                              |
| **H55 — Aislamiento**                 | **CONFIRMADA** | 0 imports feature→feature en las 4 migraciones (React y Angular).                                                                                                           |
| **H56 — Breaking change detectable**  | **CONFIRMADA** | M4: 21 errores de typecheck en 11 archivos, todos en consumidores esperados, ninguno fuera del área; migración incremental con typecheck verde en cada paso.                |
| **H57 — Coste comparable**            | **CONFIRMADA** | React 19 archivos / +78 LOC vs Angular 24 archivos / +71 LOC en total; diferencias estructurales (ts+html vs tsx), no de capacidad.                                         |
| **H58 — Blast radius controlado**     | **CONFIRMADA** | El blast crece con los consumidores reales (M4: 38, 3 features que usan status), no por acoplamiento accidental (0 features no relacionadas).                               |
| **H59 — Sin shared genérico**         | **CONFIRMADA** | Ninguna migración introdujo capa `shared/` ni abstracción artificial; el dominio absorbió todo.                                                                             |
| **H60 — Recuperación arquitectónica** | **CONFIRMADA** | Estado final: 0 violaciones, 0 imports entre features, 0 duplicación, 0 dependencias nuevas; format/lint/typecheck/test/build verdes.                                       |
| **H61 — Tests como red de seguridad** | **CONFIRMADA** | 27 tests rotos en total, siempre en las áreas del cambio; los tests del dominio guiaron M2 y M4.                                                                            |
| **H62 — Complejidad de migración**    | **CONFIRMADA** | M4 (más complejo) afectó a más consumidores (29 archivos vs 10-17), pero sin complejidad específica de framework no presente en el otro (mismo patrón de errores en ambos). |

## 25. Comparación final

### Coste estructural

|                                            | React | Angular |   Δ |
| ------------------------------------------ | ----: | ------: | --: |
| Archivos modificados (total 4 migraciones) |    19 |      24 |  +5 |
| LOC prod añadidas                          |   +78 |     +71 |  −7 |
| Archivos en M4 (breaking)                  |     9 |      10 |  +1 |

### Coste contractual

|                                             |           React |         Angular |
| ------------------------------------------- | --------------: | --------------: |
| Errores typecheck en M4 (antes de corregir) | 10 (6 archivos) | 11 (5 archivos) |
| Consumidores del dominio (final)            |              13 |              12 |

### Coste de testing

|                           |           React |                                                 Angular |
| ------------------------- | --------------: | ------------------------------------------------------: |
| Tests rotos (total)       |              10 |                                                       8 |
| Tests modificados (total) |               7 |                                                       5 |
| Tests añadidos (total)    | 1 (integración) | 0 (el badge se verifica vía template en spec existente) |

### Coste arquitectónico

0 imports entre features · 0 duplicación · 0 dependencias nuevas · 0
violaciones en ambos.

**Diferencias significativas vs ruido:** la diferencia de archivos en M2
(4 vs 7) es estructural (template separada en Angular). Los 21 errores de
M4 se reparten casi por igual (10 vs 11). Nada sugiere una ventaja
arquitectónica de un framework sobre el otro en el coste de evolución del
dominio.

## 26. Conclusiones

1. **El coste de evolucionar el dominio es comparable entre React y Angular**
   cuando las responsabilidades arquitectónicas son equivalentes: el patrón
   de migración es el mismo (dominio → stores → UI → tests), los errores de
   tipo aparecen en los mismos lugares y la recuperación es igual de limpia.
2. **El breaking change (M4) es el de mayor blast radius (38)** pero es
   mecánico: TypeScript localiza los 21 consumidores rotos; la migración se
   hace incrementalmente. **La entidad nueva (M2) es la de mayor coste de
   diseño** (+278 LOC): modelo + regla + fixture + UI + tests.
3. **Las invariantes arquitectónicas se mantienen intactas**: 0 imports
   entre features, 0 duplicación, 0 dependencias, dominio como única fuente
   de verdad (H54) — incluso bajo el cambio más incómodo.
4. **El dominio absorbe la evolución sin `shared/` genérico**: la regla
   derivada y la entidad nueva viven en `packages/domain`; las apps solo
   consumen.
5. **Los tests guían la migración**: 27 tests rotos, todos localizados;
   ninguna feature no relacionada se rompió.
6. Las únicas diferencias React/Angular son de forma (archivos de template
   en Angular, aserciones de test en React), no de fondo. **No hay ganador
   global ni evidencia de superioridad en coste de evolución.**

## 27. Siguiente experimento

1. **Migración de dato con versión del contrato (v1 → v2 con códigos de
   estado nuevos y migración de fixture)** — el caso "evolucionar un
   producto en producción" completo: fixture versionado + migrador + validar
   que ambas apps consumen el nuevo contrato sin duplicar la lógica de
   migración.
2. **Rendimiento bajo el dominio evolucionado**: repetir Fase 9.1/9.2 con el
   dataset que ahora incluye milestones (el tamaño del DOM del detail cambia
   con la lista de hitos).
3. **Fallos de runtime post-migración (no detectables por typecheck)**:
   introducir un cambio que compile pero rompa invariantes de datos
   (p. ej. `status.changedAt` anterior a `createdAt`) y medir qué tests lo
   detectan y cuánto tarda la red de seguridad en fallar.
