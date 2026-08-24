# Fase 6 — Evolución del laboratorio: coste real de cambio

## 1. Objetivo

La Fase 5 comparó los monoliths estáticos (React y Angular) sobre el mismo contrato. La Fase 6 cambia la pregunta: **¿qué ocurre cuando el sistema cambia?**

Se diseñó y ejecutó un experimento controlado de evolución arquitectónica que mide el coste de introducir cambios reales en ambas implementaciones, manteniendo las fronteras, el aislamiento y la mantenibilidad definidos por ADR-001 y ADR-002. El objetivo no es declarar un framework ganador, sino medir el coste del cambio y comprobar si las propiedades arquitectónicas se mantienen bajo evolución.

Todas las hipótesis (H9–H13) se formularon **antes** de implementar los cambios. La evidencia se generó en una **copia aislada** del repositorio (`/tmp/lab-phase6`) con historial git propio; el árbol principal no se modificó.

## 2. Estado inicial

- **Baseline de Fase 6**: estado actual del laboratorio tras Fase 5 (contrato completo en ambas apps).
  - React Monolith: 233 547 B JS raw (84 tests).
  - Angular Monolith: 179 634 B JS raw (61 tests).
  - Domain: 104 tests (108 declaraciones `it(` contadas por el script).
- El baseline se congeló en el commit `e4f9f5f` de la copia experimental (copiada del árbol de trabajo actual, incluyendo el trabajo no commiteado de la Fase 5, verificado con `diff -r` y builds en verde).
- **Nota sobre worktrees**: el árbol principal tiene trabajo no commiteado (Fases 5–5.9), por lo que `git worktree` no es viable. Se usó una copia aislada con `git init` propio, que ofrece la misma garantía de no contaminación (patrón ya usado en Fases 5.3–5.8).

## 3. Hipótesis

Definidas antes de implementar (los nombres H9/H10 coinciden con hipótesis experimentales de Fases 5.5/5.6; aquí se redefinen en el contexto de evolución, no de bundle):

| ID  | Hipótesis                                                                                                                                                        | Criterio de confirmación                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| H9  | Añadir una nueva feature completa requiere un número **comparable** de cambios estructurales en React y Angular si las fronteras arquitectónicas funcionan.      | Misma feature en ambos; nº de archivos/LOC/tests del mismo orden; ambos tocan las mismas capas (app-shell, feature, integración, styles, tests). |
| H10 | Añadir una nueva regla de negocio al dominio requiere cambios **solo** en `packages/domain` y en las capas de integración necesarias, **sin duplicar** la regla. | Regla implementada una única vez en `packages/domain`; ambas apps la consumen desde el mismo export; sin lógica de negocio duplicada.            |
| H11 | Modificar un contrato compartido produce **errores localizados y detectables** en ambas implementaciones, sin propagación incontrolada entre features.           | Censo de typecheck: errores solo en el área esperada (dominio + stores); 0 errores en features; nº de archivos acotado.                          |
| H12 | Añadir una nueva feature **no introduce imports entre features existentes**.                                                                                     | Escaneo de imports de la nueva feature y de las modificadas: 0 imports hacia otras features en los 4 cambios.                                    |
| H13 | El coste de evolución es medible mediante indicadores objetivos (archivos, LOC, imports, dependencias, tests, build, bundle, errores, capas).                    | Todos los indicadores capturados de forma reproducible; `time_to_implement` se marca NO MEDIBLE si no es reproducible.                           |

Regla transversal: LOC es **solo volumen de cambio**, nunca calidad.

## 4. Metodología

