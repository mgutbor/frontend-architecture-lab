# Fase 8 — Escalabilidad arquitectónica bajo crecimiento controlado

## 1. Objetivo

Determinar si las propiedades arquitectónicas y de coste observadas en las fases anteriores (Fase 5: estática; Fase 6: evolución; Fase 7: interacción) **se mantienen, empeoran o divergen cuando el sistema crece**. El laboratorio pasa de 6 a 16 áreas funcionales añadiendo 10 features de catálogo de forma incremental, con el mismo contrato funcional en React y Angular, y se mide en cada nivel intermedio.

La pregunta experimental:

> "Cuando este sistema pasa de 1 a 10 features, ¿qué propiedades se mantienen constantes y dónde empieza a divergir React de Angular?"

## 2. Contexto

- **Fase 5**: comparación estática (bundle, build, tests, arquitectura, accesibilidad, Lighthouse). H1–H8 evaluadas; sin ganador global.
- **Fase 6**: coste real de cambio (nueva feature, regla de dominio, cambio de contrato, evolución) en copia aislada. Coste estructural equivalente; bundle Angular ~1,8× por cambio.
- **Fase 7**: rendimiento bajo interacción. Latencia percibida equivalente; React ~6–9× más trabajo síncrono por evento de lista; 0 long tasks.
- Pregunta abierta acumulada: **¿las propiedades se mantienen cuando el sistema crece?**

## 3. Hipótesis (pre-registradas antes de implementar)

| ID      | Hipótesis                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| **H19** | El aislamiento entre features y la dirección de dependencias se mantienen cuando aumenta el número de features.            |
| **H20** | El coste estructural de añadir features crece de forma aproximadamente comparable entre React y Angular.                   |
| **H21** | El crecimiento de features no provoca duplicación de lógica de negocio cuando las reglas pertenecen al dominio compartido. |
| **H22** | El tiempo de build mantiene una relación aproximadamente estable con el crecimiento o aparece una divergencia medible.     |
| **H23** | El coste incremental de bundle de las nuevas features mantiene una relación estable o aparece una divergencia medible.     |
| **H24** | El crecimiento de la suite de tests mantiene una evolución comparable entre ambos frameworks.                              |
| **H25** | El aumento de features no provoca un crecimiento inesperado de imports entre features ni de dependencias transversales.    |
| **H26** | Una modificación posterior de una feature existente sigue localizada después de que el sistema haya crecido.               |

Veredictos posibles: CONFIRMADA / REFUTADA / NO CONCLUYENTE. No se fuerza ningún resultado.

## 4. Diseño experimental

- **Escalera de crecimiento** en copia aislada (`/tmp/lab-phase8`, clonado APFS, git propio, 7 commits congelados).
- Cada feature nueva es un **catálogo** con la misma plantilla en ambos frameworks: entrada de navegación, UI (lista + detalle), estado local (búsqueda live + filtro de estado + selección), consumo de datos y reglas de `@operations-hub/domain`, tests, y una interacción real (búsqueda/filtro/selección).
- **Dominio compartido**: un módulo `catalogs` en `packages/domain` (entidades deterministas que referencian el fixture real + reglas compartidas `countByStatus`/`openCount`/`completionRatio`). Las apps consumen las reglas desde el paquete; nunca se duplican.
- **Control**: mismo dataset, mismas reglas, mismas operaciones, número de tests similar por feature (4 por framework), mismo toolchain, misma máquina y sesión. No se añade ninguna dependencia.

## 5. Niveles de crecimiento

| Nivel   | Commit            | Features acumuladas |                                                  Features añadidas |
| ------- | ----------------- | ------------------: | -----------------------------------------------------------------: |
| LEVEL 0 | `baseline`        |                   0 |                                       — (estado Fase 5/7: 6 áreas) |
| LEVEL 1 | `c1-level1`       |                   1 |                                                   Milestones (F01) |
| LEVEL 2 | `c2-level2`       |                   3 |                                          Issues (F02), Notes (F03) |
| LEVEL 3 | `c3-level3`       |                   5 |                                            Tags (F04), Risks (F05) |
| LEVEL 4 | `c4-level4`       |                  10 | Deliverables, Audit log, Watchers, Budget lines, Sprints (F06–F10) |
| MOD     | `c5-modification` |                  10 |   Experimento de modificación (regla `countOverdue` en Milestones) |
| PRS     | `c6-pressure`     |                  10 |      Escenario de presión (componente compartido `CatalogToolbar`) |

