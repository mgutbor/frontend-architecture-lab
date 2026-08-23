# Comparación global — React Monolith vs Angular Monolith (Fase 5.2)

- **Estado:** Completado (Fase 5.2 — comparación y scorecard)
- **Evidencia:** [baseline-phase2](../experiments/results/baseline-phase2.json) · [react-monolith-phase4](../experiments/results/react-monolith-phase4.json) · [angular-monolith-phase5](../experiments/results/angular-monolith-phase5.json)
- **Documentos relacionados:** [Métricas](../experiments/metrics.md) · [Scorecard](./scorecard.md) · [Hipótesis H1–H8](./hypotheses-phase5.md) · [Arquitectura](../architecture/frontend-architecture.md) · [ADR-001](../decisions/ADR-001-shared-domain-package.md) · [ADR-002](../decisions/ADR-002-state-management-react-angular.md)

## 1. Objetivo

Comparar arquitectónicamente y experimentalmente los cuatro escenarios del laboratorio:

- React Baseline (Fase 2)
- Angular Baseline (Fase 2)
- React Monolith (Fase 4)
- Angular Monolith (Fase 5)

La pregunta correcta **no** es «¿qué framework es mejor?», sino **«¿qué trade-offs produce cada arquitectura al implementar el mismo contrato funcional?»**. Se distinguen siempre cuatro conceptos que no se mezclan:

- **A. Coste absoluto** (valor de cada escenario por separado).
- **B. Coste incremental** (monolith vs su propio baseline).
- **C. Diferencia entre frameworks** (React vs Angular en cada métrica).
- **D. Evidencia disponible** (fuente y calidad de cada dato).
- **E. Limitaciones** (qué no puede afirmarse con los datos).

Esta fase **no modifica código funcional**. Los únicos cambios son este documento y el índice `docs/comparisons/README.md`.

## 2. Fuentes