- **Copia experimental**: `/tmp/lab-phase6`, clonada del árbol de trabajo (rsync sin `.git`/`node_modules`/`dist`; `node_modules` clonado con `cp -c` — el symlink relativo `@operations-hub/domain` apunta al dominio de la copia, permitiendo cambios de dominio aislados).
- **Historial git propio**: cada cambio se commitea en la copia (`baseline` → `c1-feature` → `c2-domain-rule` → `c4-feature-evolution` → `c3-contract-change`). Las métricas de cambio se calculan con `git diff --numstat/--stat` entre commits consecutivos (determinista).
- **Reconstrucción por estado**: `scripts/measure-evolution-phase6.mjs` hace checkout de cada commit, reconstruye `packages/domain` + ambas apps (cronometrado) y registra bundle raw/gzip.
- **Validación por experimento**: prettier, eslint, typecheck y tests en verde en cada estado (informados en el JSON y verificados durante la implementación).
- **Indicadores**: `files_added`, `files_modified`, `loc_added`, `loc_removed`, `tests_added`, `imports_added`, `cross_feature_imports`, `domain_changes`, `shared_changes`, `adapter_changes`, `dependencies_added`, `build_time`, `bundle_raw`, `bundle_gzip`, `typecheck_result`, `test_result`, `architecture_violations`.
- **Tiempos**: `time_to_implement` = **NO MEDIBLE** (trabajo manual no reproducible). `time_to_detect_contract_break` = tiempo de `tsc` en el censo C3 (reproducible).

## 5. Diseño experimental

| Cambio                                | Qué se hizo                                                                                                                                                                                                                                                                                                                                                          | Qué mide                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **CAMBIO 1 — Nueva feature**          | Feature **Favoritos** (idéntica en ambas apps): entrada de navegación (7ª área), listado de proyectos destacados con estado/propietario/equipo/% completado (vía `buildProjectReport`), estado local de UI (ids destacados en App, no en el store de dominio), interacción star en la lista de Projects, tests, reutilización de componentes compartidos existentes. | Coste de añadir una feature completa; ejercicio de fronteras (nav, store, dominio, integración). |
| **CAMBIO 2 — Nueva regla de dominio** | Regla `getProjectHealth(project, tasks)` añadida **una sola vez** en `packages/domain` (+tests de dominio) y consumida por la feature Favoritos de **ambas** apps.                                                                                                                                                                                                   | Coste de propagación de una regla compartida; no duplicación (ADR-001).                          |
| **CAMBIO 3 — Cambio de contrato**     | Cambio de firma `canTransitionProject(from, to)` → `canTransitionProject({ from, to })` en `packages/domain`, aplicado **sin arreglar callers**: censo de errores de typecheck en dos etapas (sin rebuild del dist / tras rebuild), luego adaptación.                                                                                                                | Detección y localización de errores de contrato; propagación entre capas.                        |
| **CAMBIO 4 — Evolución de feature**   | Modificar la feature Favoritos: añadir **filtro por estado** (reutilizando el servicio `filterProjects` existente, sin duplicar lógica) y **contador de tareas** por proyecto.                                                                                                                                                                                       | Coste de modificar código existente, no solo añadir.                                             |

Orden de ejecución en la copia: C1 → C2 → C4 → C3 (C3 al final para medir el censo sobre el estado más evolucionado y revertir limpiamente al estado funcional).

## 6. Cambio 1 — Nueva feature (Favoritos)

**Spec funcional (idéntica en ambas apps):**

- Nueva área **Favorites** en la navegación persistente (NAV-1), con `aria-current` y accesible por teclado.
- Lista de proyectos destacados: nombre, badge de estado, propietario, equipo y % completado (regla de dominio `buildProjectReport`).
- Estado vacío explícito ("No favorite projects yet…") y contador con `aria-live`.
- Interacción: botón **Star/Unstar** con `aria-pressed` en cada fila de la lista de Projects (integrado en la feature existente) y en la lista de Favoritos.
- Estado de UI `favoriteProjectIds` propiedad de **App** (ADR-002: estado de UI fuera del store de dominio), compartido por props/inputs — **sin imports entre features**.
- Orden ascendente por id; reutilización de componentes compartidos existentes (StatusBadge, EmptyState).