## 6. Contrato funcional

Cada feature F01–F10 implementa, en React y Angular, exactamente el mismo contrato:

- Entrada de navegación persistente (NAV-1) con `aria-current` en el área activa.
- Lista del catálogo (6 ítems deterministas por entidad) ordenada por id.
- Búsqueda live case-insensitive que casa con cualquier campo de texto del ítem.
- Filtro por estado (`planned`/`active`/`completed`) combinado con la búsqueda (AND).
- Contador de resultados derivado de reglas del dominio (`completionRatio`/`openCount`/`countByStatus`).
- Detalle del ítem seleccionado que resuelve entidades reales del fixture (proyectos, usuarios y, en Sprints, tareas reales).
- Estado vacío explícito cuando no hay coincidencias; `aria-live` en el contador.
- Tests por feature: 4 (lista, búsqueda, filtro, detalle) en cada framework.

## 7. Metodología

- Script reproducible: `scripts/measure-scalability-phase8.mjs <copy>`.
- Por cada estado: checkout del commit → build del dominio + ambas apps (temporizado) → bundle raw/gzip → tests de las 3 suites (temporizados) → métricas git (LOC, archivos, tests por `it()`, imports, violaciones cross-feature, deps).
- 1 ejecución por estado (7 estados × 3 builds × 3 suites); la **tendencia de crecimiento** es el señal principal; los tiempos absolutos son indicativos (no mediana de 3).
- Comparación siempre **nivel contra nivel anterior** (incremental) y **absoluto** por separado.

## 8. Métricas

Por nivel: LOC producción/tests, número de archivos, features, imports entre features, imports de dominio, dependencias (runtime/transitivas), bundle raw/gzip, build time, test count, test time, ratio tests/código, duplicación, violaciones arquitectónicas. Derivadas: coste por feature, coste marginal por feature (LOC/bundle/tests), crecimiento acumulado, coste de modificación, coste de capacidad compartida. `time_to_implement` humano: **NO MEDIBLE** (no reproducible); no se reporta.

## 9. Resultados LEVEL 0 (baseline)

|                        |     React |   Angular |
| ---------------------- | --------: | --------: |
| LOC producción         |     2 182 |     2 296 |
| Tests                  |        84 |        61 |
| Bundle raw             | 233 547 B | 179 634 B |
| Build                  |   ~198 ms | ~1 814 ms |
| Test suite             |    ~2,6 s |    ~3,0 s |
| Imports entre features |         0 |         0 |
| Imports de dominio     |        20 |           |

## 10. Resultados LEVEL 1 (+1 feature: Milestones)

|              |    React |  Angular |
| ------------ | -------: | -------: |
| Δ LOC prod   |     +138 |     +144 |
| Δ bundle raw | +3 117 B | +3 891 B |
| Δ tests      |       +6 |       +6 |
| Δ build      |   −11 ms |   +73 ms |

Primera feature: ambos frameworks tocan las mismas capas (dominio + feature + app-shell + tests). Angular usa ~2 archivos más por feature (template + wiring), no más lógica.

## 11. Resultados LEVEL 2 (+2: Issues, Notes — 3 acumuladas)

|              |    React |  Angular |
| ------------ | -------: | -------: |
| Δ LOC prod   |     +204 |     +215 |
| Δ bundle raw | +5 848 B | +7 398 B |
| Δ tests      |       +9 |       +8 |

## 12. Resultados LEVEL 3 (+2: Tags, Risks — 5 acumuladas)

|              |    React |  Angular |
| ------------ | -------: | -------: |
| Δ LOC prod   |     +192 |     +202 |
| Δ bundle raw | +5 085 B | +6 543 B |
| Δ tests      |       +8 |       +8 |