| Fuente                                       | Rol                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/experiments/metrics.md`                | Metodología aprobada (mediana+rango de 3, build en frío, conteos estáticos). |
| `baseline-phase2.md/.json`                   | Baseline inmutable (React, Angular, Domain).                                 |
| `react-monolith-phase4.md/.json`             | Coste incremental React (medido, inmutable).                                 |
| `angular-monolith-phase5.md/.json`           | Coste incremental Angular (medido en Fase 5.1, inmutable).                   |
| `hypotheses-phase5.md`                       | Hipótesis H1–H8 con criterios de validación.                                 |
| `scorecard.md`                               | Metodología de scorecard (escala 1–5, secciones A/B).                        |
| `frontend-architecture.md`, ADR-001, ADR-002 | Arquitectura y decisiones evaluadas.                                         |

## 3. Metodología

- Se reutilizan **íntegramente** los resultados medidos en Fase 3, 4.1 y 5.1, todos con el mismo script (`scripts/measure-baseline.mjs`, sin modificar), la misma máquina (Apple M1, Node v25.3.0, pnpm 10.34.5), el mismo dataset (v1) y el mismo procedimiento (build en frío, 3 ejecuciones, mediana+rango).
- **No se ejecutaron mediciones nuevas** (no eran necesarias; todos los números se verificaron contra los JSON directamente).
- La scorecard se aplica con la escala 1–5 y la separación estricta A (mediciones objetivas) / B (criterios cualitativos) de `scorecard.md`; solo se puntúa con evidencia (sección 11).
- Donde no hay evidencia suficiente se declara **NO EVALUABLE**, no se fuerza puntuación.

## 4. Tabla principal

| Métrica                          | React Baseline | React Monolith | Delta React | Angular Baseline | Angular Monolith | Delta Angular |
| -------------------------------- | -------------: | -------------: | ----------: | ---------------: | ---------------: | ------------: |
| LOC producción                   |            325 |           2198 |       +1873 |              417 |             2331 |         +1914 |
| LOC tests                        |            137 |           1112 |        +975 |              117 |             1043 |          +926 |
| Ratio test/código                |           0.42 |           0.51 |       +0.09 |             0.28 |             0.45 |         +0.17 |
| Archivos producción              |             10 |             25 |         +15 |               13 |               35 |           +22 |
| Archivos tests                   |              4 |             10 |          +6 |                3 |                8 |            +5 |
| Features                         |              2 |              9 |          +7 |                4 |               18 |           +14 |
| Componentes                      |              2 |              7 |          +5 |                3 |               16 |           +13 |
| Runtime deps                     |              3 |              3 |           0 |                7 |                7 |             0 |
| Dev deps                         |             10 |             10 |           0 |                6 |                6 |             0 |
| Transitivas                      |            249 |            249 |           0 |             1074 |             1074 |             0 |
| Build (mediana, ms)              |          530.4 |          484.1 |       −46.3 |             2720 |           2924.6 |        +204.6 |
| JS raw (B)                       |        208 562 |        233 547 |     +24 985 |          136 621 |          179 634 |       +43 013 |
| JS gzip (B)                      |         63 499 |         68 572 |      +5 073 |           43 930 |           53 485 |        +9 555 |
| JS brotli (B)                    |         54 534 |         58 972 |      +4 438 |           39 156 |           47 348 |        +8 192 |
| CSS raw (B)                      |            119 |           3666 |       +3547 |              119 |             3438 |         +3319 |
| Tests (nº)                       |              8 |             84 |         +76 |                6 |               61 |           +55 |
| Tiempo total tests (mediana, ms) |         1339.3 |         3079.1 |     +1739.8 |           2466.6 |           3534.5 |       +1067.9 |
| Tiempo por test (ms)             |          167.4 |           36.7 |      −130.7 |            411.1 |             57.9 |        −353.2 |
| Imports entre features           |              0 |              0 |           0 |                0 |                0 |             0 |
| Imports de domain                |              6 |             13 |          +7 |                4 |               12 |            +8 |
| Imports salientes de features    |              4 |             23 |         +19 |                3 |               22 |           +19 |
| Adapters                         |              1 |              1 |           0 |                1 |                1 |             0 |
| Directorios shared/common        |              0 |              0 |           0 |                0 |                0 |             0 |
| Duplicación deliberada (pares)   |              6 |              6 |           0 |                6 |                6 |             0 |
| Chunks JS                        |              1 |              1 |           0 |                1 |                1 |             0 |

> Valores extraídos directamente de `baseline-phase2.json`, `react-monolith-phase4.json` y `angular-monolith-phase5.json` (verificados por script, no copiados de documentos derivados).

### Deltas comparados

| Métrica                | Delta React | Delta Angular | Diferencia (Ang − React) |
| ---------------------- | ----------: | ------------: | -----------------------: |
| LOC producción         |       +1873 |         +1914 |                      +41 |
| LOC tests              |        +975 |          +926 |                      −49 |
| Tests (nº)             |         +76 |           +55 |                      −21 |
| JS raw                 |   +24 985 B |     +43 013 B |            **+18 028 B** |
| JS gzip                |    +5 073 B |      +9 555 B |             **+4 482 B** |
| Build                  |    −46.3 ms |     +204.6 ms |                +250.9 ms |
| Deps nuevas (r/d/t)    |       0/0/0 |         0/0/0 |                    0/0/0 |
| Imports entre features |           0 |             0 |                        0 |
| Imports salientes      |         +19 |           +19 |                        0 |

## 5. Coste incremental

Datos verificados contra los JSON (no del prompt):

**React:** +1873 LOC producción · +975 LOC tests · +76 tests · +24 985 B JS raw · +5 073 B gzip · 0 dependencias nuevas.
**Angular:** +1914 LOC producción · +926 LOC tests · +55 tests · +43 013 B JS raw · +9 555 B gzip · 0 dependencias nuevas.

**Análisis:**

- **Dónde son similares:** el coste de código es casi idéntico (+41 LOC de producción, −49 LOC de tests: <2.5% de diferencia), el número de tests es del mismo orden (55 vs 76), los imports salientes coinciden (+19), y **ambos implementan el contrato completo con 0 dependencias nuevas** (el patrón ADR-001/002 se repite).
- **Dónde divergen:** el **bundle incremental** es el punto de divergencia principal: Angular añade +43.0 kB raw frente a +24.9 kB de React (+72% más bytes; +18.0 kB de diferencia absoluta, +4.5 kB en gzip). El **build** también diverge: React −46 ms (ruido), Angular +205 ms (+7.5% sobre su baseline).
- **Significativa:** la diferencia de bundle (≥+18 kB raw, fuera de cualquier rango de ruido porque es un conteo determinista de bytes) y el coste absoluto de build (6× entre frameworks, consistente en los 3 ciclos).
- **Ruido / no significativa:** la variación de build de React (−46 ms está dentro del rango 459–551 de Fase 4.1 frente a 524–543 del baseline); la diferencia de LOC (+41) es trivial; la diferencia en tiempo total de tests (+1.07 s Angular vs +1.74 s React) mezcla volumen y coste por test (ver H4).

## 6. Hipótesis H1–H8 (reevaluación crítica)

Se auditan los veredictos de Fase 5.1, no se aceptan automáticamente. Veredictos restringidos a **CONFIRMADA / REFUTADA / NO CONCLUYENTE**.

### H1 — Dependencias

- **Resultado:** delta 0/0/0 en ambos frameworks (React 3/10/249 → 3/10/249; Angular 7/6/1074 → 7/6/1074).
- **Evidencia:** `dependencies` en los tres JSON; `package.json` sin cambios en `git status`.
- **Calidad de evidencia:** alta (conteo determinista del lockfile, reproducible).
- **Veredicto final: CONFIRMADA.** El contrato completo se implementó en ambas arquitecturas sin dependencias runtime nuevas; las 1074 transitivas de Angular son la toolchain/ecosistema del baseline, no un coste de Fase 5.

### H2 — Bundle

- **Resultado:** Angular +43 013 B raw (+31.5%) vs React +24 985 B raw (+12.0%); gzip +9 555 vs +5 073.
- **Evidencia:** `build.assets` en los JSON (conteo determinista de bytes).
- **Calidad de evidencia:** alta en el **hecho** (bytes medidos); **nula en la atribución** (ver §7).
- **Veredicto final: REFUTADA.** El incremento de bundle de Angular no es inferior ni comparable al de React; es ~1.7× en raw. La hipótesis (que la AOT reduciría el incremento) no se sostiene con los datos disponibles. **No** se concluye _por qué_ (ver §7).

### H3 — Build

- **Resultado:** absoluto Angular 2924.6 ms vs React 484.1 ms; incremento Angular +204.6 ms (+7.5%) con rangos sin solapar (baseline 2700–2739 → monolith 2824–3372); incremento React −46 ms (dentro del ruido).
- **Evidencia:** `build.*.runsMs` en los JSON.
- **Calidad de evidencia:** media. Tres ejecuciones en la misma sesión, pero el rango del monolith Angular es ancho (2824–3372; primera ejecución atípica de 3372 ms documentada en Fase 5.1 §12) y los build runners son distintos (Vite vs Angular CLI con AOT, presupuestos, hashing).
- **Veredicto final: CONFIRMADA** (en su literalidad) **con nota crítica**. El enunciado de H3 era: «coste absoluto superior, incremento razonable y reproducible». Eso es lo que dicen los datos: absoluto 6× superior y un incremento de +205 ms (+7.5%) que se observa en las 3 ejecuciones. **Pero esto NO demuestra que «Angular escala peor»**: la diferencia absoluta es estructural (toolchain Angular ejecuta AOT, presupuestos, hashing) y el incremento del contrato es pequeño en valor absoluto. La afirmación amplia de «escalado peor» sería una extrapolación sin evidencia; no debe hacerse.

### H4 — Tests

- **Resultado:** Angular 6 → 61 tests (58 ms/test); React 8 → 84 tests (37 ms/test). Cobertura funcional equivalente verificada (auditoría Fase 5.0: contrato completo en código; los valores de Reports/Dashboard coinciden con `dataset.md` §6).
- **Evidencia:** `quality.*.tests` en los JSON.
- **Calidad de evidencia:** media. El nº de tests y los tiempos son deterministas/medidos; la **equivalencia de cobertura funcional** se apoya en la auditoría de código (61 tests de integración con fixture real), no en una métrica de cobertura (no configurada).
- **Veredicto final: CONFIRMADA** con matices. El coste temporal por test es superior en Angular (58 vs 37 ms, ~1.6×) y el nº de tests es similar en orden de magnitud, con cobertura equivalente. **No** se usan tiempo/test ni nº de tests como métricas de calidad (regla de la hipótesis): la naturaleza de los tests difiere (componentes standalone + templates en Angular; menor coste por test en React por tests más granulares de ids/filtros).

### H5 — Arquitectura

- **Resultado:** imports entre features 0 en ambos (con 6 features); 1 adapter; dominio compartido vía `@operations-hub/domain`; 0 directorios shared/common; 6 pares de duplicación deliberada.
- **Evidencia:** `architecture.*` en los JSON + auditoría Fase 5.0 (ADR-002: signals privados → `asReadonly` + `computed` en Angular; `useSyncExternalStore` en React).
- **Calidad de evidencia:** alta (heurísticas deterministas + revisión de código).
- **Veredicto final: CONFIRMADA.** Las fronteras de ADR-002 se mantienen con el contrato completo en ambos frameworks; la duplicación es la prevista (integración, nunca lógica de dominio).

### H6 — Developer Experience

- **Resultado:** la feature Teams se implementó de verdad en ambos frameworks con el mismo flujo observable de 4 pasos (crear archivos de feature → registrar en el shell → tests → validar), 2 archivos de feature + wiring + tests cada uno.
- **Evidencia:** Anexo A de `baseline-phase2.md`; Fase 4.1 §9 (React, flujo real); Fase 5.1 §9-H6 (Angular, flujo real).
- **Calidad de evidencia:** media-baja. Es un flujo documentado post-hoc, no una medición controlada; no mide dificultad conceptual ni carga de boilerplate de forma objetiva.
- **Veredicto final: CONFIRMADA** con confianza media. El coste observable (pasos, archivos, wiring) es comparable; la distribución difiere (Angular separa `.ts`/`.html` y registra standalone; React usa un archivo `.tsx`). **Advertencia:** nº de archivos ≠ DX; la única afirmación sostenible es que los pasos observables son equivalentes, no que la experiencia sea «igual de fácil».

### H7 — Código

- **Resultado:** Angular 2331 LOC producción vs React 2198 (+6% total); ratio test/código 0.45 vs 0.51; distribución distinta (Angular: 18 archivos de feature + 16 componentes + 10 plantillas; React: 9 archivos de feature).
- **Evidencia:** `code.*` en los JSON.
- **Calidad de evidencia:** alta en los conteos; interpretativa en su lectura.
- **Veredicto final: CONFIRMADA** con matiz. El total de LOC de producción es mayor en Angular (+133, +6%), consistente con la hipótesis (separación HTML/TS, más archivos). **Pero** la diferencia es pequeña y por archivo de feature Angular tiene _menos_ LOC (129 vs 244) por la separación de plantillas. **No** se interpreta LOC como calidad (regla 6 de interpretación): la arquitectura (H5) es equivalente y el dominio concentra las reglas (ratio 1.11).

### H8 — Accesibilidad

- **Resultado:** no medible — Chrome headless bloqueado (Fase 4.1 §8 y Fase 5.1 §10, bloqueo idéntico o peor).
- **Evidencia:** §10 de `angular-monolith-phase5.md`; §8 de `react-monolith-phase4.md`.
- **Calidad de evidencia:** implementación estática de ACC-1…8 en código (auditoría Fase 5.0), **sin verificación real** (ni Lighthouse ni recorrido de teclado en navegador).
- **Veredicto final: NO CONCLUYENTE.** No hay evidencia de ejecución; no se inventan resultados. La implementación en código es equivalente, pero la hipótesis solo podrá evaluarse con Lighthouse en un entorno con Chromium funcional.

## 7. H2 — Análisis especial del bundle

**HECHOS (medidos):**

|                 |              React |            Angular |
| --------------- | -----------------: | -----------------: |
| JS raw baseline |          208 562 B |          136 621 B |
| JS raw monolith |          233 547 B |          179 634 B |
| Incremento raw  | +24 985 B (+12.0%) | +43 013 B (+31.5%) |
| Incremento gzip |   +5 073 B (+8.0%) |  +9 555 B (+21.7%) |
| Chunks          |                  1 |                  1 |

- Angular incrementa **más bytes** (+43.0 kB) que React (+24.9 kB).
- La diferencia entre incrementos es **+18.0 kB raw** (+4.5 kB gzip).
- Ambos permanecen en **1 chunk** (sin code splitting).
- El **bundle absoluto** final de Angular (179.6 kB) sigue siendo menor que el de React (233.5 kB) — hecho, sin connotación de superioridad.

**HIPÓTESIS EXPLICATIVA (no medida, no debe presentarse como conclusión):** la AOT no redujo el coste incremental; una posible explicación es que cada feature Angular añade componente + template compilados a JS, mientras React reutiliza un runtime ya dominante en su base — pero **los datos actuales no permiten atribuir los bytes a runtime, templates compilados, componentes, CSS, código propio ni tooling**. Cualquier afirmación sobre la causa sería especulación.

**Medición adicional que lo explicaría:** análisis de composición de bundle de ambos monoliths (p. ej. `source-map-explorer`, metafile del bundler, o comparación del runtime puro frente al código de features), desglosando raw/gzip por origen. Ese es el siguiente experimento informativo (ver §17).

## 8. Arquitectura

Evaluación de ADR-001 y ADR-002 con la evidencia observada.

- **Dominio compartido (`@operations-hub/domain`):** única fuente de reglas (BR-1…7), validadores (`validateProjectInput`, `validateTaskInput`, `validateUserInput`), máquinas de estado (`canTransitionProject/Task`) y builders de reports. Ambas apps lo consumen vía `workspace:*`; 0 dependencias runtime en el paquete; 103 tests con ratio 1.11. **Ninguna app reimplementa reglas** (verificado: store y formularios delegan; los tests de apps verifican delegación, no duplican el dominio).
- **Estado:** React `useSyncExternalStore` (store externo mínimo, sin librería) vs Angular signals + DI (signal writable privado → `asReadonly` + `computed`). Ambos distinguen estado de dominio / derivado / UI.
- **Adapters:** 1 por app, frontera única de datos (hoy `loadFixture()`, mañana API).
- **Features:** 0 acoplamiento entre features en ambos (6 áreas), dirección de dependencia única hacia capas compartidas.
- **Shared components:** reutilización real (7 componentes React / 6+ componentes Angular: field, empty-state, badges, feedback, transition-buttons, kpi-card), sin directorio `shared` genérico.
- **Duplicación deliberada:** 6 pares (adapter, store, kpi-card, dashboard, projects, app shell). **Pregunta clave: ¿está encapsulada y justificada? Sí.** Es duplicación de _orquestación de estado e integración_ (el mecanismo de cada framework), nunca de reglas ni de lógica de dominio. El coste es ~2 implementaciones de integración; el beneficio es 0 dependencias de estado y dominio compartido intacto.

**Conclusión arquitectónica:** ADR-001 y ADR-002 produjeron el trade-off esperado: el coste se pagó en código de integración propio (LOC) en lugar de librerías; el dominio permanece como fuente única de reglas; las fronteras se mantienen idénticas entre frameworks con modelos de estado distintos.

## 9. Mantenibilidad

Evidencia observable (sin inventar métricas subjetivas):

- **Tamaño de archivos:** componentes y páginas de tamaño moderado (mayoría < 200 LOC); sin componentes gigantes (auditoría Fase 5.0 para Angular; estructura equivalente en React).
- **Acoplamiento:** 0 imports entre features en ambos; dirección de dependencia única y sin ciclos.
- **Shared components:** consolidación de UI común sin capa genérica.
- **Duplicación:** encapsulada en pares de integración (ver §8); la lógica de negocio no se duplica.
- **Separación dominio/UI:** total — la UI no calcula métricas ni valida reglas (los builders y validadores viven en domain).
- **Tests:** integración real con fixture en ambas; el dominio concentra las reglas (ratio 1.11).
- **Dependencia del framework:** cada app depende solo de su framework + domain; sin abstracciones intermedias.

Donde no hay evidencia (p. ej. un cambio real de una feature en el monolith completo como tarea de mantenimiento controlada), se declara **NO EVALUABLE** en la scorecard en lugar de puntuar por intuición.

## 10. DX

Comparación del flujo observable para añadir una feature equivalente (Teams), usando el Anexo A de `baseline-phase2.md` y los flujos reales documentados:

| Aspecto                    | React                                                   | Angular                                                        |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| Archivos nuevos de feature | 1 (`.tsx`)                                              | 2 (`.ts` + `.html`)                                            |
| Wiring en el shell         | Union `Section` + botón + render condicional (3 líneas) | Componente en `imports` + union + botón + `@switch` (4 líneas) |
| Estado                     | Hook `use-domain-store`                                 | `computed` sobre el store inyectado                            |
| Tests                      | 1 archivo `.test.tsx`                                   | 1 archivo `.spec.ts`                                           |
| Templates                  | JSX inline                                              | `.html` separado                                               |
| Estilos                    | CSS global                                              | CSS global                                                     |
| Dependencia del framework  | Hooks + JSX                                             | Decoradores + DI + signals + templates                         |
| Build loop (mediana)       | ~484 ms                                                 | ~2925 ms                                                       |
| Test loop (mediana)        | ~3.1 s                                                  | ~3.5 s                                                         |

**Lectura:** los pasos y el número de archivos son equivalentes (2 vs 2 contando `.ts`+`.html`); la diferencia observable está en el **mecanismo de integración** (hook vs registro standalone) y en el **bucle de build** (6× más lento en Angular, fricción de iteración real). No se valora subjetivamente «más fácil»: se documenta que el flujo es comparable en pasos y que el coste de iteración por build es mayor en Angular.

## 11. Scorecard

Aplicando `scorecard.md` (escala 1–5; sección A = mediciones objetivas, sección B = criterios cualitativos). Solo se puntúa con evidencia; el resto es NO EVALUABLE. Sin nota global ni ponderación (decisión del scorecard).

### Sección A — Mediciones objetivas (reporte, no rúbrica)

| Criterio                      | React     | Angular   | Método                     | Evidencia              | Confianza               |
| ----------------------------- | --------- | --------- | -------------------------- | ---------------------- | ----------------------- |
| Dependencias (delta contrato) | 0 nuevas  | 0 nuevas  | lockfile + package.json    | JSON `dependencies`    | Alta                    |
| Bundle incremental JS raw     | +24 985 B | +43 013 B | build de producción + zlib | JSON `build.assets`    | Alta                    |
| Bundle absoluto JS raw        | 233 547 B | 179 634 B | idem                       | JSON                   | Alta                    |
| Build (mediana)               | 484 ms    | 2925 ms   | 3 builds en frío           | JSON `build.*.runsMs`  | Media (ruido de sesión) |
| Tests (nº / ms por test)      | 84 / 37   | 61 / 58   | 3 ejecuciones              | JSON `quality.*.tests` | Media                   |
| Imports entre features        | 0         | 0         | grep determinista          | JSON `architecture`    | Alta                    |
| Accesibilidad (Lighthouse)    | —         | —         | no ejecutable              | Fase 4.1 §8 / 5.1 §10  | — (NO EVALUABLE)        |

### Sección B — Evaluación cualitativa (rúbrica 1–5)

| Criterio                  | React        | Angular      | Rúbrica / justificación                                                                                                                                                                                              | Confianza |
| ------------------------- | ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Arquitectura**          | 4            | 4            | Sólido: 0 acoplamiento entre features, 1 adapter, dominio compartido, sin shared innecesaria, duplicación encapsulada (ADR-002 cumplido en ambos).                                                                   | Alta      |
| **Mantenibilidad**        | 4            | 4            | Sólido: archivos moderados, dirección de dependencia única, separación dominio/UI total; sin evidencia de un cambio real controlado (limitación).                                                                    | Media     |
| **DX (flujo observable)** | 4            | 3            | Sólido vs aceptable: pasos y archivos equivalentes, pero bucle de build 6× más lento en Angular y un mecanismo de integración más verboso (registro standalone + separación HTML/TS). No mide dificultad conceptual. | Media     |
| **Complejidad**           | 4            | 3            | Sólido vs aceptable: Angular expone más conceptos (DI, decoradores, signals, templates, zoneless) que React (hooks + JSX); evidenciado por roles/archivos y código.                                                  | Media     |
| **Escalabilidad**         | NO EVALUABLE | NO EVALUABLE | Sin evidencia: no hay experimento con más features/entidades/reglas; extrapolar sería especulación.                                                                                                                  | —         |
| **Accesibilidad**         | NO EVALUABLE | NO EVALUABLE | Sin Lighthouse; solo implementación estática de ACC-1…8.                                                                                                                                                             | —         |

## 12. ADR-001 — Paquete de dominio compartido

**Veredicto: VALIDADO.**

- Ambos monoliths consumen exactamente el mismo contrato de dominio y el mismo fixture (v1): nunca compararon datasets distintos.
- El dominio tiene **0 dependencias runtime**, 103 tests (ratio 1.11) y concentra reglas, validación, transiciones y reports; ninguna app los reimplementa.
- La frontera del paquete (mapa `exports`) se respetó (sin imports profundos; verificado en el código de ambas apps).
- El coste de indirección previsto (una capa más) se compensó con la ausencia de divergencia de reglas: la evidencia de H1/H5 lo confirma.

## 13. ADR-002 — Gestión de estado por framework

**Veredicto: VALIDADO (con el trade-off esperado materializado).**

- React: `useSyncExternalStore` (store externo mínimo, sin librería) — 3 servicios (`domain-store`, `ids`, `filters`), 1 hook.
- Angular: signals + DI (service `providedIn: 'root'`, signal writable privado → `asReadonly` + `computed`) — 1 store + 2 servicios de sesión.
- **¿Evitó dependencias sin coste arquitectónico excesivo? Sí.** 0 dependencias de estado en ambos con el contrato completo; la máquina de estados y los reports nunca se reimplementaron (H5); el coste es la duplicación deliberada de integración (6 pares), que es encapsulada y se limita a orquestación — coherente con el trade-off documentado en el ADR.
- **Matiz:** la duplicación de integración es real (dos implementaciones de ids/filters/store) y es el coste que la fase de comparación debe considerar como «duplicación deliberada»; no contradice el ADR, lo materializa.

## 14. Resultado por dimensión

| Dimensión      | React        | Angular      | Evidencia                                                                               | Confianza    |
| -------------- | ------------ | ------------ | --------------------------------------------------------------------------------------- | ------------ |
| Arquitectura   | 4            | 4            | Import counts + auditoría + ADR-002                                                     | Alta         |
| Dependencias   | 5            | 4            | 0 nuevas ambos; superficie absoluta menor en React (249 vs 1074 transitivas, toolchain) | Alta         |
| Bundle         | 4            | 3            | Incremento menor en React (+25 vs +43 kB); absoluto menor en Angular                    | Alta (hecho) |
| Build          | 5            | 3            | Loop 484 vs 2925 ms; incremento Angular pequeño (+205 ms)                               | Media        |
| Tests          | 4            | 4            | Cobertura equivalente; coste/test mayor en Angular                                      | Media        |
| Mantenibilidad | 4            | 4            | Acoplamiento/fronteras equivalentes; sin estudio de cambio controlado                   | Media        |
| DX             | 4            | 3            | Pasos iguales; build loop 6× en Angular                                                 | Media        |
| Accesibilidad  | NO EVALUABLE | NO EVALUABLE | Lighthouse bloqueado                                                                    | —            |
| Escalabilidad  | NO EVALUABLE | NO EVALUABLE | Sin experimento de evolución                                                            | —            |
| Complejidad    | 4            | 3            | Más conceptos/tooling en Angular                                                        | Media        |

**No hay ganador global.** React gana en bundle incremental, build loop y superficie de dependencias; Angular gana en bundle absoluto y estructura explícita por feature; empatan en arquitectura, mantenibilidad y cobertura de tests; accesibilidad y escalabilidad quedan no concluyentes.

## 15. Limitaciones

- **Lighthouse no medible** en este entorno (Chrome headless colgado; Fase 4.1 y 5.1, incluso peor en 5.1 con `data:`). Sin puntuaciones de accesibilidad/rendimiento.
- **Cobertura de tests no configurada** (`@vitest/coverage-v8` no añadido, decisión de Fase 3): la equivalencia de cobertura se apoya en auditoría de código, no en una métrica.
- **Tiempos de pared**, misma máquina/sesión; sensibles a carga de fondo; el rango del build Angular monolith es ancho (2824–3372).
- **Toolchains distintas** (Vite vs Angular CLI): los absolutos de build no son directamente comparables como calidad; solo los deltas intra-framework y los rangos.
- **gzip/brotli con `zlib` de Node** (nivel por defecto), no con configuración de servidor.
- **Métricas de arquitectura heurísticas** (patrones de import), no análisis formal de grafos.
- **Conteo transitivo** incluye devDependencies del árbol (Angular arrastra su toolchain: 1074 vs 249).
- **1 chunk** sin code splitting (decisión de alcance MVP).
- **H2 sin atribución de bytes**: no se puede explicar el +18 kB de diferencia sin análisis de bundle.
- **Scorecard cualitativa** con confianza media (salvo arquitectura/dependencias): se basa en evidencia observable, no en un estudio de mantenimiento controlado.

## 16. Conclusión crítica

1. **¿Qué funcionó?** La estrategia ADR-001/002: dominio compartido con 0 dependencias runtime, estado nativo por framework (sin librerías) y fronteras arquitectónicas idénticas. **Ambos** implementaron el contrato completo con 0 dependencias nuevas, 0 acoplamiento entre features y sin duplicar reglas. La arquitectura aguantó el crecimiento en ambos.
2. **¿Qué coste tuvo?** ~1.9–2.3k LOC de producción + ~1.0–1.1k LOC de tests por framework; +25 kB JS raw en React y +43 kB en Angular; un bucle de build de ~0.5 s (React) frente a ~3 s (Angular); suites de tests de ~3 s en ambos.
3. **¿Dónde React tiene ventaja?** Bundle incremental (+25 vs +43 kB), bucle de build (6× más rápido), superficie de dependencias transitivas (249 vs 1074, condicionada por toolchain) y menos conceptos/archivos por feature.
4. **¿Dónde Angular tiene ventaja?** Bundle absoluto final (179.6 vs 233.5 kB), tests totales más rápidos con menos tests (3.5 s con 61 vs 3.1 s con 84) y una estructura explícita por feature (separación HTML/TS) que hace la responsabilidad visible.
5. **¿Qué hipótesis fueron refutadas?** **H2**: la AOT no redujo el incremento de bundle; Angular creció más en bytes que React. Es la única refutada con datos.
6. **¿Qué todavía no sabemos?** De dónde proceden exactamente los +43 kB (H2 sin atribución); si la accesibilidad implementada es real (H8, Lighthouse bloqueado); si alguna arquitectura escala mejor con más features/reglas/entidades (escalabilidad no evaluada); y el coste real de mantenimiento con un cambio controlado.
7. **¿Qué NO debería concluirse?** Que un framework es «mejor»; que Angular «escala peor» por un build absoluto mayor (es toolchain, y su incremento fue pequeño); que más LOC = peor arquitectura; que menos tests = peor cobertura; que el bundle absoluto menor de Angular lo hace superior (tampoco lo hace inferior el incremental mayor). Ninguna de esas inferencias está soportada.
8. **¿Qué experimento tendría mayor valor informativo?** **Análisis de composición de bundle** de ambos monoliths para atribuir los bytes del incremento (responde la única hipótesis refutada y su causa), seguido de Lighthouse en un entorno con Chromium funcional (desbloquea H8).

**Contradicción con expectativas previas, dicha explícitamente:** la Fase 5.1 esperaba que la compilación AOT de Angular produjera un incremento de bundle menor o comparable al de React (H2). Los datos muestran lo contrario (+43 vs +25 kB). Es un resultado válido del experimento, no un fallo; la causa sigue sin medirse.

## 17. Experimentos futuros

Solo experimentos derivados de preguntas reales abiertas (ninguno se implementa en esta fase):

**A. Bundle attribution** — determinar de dónde proceden los +43 kB de Angular frente a +25 kB de React: análisis de composición (metafile del bundler / source-map-explorer) en ambos monoliths, desglosando runtime, templates compilados, componentes, CSS y código propio, en raw y gzip. Responde el «por qué» de H2.

**B. Lighthouse / accesibilidad** — ejecutar Lighthouse sobre ambos monoliths en CI o un entorno con Chromium funcional (desbloquea H8 y añade Performance/Best Practices/SEO).

**C. Evolución del laboratorio** — medir el coste incremental de añadir, en cada monolith: (1) una feature nueva (mismo escenario del Anexo A), (2) una regla de dominio nueva (cambio en `packages/domain` + impacto en apps), (3) una entidad nueva, (4) una dependencia nueva, (5) una segunda versión del contrato. Compara el coste marginal de evolución, que es la dimensión «escalabilidad» que quedó NO EVALUABLE.

## Anexo — Validación

- Números verificados contra los tres JSON (`node` + `require`, sin copiar del prompt).
- `pnpm format:check` ✓ (tras formatear los archivos nuevos).
- Sin commit. Únicos cambios: `docs/comparisons/react-vs-angular-phase5.md` (nuevo) y `docs/comparisons/README.md` (índice).
- Sin cambios de código funcional, sin dependencias nuevas, sin ADRs modificados.