**Resultado (React):** 7 archivos (2 nuevos, 5 modificados), +368 LOC netas, +7 tests (84→91).
**Resultado (Angular):** 10 archivos (3 nuevos, 7 modificados), +376 LOC netas, +7 tests (61→68).
**Bundle:** React +1900 B raw (+0,8 %); Angular +3639 B raw (+2,0 %).

## 7. Cambio 2 — Nueva regla de dominio

**`getProjectHealth(project, tasks): 'healthy' | 'at-risk' | 'critical' | 'unknown'`** en `packages/domain/src/project-health.ts` (función pura derivada, mismo convenio de cálculo que `reports.ts`; sin tocar fixture, tipos de entidad ni máquinas de estado).

- **Una sola implementación**; exportada desde `index.ts` (única vía de acceso, ADR-001).
- **6 tests de dominio** nuevos (`project-health.test.ts`): casos límite (0/60/30 %) + valores del fixture real (project-002 healthy, project-005 at-risk, project-001 critical, project-006 unknown).
- **Consumida por ambas apps** en Favoritos (misma posición: la página/componente llama a `getProjectHealth` con datos del store; sin duplicar la regla).
- **Coste de propagación:** domain 3 archivos (regla + test + export) · React 2 archivos · Angular 3 archivos (componente .ts + .html + .spec). **Ninguna otra feature afectada.**
- Bundle: React +367 B; Angular +696 B.

## 8. Cambio 3 — Cambio de contrato

**Cambio:** `canTransitionProject(from: ProjectStatus, to: ProjectStatus)` → `canTransitionProject({ from, to })`.

**Censo de detección (datos reales de `tsc`, reproducidos en el JSON):**

| Etapa                                          | Domain                                                                                                                   | React                                      | Angular                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Sin rebuild del dist (frontera de paquete)     | **5 errores** (2 archivos: caller interno `validation.ts` + tests de dominio) — **el build del dominio queda bloqueado** | 0 errores                                  | 0 errores                                  |
| Tras arreglar caller interno + rebuild de dist | 0                                                                                                                        | **1 error** (1 archivo: `domain-store.ts`) | **1 error** (1 archivo: `domain.store.ts`) |

- **Total: 7 errores en 5 archivos**; **0 errores fuera del área esperada**; **0 features afectadas**.
- **Tiempo de detección:** dominio 425 ms · React 863 ms · Angular 419 ms (typecheck, reproducible).
- **Hallazgo de frontera:** las apps consumen el **dist** del dominio (`exports` de package.json), no el src: un cambio de contrato **no rompe a los consumidores hasta que el dominio se reconstruye**, y el build del dominio se bloquea por sus propios errores internos (caller interno + tests). La propagación está acotada por la frontera del paquete.
- **Adaptación:** 5 archivos (definición, caller interno del dominio, tests de dominio, store React, store Angular) — +19/−9 LOC. Bundle: +26 B ambos (ruido ≈ 0).
- Verificado: tras la adaptación, typecheck, 109 tests de dominio, 93 de React y 70 de Angular en verde.

## 9. Cambio 4 — Evolución de feature

Modificación de la feature Favoritos existente (no añadir otra):

- **Filtro por estado** (All/Planned/Active/Completed): estado local de la feature; **reutiliza el servicio `filterProjects` existente** (0 lógica de filtrado duplicada).
- **Contador de tareas** por proyecto derivado de `dataset.tasks`.
- Dos estados vacíos diferenciados: sin favoritos (mensaje original) vs filtro sin resultados.
- Resultados: React 3 archivos / +81 LOC / +2 tests; Angular 4 archivos (componente .ts + .html + .spec + app.spec) / +81 LOC / +2 tests.
- Bundle: React +721 B; Angular +950 B.

## 10. React — resultados