## 13. Resultados LEVEL 4 (+5: Deliverables, Audit log, Watchers, Budget lines, Sprints — 10 acumuladas)

|              |     React |   Angular |
| ------------ | --------: | --------: |
| Δ LOC prod   |      +512 |      +556 |
| Δ bundle raw | +14 136 B | +18 345 B |
| Δ tests      |       +20 |       +20 |

El nivel más grande (5 features) mantiene el mismo coste por feature que los niveles anteriores (sin discontinuidad).

## 14. Curvas de crecimiento

| Nivel | Features | LOC prod R | LOC prod A | Bundle R | Bundle A | Tests R | Tests A |
| ----: | -------: | ---------: | ---------: | -------: | -------: | ------: | ------: |
|     0 |        0 |      2 182 |      2 296 |  233 547 |  179 634 |      84 |      61 |
|     1 |        1 |      2 320 |      2 440 |  236 664 |  183 525 |      90 |      67 |
|     2 |        3 |      2 524 |      2 655 |  242 512 |  190 923 |      99 |      75 |
|     3 |        5 |      2 716 |      2 857 |  247 597 |  197 466 |     107 |      83 |
|     4 |       10 |      3 228 |      3 413 |  261 733 |  215 811 |     127 |     103 |

Crecimiento total (L0→L4): LOC prod React **+1 046 (+48 %)** vs Angular **+1 117 (+49 %)**; bundle React **+28 186 B (+12 %)** vs Angular **+36 177 B (+20 %)**; tests React **+43** vs Angular **+42**.

Coste marginal por feature (promedio L1–L4): React ~105 LOC prod / ~2,8 kB / 4,3 tests; Angular ~111 LOC prod / ~3,6 kB / 4,2 tests.

**Tendencias**: LOC y tests crecen casi en paralelo; el bundle Angular crece ~1,3× por feature frente a React (coherente con el coste de templates AOT medido en Fases 5.5/5.6); el build de React permanece plano (~190 ms) y el de Angular crece suavemente (+17 %).

## 15. React vs Angular

- **Coste estructural**: equivalente. LOC prod por feature ~105 vs ~111 (Δ ~6 %), tests por feature 4,3 vs 4,2, archivos por feature 3 vs 4 (la diferencia es template + wiring de Angular).
- **Bundle incremental**: Angular ~1,3× por feature. No divergencia: la relación se mantiene constante en los 4 niveles.
- **Build**: React plano; Angular crece modestamente (+17 % acumulado) pero sigue ~10× por encima (toolchain, ya caracterizado en Fase 5).
- **Test time**: React +90 % (2,6→4,9 s) vs Angular +14 % (3,0→3,4 s). El crecimiento de la suite penaliza más el runner de React (rendering de testing-library), a igual número de tests.
- **Dominio**: el consumo de `@operations-hub/domain` crece de 20 a 48 imports en total (2 apps); el dominio crece +589 LOC (+78 %) y +27 tests, una sola vez (ADR-001 intacto).

## 16. Experimento de modificación (c5, tras crecer a 10 features)

Cambio controlado sobre una feature existente (Milestones): nueva regla de dominio `countOverdue` (un milestone pasa a estar vencido, `dueInDays: -4`) + contador derivado en la cabecera + tests.

- **Archivos tocados: 8** (5 de la feature Milestones en ambas apps + 2 de dominio `milestones.ts`/`index.ts` + 1 test de dominio).
- **Localizado**: sí — 0 archivos fuera de la feature + dominio (verificado: `localizedToMilestones = true`).
- LOC: +42. Bundle: React +77 B, Angular +401 B. Tests: +1 (dominio).
- **H26**: el cambio posterior al crecimiento sigue contenido en su capa; typecheck/test detectan solo el área esperada.

## 17. Escenario de presión (c6, tras crecer a 10 features)

Introducción controlada de una **capacidad compartida**: componente `CatalogToolbar` (búsqueda + filtro de estado) en `components/` de ambas apps, consumido por las 10 features (refactor del toolbar inline repetido).