| Estado              | Archivos feature | Tests  |               JS raw |       gzip | Build (1 ejec.) |
| ------------------- | ---------------- | ------ | -------------------: | ---------: | --------------: |
| baseline            | —                | 84     |            233 547 B |   68 572 B |          187 ms |
| +C1                 | 7 (2+5)          | 91     |            235 447 B |   68 997 B |          191 ms |
| +C2                 | 2                | 91     |            235 814 B |   69 130 B |          185 ms |
| +C4                 | 3                | 93     |            236 535 B |   69 201 B |          184 ms |
| +C3                 | 1                | 93     |            236 561 B |   69 227 B |          189 ms |
| **Total evolución** | **10 (2+8)**     | **+9** | **+3014 B (+1,3 %)** | **+655 B** |         ~190 ms |

## 11. Angular — resultados

| Estado              | Archivos feature | Tests  |               JS raw |        gzip | Build (1 ejec.) |
| ------------------- | ---------------- | ------ | -------------------: | ----------: | --------------: |
| baseline            | —                | 61     |            179 634 B |    53 485 B |         1800 ms |
| +C1                 | 10 (3+7)         | 68     |            183 273 B |    54 165 B |         2083 ms |
| +C2                 | 3                | 68     |            183 969 B |    54 351 B |         1873 ms |
| +C4                 | 4                | 70     |            184 919 B |    54 499 B |         1833 ms |
| +C3                 | 1                | 70     |            184 945 B |    54 526 B |         1837 ms |
| **Total evolución** | **13 (3+10)**    | **+9** | **+5311 B (+3,0 %)** | **+1041 B** |        ~1870 ms |

## 12. Comparación

| Métrica                            |            React |          Angular |                                                  Diferencia |
| ---------------------------------- | ---------------: | ---------------: | ----------------------------------------------------------: |
| C1 archivos (nuevos + modificados) |          7 (2+5) |         10 (3+7) |          Angular +3 (separación .ts/.html + spec de wiring) |
| C1 LOC netas                       |             +368 |             +376 |                                               ~igual (+2 %) |
| C1 tests añadidos                  |               +7 |               +7 |                                                    idéntico |
| C2 archivos (sin domain)           |                2 |                3 |                                       Angular +1 (template) |
| C2 LOC (sin domain)                |              +12 |              +16 |                                                      ~igual |
| C4 archivos                        |                3 |                4 |                                       Angular +1 (template) |
| C4 LOC                             |              +81 |              +81 |                                                **idéntico** |
| C3 archivos a adaptar              |        1 (store) |        1 (store) |              **idéntico** (además 3 compartidos de dominio) |
| C3 errores typecheck               |                1 |                1 |                                                **idéntico** |
| Bundle total evolución             | +3014 B (+1,3 %) | +5311 B (+3,0 %) | Angular +1,8× (coherente con Fase 5: más bytes por feature) |
| Build (1 ejecución, indicativo)    |          ~190 ms |         ~1870 ms |             Angular ~10× (toolchain, ya conocido de Fase 5) |
| Dependencias nuevas                |                0 |                0 |                                                    idéntico |
| Imports entre features             |                0 |                0 |                                                    idéntico |
| Violaciones de arquitectura        |                0 |                0 |                                                    idéntico |

**Lectura:** el **coste estructural es comparable** (LOC casi idénticas en C1 y C4; tests idénticos; C3 simétrico). Las diferencias de archivos (Angular +1/+3) son la separación template/lógica y el wiring de Angular, no complejidad adicional. El coste de **bundle por cambio es mayor en Angular** (misma causa medida en Fase 5: coste AOT por template) y el **build loop es ~10× más lento** en Angular (toolchain, sin cambios en esta fase).

## 13. Arquitectura

Se verificó en cada estado que la evolución mantiene:

- **Dependencia unidireccional**: feature → store/adapter → domain. Ningún cambio invirtió la dirección.
- **0 imports entre features**: escaneado automáticamente en los 4 experimentos (React 0, Angular 0). La integración Projects↔Favorites se hace vía App (props/inputs), nunca vía imports.
- **Dominio independiente**: solo C2 y C3 lo tocaron (regla nueva / firma); C1 y C4 no. Ningún cambio introdujo React/Angular en `packages/domain`.
- **Ausencia de shared genérico**: no se creó ninguna capa shared; se reutilizaron los componentes compartidos existentes (StatusBadge, EmptyState).
- **Fronteras de adapter**: sin cambios en adapters (la feature consume datos vía store/adapter existente).
- **Sin lógica de negocio duplicada**: C2 implementa la regla una vez; las apps solo la llaman. El filtro de C4 reutiliza `filterProjects` (servicio de presentación existente en cada app — duplicación deliberada de UI, no de negocio, ya documentada en ADR-002).
- **Estado de UI vs dominio**: `favoriteProjectIds` y `statusFilter` son estado de UI (App/feature), no entraron en el store de dominio (ADR-002).

**Violaciones encontradas: 0.** Ninguna decisión ADR quedó comprometida por la evolución; no procede modificar ADR-001 ni ADR-002.

## 14. Coste de cambio

| Indicador               |         C1 |         C2 |         C4 |                                            C3 | Total |
| ----------------------- | ---------: | ---------: | ---------: | --------------------------------------------: | ----: |
| files_added             |          5 |          2 |          0 |                                             0 |     7 |
| files_modified          |         12 |          6 |          7 |                                             5 |    30 |
| loc_added               |        686 |        150 |        139 |                                            19 |   994 |
| loc_removed             |         58 |          4 |         23 |                                             9 |    94 |
| tests_added             |         14 |          6 |          4 |                                             0 |    24 |
| imports_added           |          7 |          4 |          0 |                                             0 |    11 |
| dependencies_added      |          0 |          0 |          0 |                                             0 | **0** |
| cross_feature_imports   |          0 |          0 |          0 |                                             0 | **0** |
| domain_changes          |          0 |          3 |          0 |                                             3 |     6 |
| shared_changes          | 2 (styles) |          0 |          0 |                                             0 |     2 |
| adapter_changes         |          0 |          0 |          0 |                                             0 | **0** |
| architecture_violations |          0 |          0 |          0 |                                             0 | **0** |
| errors typecheck C3     |          — |          — |          — |                                7 (5 archivos) |     7 |
| time_to_implement       | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE |                                    NO MEDIBLE |     — |
| time_to_detect (C3)     |          — |          — |          — | domain 425 ms · react 863 ms · angular 419 ms |     — |

## 15. Escalabilidad

- El coste incremental de cada tipo de cambio es **pequeño, localizado y predecible**: ninguna evolución tocó más de 2 features (C1 tocó Projects solo para la integración del star; C2/C3/C4 tocaron únicamente Favoritos + dominio cuando correspondía).
- **C3 es la señal más fuerte**: un cambio de contrato compartido produce exactamente 1 error por store (React y Angular simétricos) + errores internos del dominio, y **cero** en las 6 features. La frontera del paquete (`dist` + `exports`) acota la propagación: los consumidores solo se rompen cuando el dominio se reconstruye.
- No se observó ninguna diferencia de escalabilidad entre frameworks en estas cargas (una feature, una regla, una evolución, un cambio de contrato). El coste por feature en bytes sigue favoreciendo a React (coherente con Fase 5), pero el coste **estructural** (archivos/LOC/tests/errores) es equivalente.

## 16. Mantenibilidad

Evidencia observable, sin puntuación subjetiva:

- **Tamaño de cambios**: todos los experimentos ≤ 686 LOC añadidas y ≤ 12 archivos; la feature completa de Favoritos (la mayor) pesa ~370 LOC por framework.
- **Localización**: cada cambio se mantuvo dentro de su capa (feature + app-shell para UI; domain para reglas/contrato). Ningún cambio requirió tocar features no relacionadas.
- **Tests acompañantes**: +24 tests totales (14 C1, 6 C2, 4 C4); ningún test existente se rompió sin motivo (los ripples de tests en C1 fueron por la nueva interacción star en las filas — se ajustaron los selectores, no la lógica).
- **Reducción de duplicación**: C2 y C4 reutilizaron funciones existentes del dominio (`buildProjectReport`) y de presentación (`filterProjects`) en lugar de duplicar.
- **Conclusión**: ambas arquitecturas absorben los 4 tipos de cambio sin degradar sus fronteras. No hay evidencia de que una requiera más mantenimiento que la otra para estos cambios.