- Archivos: 33 (3 del componente compartido + 30 de features).
- LOC: +292 neto (el refactor sustituye markup repetido).
- Bundle: **negativo** — React −5 083 B, Angular −1 845 B. La deduplicación del control compartido **reduce** el bundle en ambos frameworks (más en React: el markup inline se compilaba una vez por página).
- Tests: 0 añadidos, 0 rotos (los ids/labels se conservan).
- **No indujo** shared genérico innecesario (reuso real: 10 consumidores), ni acoplamiento (el componente está en `components/`, no importa features), ni dependencias transversales (0 imports entre features tras el refactor).

## 18. Análisis arquitectónico

| Propiedad                              | L0  | L1  | L2  | L3  | L4  | c6              |
| -------------------------------------- | --- | --- | --- | --- | --- | --------------- |
| Imports entre features (React/Angular) | 0   | 0   | 0   | 0   | 0   | 0               |
| Dependencias nuevas                    | —   | 0   | 0   | 0   | 0   | 0               |
| Reglas de negocio duplicadas en apps   | 0   | 0   | 0   | 0   | 0   | 0               |
| Violaciones de ADR-001/ADR-002         | 0   | 0   | 0   | 0   | 0   | 0               |
| Shared genérico innecesario            | no  | no  | no  | no  | no  | no (reuso real) |

- Dependencia unidireccional `feature → services → domain` y `feature → domain` se mantiene en los 10 catálogos.
- Las reglas de negocio viven una sola vez en `packages/domain` (shared + per-feature como `countOverdue`); las apps solo las importan (H21).
- El estado de cada catálogo es UI local (query/filtro/selección); el estado de dominio no se toca (ADR-002).
- No se modificó ningún ADR; la evidencia los valida bajo crecimiento.

## 19. Veredictos H19–H26

| Hipótesis                         | Veredicto                  | Evidencia                                                                                                                                                                         |
| --------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H19 — Aislamiento estructural** | **CONFIRMADA**             | 0 imports entre features en los 7 estados (escaneo automático de las 16 áreas); dependencia unidireccional intacta.                                                               |
| **H20 — Coste comparable**        | **CONFIRMADA**             | LOC prod por feature 105 vs 111 (Δ ~6 %); tests por feature 4,3 vs 4,2; mismas capas tocadas en los 4 niveles.                                                                    |
| **H21 — Dominio compartido**      | **CONFIRMADA**             | Las 10 features consumen las reglas de `packages/domain` (48 imports en L4); 0 duplicación; `countOverdue` (c5) añadida una sola vez.                                             |
| **H22 — Build**                   | **CONFIRMADA** (con matiz) | React plano (~190 ms); Angular +17 % acumulado (1 814→2 125 ms). La relación ~10× se mantiene; no hay divergencia que cambie el orden de magnitud.                                |
| **H23 — Bundle**                  | **CONFIRMADA**             | Coste por feature estable en los 4 niveles (React 2,5–3,1 kB; Angular 3,3–3,9 kB); Angular consistentemente ~1,3×; sin divergencia.                                               |
| **H24 — Tests**                   | **CONFIRMADA**             | Crecimiento de la suite casi idéntico (+43 vs +42 tests). Matiz: el tiempo de suite crece +90 % en React vs +14 % en Angular (rendering jsdom más caro), a igual número de tests. |
| **H25 — Acoplamiento**            | **CONFIRMADA**             | 0 imports entre features en todos los niveles; 0 dependencias nuevas (6 transiciones verificadas por diff de package.json); sin dependencias transversales.                       |
| **H26 — Evolución localizada**    | **CONFIRMADA**             | c5 tocó 8 archivos, todos en la feature Milestones + dominio; c6 tocó features + `components/`, sin acoplamiento.                                                                 |

## 20. Amenazas a la validez

- Las 10 features comparten una plantilla (catálogo); miden **crecimiento con patrón repetible**, no la creatividad de implementar features heterogéneas. Es intencional (la escalera mide crecimiento, no diversidad), pero no cubre features con estado compartido entre features ni integraciones nuevas con el adapter.
- Los catálogos son datos de referencia de solo lectura: no ejercen mutaciones de estado de dominio bajo crecimiento.
- Build/test time: 1 ejecución por estado; puede haber ruido del sistema (tendencia = señal primaria).
- El test time de Angular usa el builder `@angular/build:unit-test` (vitest); el de React usa vitest directo. Asimetría de runner documentada.
- La medición del bundle es raw (un chunk por app); no se descompone por feature (eso perteneció a Fase 5.8).