## 17. Limitaciones

1. **`build_time` de 1 ejecución por estado**: indicativo, puede incluir ruido; no se usó mediana de 3 (coste de 5 estados × 2 apps). Las diferencias de ~~10× entre frameworks superan ampliamente el ruido; las diferencias intra-framework (~~±200 ms Angular) no son concluyentes.
2. **`time_to_implement` NO MEDIBLE**: el trabajo manual no es reproducible; no se reporta como dato.
3. **`tests_added` por heurística**: conteo de declaraciones `it(` (un `it.each` cuenta 1); los totales por runner (93/70/109) son la fuente de verdad.
4. **`imports_added` por heurística** sobre líneas `import` de archivos .ts/.tsx.
5. **Un solo feature de muestra**: Favoritos es representativa (nav + UI + estado + dominio + interacción + tests) pero no cubre todos los patrones posibles (p. ej. formularios con validación profunda, tablas de reports).
6. **C3 midió un solo tipo de cambio de contrato** (firma de función). Cambios de tipo de entidad o de fixture tendrían un radio distinto (no medido).
7. **El dist de `packages/domain` no se commitea** (gitignored): las reconstrucciones del script regeneran el dominio en cada estado; el censo C3 de "sin rebuild" se capturó manualmente durante el experimento (archivo `--c3-census`).

## 18. Amenazas a la validez

- **Implementación única**: el experimento lo implementó una sola persona (el agente) siguiendo los patrones existentes de cada app. Otra implementación podría diferir en LOC/archivos ±20 %. Se mitigó implementando la feature con la misma spec y usando exactamente los mismos componentes/patrones en ambos frameworks.
- **Efecto del orden**: C1→C2→C4→C3 es un orden natural de evolución; C3 al final permitió medir el censo sobre el estado más evolucionado, pero el censo no depende del estado (la firma se usa igual).
- **Comparación de bundles entre frameworks**: los builds usan toolchains distintas (Vite/Rolldown vs Angular); los deltas son internos a cada framework y comparables en tanto miden el mismo cambio, pero los absolutos no son comparables entre sí (ya establecido en Fase 5).
- **Ruido de build**: 1 ejecución por estado; no se puede descartar ±5 % de ruido en los tiempos.
- **El censo C3 depende de `tsc`**: los tiempos son de esta máquina (Apple M1); los recuentos de errores son deterministas del código.

## 19. Estado de H9+

| Hipótesis                               | Veredicto                                 | Evidencia                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H9 — Nueva feature comparable**       | **CONFIRMADA**                            | React 7 archivos / +368 LOC / +7 tests vs Angular 10 archivos / +376 LOC / +7 tests. Mismas capas tocadas (app-shell, feature, integración Projects, styles, tests). La diferencia de archivos es la separación template/lógica de Angular.                     |
| **H10 — Regla de dominio sin duplicar** | **CONFIRMADA**                            | `getProjectHealth` implementada 1 vez en `packages/domain` (regla + 6 tests + export); ambas apps la consumen desde el mismo export; coste de integración: 2 archivos React / 3 Angular; 0 lógica duplicada. ADR-001 intacto.                                   |
| **H11 — Cambio de contrato localizado** | **CONFIRMADA** (con hallazgo de frontera) | 7 errores en 5 archivos, todos en el área esperada; 0 errores en features; 0 errores fuera del área. Hallazgo: la frontera `dist`/`exports` retrasa la detección en las apps hasta el rebuild del dominio (propiedad del paquete compartido, no del framework). |
| **H12 — Aislamiento**                   | **CONFIRMADA**                            | 0 imports entre features escaneados en los 4 experimentos (React y Angular). La integración Favoritos↔Projects se hace vía App.                                                                                                                                 |
| **H13 — Coste medible**                 | **CONFIRMADA**                            | 15 indicadores objetivos capturados de forma reproducible (git numstat/stat, conteos, builds, bundle, censo tsc). `time_to_implement` marcado NO MEDIBLE según la regla. Dependencias nuevas: 0.                                                                |