## 21. Limitaciones

- `time_to_implement` humano: NO MEDIBLE (trabajo manual, no reproducible).
- Dependencias transitivas: no medidas por estado (sin cambios: 0 dependencias añadidas, lockfile intacto).
- No se midió rendimiento bajo interacción con el dataset 10× (recomendado en Fase 7); los catálogos no añaden interacciones pesadas.
- No se ejecutó Lighthouse sobre los estados de crecimiento (solo se modificó el DOM de catálogos; la accesibilidad de la Fase 5.9 sigue siendo la referencia).
- El escenario de presión introduce UNA capacidad compartida; no cubre la decisión de extraer shared bajo presión con conflictos de diseño.

## 22. Qué NO podemos concluir

- No podemos concluir que "React escala mejor" por tener menor bundle incremental: el bundle absoluto de Angular sigue siendo menor y la relación por feature es estable, no divergente.
- No podemos concluir que "Angular escala peor en build": su build crece +17 % pero sigue siendo un coste de toolchain constante, no una degradación de la arquitectura.
- No podemos concluir que el crecimiento hasta 10 features sea representativo de sistemas reales con cientos de features, equipos múltiples o estado distribuido.
- No podemos atribuir la diferencia de bundle incremental (Angular ~1,3× por feature) a una causa concreta con este experimento: las Fases 5.3–5.8 ya delimitaron que el app code y las templates AOT explican parte, pero la atribución exacta por feature no es medible con las herramientas (asimetría de metafile vs source map).

## 23. Conclusión

**Las propiedades arquitectónicas se mantienen constantes bajo crecimiento controlado de 1 a 10 features; no aparece ningún punto de divergencia estructural entre React y Angular.**

Lo que se mantiene constante:

- **Aislamiento**: 0 imports entre features en los 16 áreas; dominio independiente; ADR-001/ADR-002 intactos.
- **Coste estructural**: LOC y tests por feature prácticamente idénticos; la única diferencia es la separación template/lógica de Angular (+1–3 archivos).
- **Coste de cambio**: la modificación posterior (c5) y la capacidad compartida (c6) se mantienen localizadas y sin acoplamiento; la deduplicación compartida incluso reduce el bundle en ambos.

Dónde divergen (trade-offs ya conocidos, ahora cuantificados bajo crecimiento):

- **Bundle incremental**: Angular ~1,3× por feature (~3,6 kB vs ~2,8 kB) — estable, sin divergencia.
- **Build**: Angular ~10× y crece +17 % vs React plano.
- **Test time**: la suite de React crece más rápido en tiempo (+90 %) a igual número de tests.

La pregunta "¿dónde empieza a divergir?" tiene respuesta: **en coste de runtime/build por feature (no estructural), y desde el primer nivel, con relaciones estables** — no aparece un umbral de crecimiento donde la arquitectura de un framework se degrade respecto al otro.

## 24. Siguiente experimento

1. **Escalado del dataset en interacción** (Fase 7 + crecimiento): repetir los escenarios S2/S4 de Fase 7 con un catálogo de 100–300 ítems y con 10 features montadas, para ver si la diferencia de trabajo síncrono de React (Fase 7) se traduce en latencia percibida cuando el render pesa. Es la dimensión de mayor valor pendiente.
2. **Feature heterogénea con estado compartido**: añadir una feature que necesite estado derivado de dos catálogos (p. ej., un tablero que agregue Issues + Sprints), para ejercer el escenario que esta escalera no cubre.
3. **Evolución del dominio compartido**: medir el coste de añadir una entidad nueva al dominio (no solo reglas) consumida por features existentes.

---

_Evidencia cruda: [`results/scalability-phase8.json`](./results/scalability-phase8.json). Script reproducible: `node scripts/measure-scalability-phase8.mjs /tmp/lab-phase8`._