## 20. Conclusión crítica

**HECHO MEDIDO**

- El coste estructural de evolución es **equivalente** entre React y Angular: C1 +368 vs +376 LOC, C4 +81 vs +81 LOC, tests idénticos (+7/+7, +2/+2), C3 simétrico (1 error y 1 archivo por store).
- El coste de **bundle por cambio es ~1,8× mayor en Angular** (coherente con el coste AOT medido en Fase 5); el **build loop es ~10× más lento** en Angular.
- **0 dependencias nuevas, 0 imports entre features, 0 violaciones de arquitectura** en los 4 cambios.
- Un cambio de contrato compartido produce errores **localizados** (5 archivos, 7 errores) con detección en < 1 s por framework una vez el dominio se reconstruye.

**INFERENCIA**

- Las fronteras arquitectónicas (ADR-001/ADR-002) **funcionan bajo evolución**: los cambios se mantienen en su capa y el radio de impacto es predecible.
- La duplicación deliberada de integración (ADR-002) no produjo coste extra observable en estos cambios: ambas apps integraron la regla y el contrato con el mismo número de archivos.

**HIPÓTESIS (no demostrada)**

- Que la diferencia de bundle por feature crezca linealmente con el número de features (se observó en 1 feature; se necesitaría una segunda feature para confirmar).

**NO SABEMOS**

- El coste de cambiar una **entidad** o el **fixture** (radio de impacto distinto al de una firma de función).
- El coste de una feature con **formularios profundos** (validación multi-campo) o con nueva integración de adapter/API.
- `time_to_implement` real (no medible en este laboratorio de forma reproducible).

**Qué aprendimos que la Fase 5 no podía demostrar:** la Fase 5 comparó sistemas estáticos; la Fase 6 demuestra que las propiedades clave (aislamiento entre features, dominio compartido sin duplicación, localización de errores de contrato) **se mantienen cuando el sistema cambia**, y que el coste estructural del cambio es equivalente entre frameworks, con la diferencia de bundle/build ya caracterizada.

## 21. Reproducibilidad

- **Entorno**: `/tmp/lab-phase6` (copia del árbol de trabajo + `node_modules` clonado; commits `e4f9f5f`…`82b9564`).
- **Script**: `scripts/measure-evolution-phase6.mjs <copy> [--c3-census=<file>]` — checkout por estado, rebuild dominio + apps cronometrado, bundle raw/gzip, métricas git por experimento, censo C3, escribe `docs/experiments/results/evolution-phase6.json`.
- **Script npm**: `pnpm evolution:measure` (requiere la ruta del copy).
- **JSON**: evidencia cruda completa (commits, estados, bundles, experimentos, censo, limitaciones).
- **Idempotencia**: el script resuelve SHAs por mensaje de commit y re-ejecuta las reconstrucciones; el resultado es determinista dado el mismo copy.
- **Nota**: el JSON generado incluye los datos de reconstrucción automática; el censo C3 se fusiona desde un archivo de censo capturado durante el experimento (los conteos de errores no son reproducibles sin re-aplicar el cambio).

## 22. Siguiente experimento

1. **Segunda feature con formulario profundo** (validación multi-campo + nueva interacción): confirma si el coste por feature de bundle es lineal y si los formularios alteran la paridad estructural.
2. **Cambio de entidad/fixture** (p. ej. nuevo campo obligatorio en `Task`): mide el radio de impacto de un cambio de datos, distinto del de una firma.
3. **Cierre de H6/H7 con los datos de esta fase**: la comparación de DX (archivos/pasos por feature) y código (LOC por feature) ahora tiene evidencia experimental de coste incremental, no solo estático.
