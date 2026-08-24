# Fase 10 — Lighthouse User Flows: validación del rendimiento percibido

## 1. Objetivo

Validar si las diferencias de bajo nivel medidas en las Fases 7–9 (coste de
montaje, trabajo síncrono incremental, long tasks) se traducen en métricas de
rendimiento percibido (FCP / LCP / TBT / INP / CLS / score de rendimiento)
medidas con **Lighthouse User Flows** (API programática) sobre los builds
reales del laboratorio Fase 9 (10 features + `scale-dataset`), con
interacciones de usuario reales (input de confianza vía puppeteer) y datasets
30–3000.

El experimento NO modifica la aplicación productiva, los contratos, los ADR,
los fixtures ni las métricas históricas. Se ejecuta sobre una copia aislada
(`/tmp/lab-phase10`), con el mismo harness para ambos frameworks.

## 2. Hipótesis

| Hipótesis | Enunciado                                                                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H47**   | Los flujos reales presentan rendimiento percibido equivalente en datasets pequeños/moderados, pero pueden divergir en datasets grandes.                                                                                                 |
| **H48**   | El coste de montaje de Fases 9.1/9.3 aparece en las métricas de carga/navegación del flujo, especialmente LCP y/o TBT.                                                                                                                  |
| **H49**   | El mayor trabajo síncrono de React en S2/S4 produce un incremento medible en métricas de interacción, especialmente INP.                                                                                                                |
| **H50**   | Las diferencias de Lighthouse mantienen la misma direccionalidad que los microbenchmarks: montaje grande → Angular peor; interacción incremental grande → React puede empeorar; flujo completo → Angular peor cuando domina el montaje. |
| **H51**   | Accessibility sigue siendo equivalente entre ambos frameworks.                                                                                                                                                                          |
| **H52**   | Existe un tamaño de dataset a partir del cual las diferencias dejan de ser despreciables desde el punto de vista de métricas de usuario.                                                                                                |

## 3. Metodología

- **Herramienta**: Lighthouse **13.4.1** (core + puppeteer-core resueltos desde
  el caché de npx, sin dependencias nuevas) sobre **chrome-headless-shell**
  (Playwright cache) — el único navegador headless funcional en este entorno
  (Fases 4.1 / 5.1 / 5.9 / 7 / 9).
- **INP**: requiere input de confianza (`page.click/type/select`) y el flag
  `--enable-blink-features=EventTimingTracing`. La emisión de EventTiming
  difiere entre versiones de chrome-headless-shell (verificado: 1208/1223/1228
  emiten, 1234 no); el script sondea cada versión en caché y elige la primera
  con INP numérico (resultado: **1228**, sonda INP 29,6 ms).
- **Perfil**: desktop, viewport 1280×800, `throttlingMethod: 'provided'`
  (SIN throttling simulado: los user flows miden latencia de interacción
  real; difiere del perfil móvil simulado de Fase 5.9 → comparaciones con
  5.9 solo contextuales).
- **Flujos** (cada uno = una sesión de navegador; 3 runs por celda, sesión
  nueva por run; medianas + min/max + n):
  - **F1** `navigation` — carga inicial (Dashboard, que agrega el dataset →
    escala con N).
  - **F2** `timespan` — Projects → Tasks, espera el montaje completo (N filas).
  - **F3** `timespan` — búsqueda live «incident».
  - **F4** `timespan` — search + status + priority en una interacción.
  - **F5** `end-to-end` — navigate + mount + combined + interacción repetida
    (priority high→low): 4 pasos.
  - **a11y** `navigation` — solo categoría accesibilidad.
- **Esperas deterministas** por conteo de filas (regla `scale-dataset`
  validada en Fases 9.2/9.3: `incident`/`in-progress`/`combined`/
  `combinedLow`). Settles post-commit dentro del timespan (150–250 ms) para
  capturar el next-paint de las interacciones (INP).
- **Métricas por paso**: navigation → score, FCP, LCP, SI, TBT, CLS, TTI;
  timespan → score, TBT, CLS, **INP**, main-thread-work, long tasks
  (derivadas de `main-thread-tasks`, items > 50 ms; el audit `long-tasks` es
  notApplicable en timespan en v13).
- **Resumible/idempotente**: celdas ya presentes en el JSON se reutilizan;
  `--datasets=` y `--app=` para ejecución por tramos.
- La comparación válida es **React vs Angular dentro de esta misma fase**
  (mismo harness, mismos flujos, mismos datasets). Magnitudes con Fases 7–9
  solo como contexto de direccionalidad.

## 4. Hardware/software

- Node **v25.3.0**, macOS **darwin-arm64**, Apple **M1** (8 cores, 16 GB).
- Lighthouse **13.4.1** (npx cache), puppeteer-core del mismo caché.
- chrome-headless-shell **1228** (mac-arm64).
- Builds: copia del laboratorio Fase 9 (`/tmp/lab-phase10`, commit
  `cc11abfd`): React y Angular con 10 features + `scale-dataset`. Los
  monoliths oficiales (233 547 B / 179 634 B) no soportan datasets > 30 y se
  verifican intactos en el repositorio.

## 5. Datasets

- **F5** (flujo completo): 300 / 500 / 1000 / 2000 / **3000** (30 cubierta por
  F1 y Fase 5.9).
- **F1**: 30 (L0, referencia de carga inicial).
- **F2 / F4**: 500 (L2, prioridad de la fase).
- **F3**: 500 y 1000.
- **a11y**: 500.

## 6. User flows

Definidos en §3. F5 replica conceptualmente el flujo de Fase 9.3
(S1 → S4 → interacción repetida) con navegación SPA (timespans sobre la
sección Tasks); F1 mide la carga real de página (navigation).

## 7. Métricas

Por celda (framework × dataset × flujo): score de rendimiento, FCP, LCP, SI,
TBT, CLS, INP, main-thread-work, long tasks (count + max duration). Todas las
celdas con n=3 runs (a11y n=3 tras ampliación), sesión nueva por run.

## 8. Resultados React

### F5 (flujo end-to-end; mediana de 3 runs)

| Dataset | Paso     | score | TBT (ms) | INP (ms) | MW (ms) |  CLS | LT (count) |
| ------: | -------- | ----: | -------: | -------: | ------: | ---: | ---------: |
|     300 | nav      |  1.00 |        0 |        — |       — |    0 |          0 |
|     300 | mount    |  1.00 |        0 |     54,0 |    60,7 |    0 |          0 |
|     300 | combined |  0,56 |        0 |     23,6 |    64,7 | 0,82 |          0 |
|     300 | repeat   |  1.00 |        0 |      n/a |     7,7 |    0 |          0 |
|     500 | mount    |  1.00 |     26,9 |     85,2 |    90,2 |    0 |          1 |
|     500 | combined |  0,56 |        0 |     28,4 |    95,6 | 0,82 |          0 |
|    1000 | mount    |  0,98 |    106,8 |    165,2 |   167,4 |    0 |          1 |
|    1000 | combined |  0,55 |        0 |     44,6 |   194,0 | 0,97 |          0 |
|    2000 | mount    |  0,81 |    265,5 |    324,5 |   325,8 |    0 |          1 |
|    2000 | combined |  0,55 |        0 |     72,5 |   402,2 | 0,99 |          0 |
|    3000 | mount    |  0,67 |    408,6 |    468,0 |   470,0 |    0 | 1 (466 ms) |
|    3000 | combined |  0,80 |     11,6 |     99,6 |   528,3 | 0,22 |  1 (62 ms) |

### Flujos individuales

| Flujo | Dataset | Paso     | score R | TBT (ms) | INP (ms) | MW (ms) |  LT |
| ----- | ------- | -------- | ------: | -------: | -------: | ------: | --: |
| F1    | 30      | nav      |    1.00 |        0 |        — |       — |   0 |
| F2    | 500     | mount    |    1.00 |     26,8 |     85,5 |    90,2 |   1 |
| F3    | 500     | search   |    0,80 |        0 |     28,9 |    87,9 |   0 |
| F3    | 1000    | search   |    0,80 |        0 |     45,2 |   169,4 |   0 |
| F4    | 500     | combined |    0,55 |        0 |     27,7 |   100,3 |   0 |

## 9. Resultados Angular

### F5 (flujo end-to-end; mediana de 3 runs)

| Dataset | Paso     | score | TBT (ms) | INP (ms) | MW (ms) |  CLS | LT (count) |
| ------: | -------- | ----: | -------: | -------: | ------: | ---: | ---------: |
|     300 | nav      |  1.00 |        0 |        — |       — |    0 |          0 |
|     300 | mount    |  1.00 |     21,0 |     91,0 |    83,0 |    0 |          1 |
|     300 | combined |  0,55 |        0 |     24,5 |    31,6 | 0,99 |          0 |
|     300 | repeat   |  1.00 |        0 |      n/a |     9,1 |    0 |          0 |
|     500 | mount    |  0,99 |     63,2 |    128,0 |   125,6 |    0 |          1 |
|     500 | combined |  0,57 |        0 |     30,7 |    44,6 | 0,77 |          0 |
|    1000 | mount    |  0,92 |    176,3 |    246,0 |   232,0 |    0 |          1 |
|    1000 | combined |  0,57 |        0 |     44,0 |    79,9 | 0,77 |          0 |
|    2000 | mount    |  0,69 |    392,4 |    458,1 |   447,1 |    0 |          1 |
|    2000 | combined |  0,56 |        0 |     65,0 |   217,7 | 0,85 |          0 |
|    3000 | mount    | 0,67† |       0† |     n/a† |   551,2 |    0 | 1 (547 ms) |
|    3000 | combined |  0,56 |     16,2 |     79,3 |   283,2 | 0,85 |  2 (64 ms) |

† **Artefacto de medición documentado**: en 2 de 3 runs de Angular mount a
3000, Lighthouse reporta TBT=0 / INP=n/a pese a una long task de 542–621 ms
(y MW 546–678 ms). En timespan, TBT/INP solo capturan bloqueo asociado a la
interacción; el montaje diferido de Angular cae fuera del next-paint
interactivo. La long task está presente en **todos** los runs (1/1/1,
542/621/547 ms) — el coste de montaje de Angular a 3000 es real (MW 546–678
ms) y supera al de React (469–479 ms).

### Flujos individuales

| Flujo | Dataset | Paso     | score A | TBT (ms) | INP (ms) | MW (ms) |  LT |
| ----- | ------- | -------- | ------: | -------: | -------: | ------: | --: |
| F1    | 30      | nav      |    1.00 |        0 |        — |       — |   0 |
| F2    | 500     | mount    |    0,99 |     64,7 |    135,5 |   126,3 |   1 |
| F3    | 500     | search   |    0,72 |        0 |     32,6 |    23,6 |   0 |
| F3    | 1000    | search   |    0,72 |        0 |     39,9 |    51,5 |   0 |
| F4    | 500     | combined |    0,55 |        0 |     33,6 |    39,9 |   0 |

## 10. Comparación directa

### Carga inicial (F1/F5-nav)

LCP/FCP prácticamente idénticos y planos en todo el rango (F5 nav: R 96,7 →
71,7 ms; A 76,9 → 76,9 ms; F1@30: 68,2 vs 63,6 ms). TBT=0, CLS=0, score 1.00
en ambos. La carga inicial **no discrimina** entre frameworks: el bundle JS
se descarga en paralelo y el montaje del Dashboard es diferido.

### Montaje (F5 mount; comparación con Fase 9.1 S1)

| Dataset | INP mount R (ms) | INP mount A (ms) | Δ (A−R) | TBT R (ms) | TBT A (ms) | MW R (ms) | MW A (ms) |
| ------: | ---------------: | ---------------: | ------: | ---------: | ---------: | --------: | --------: |
|     300 |             54,0 |             91,0 |   +37,0 |          0 |       21,0 |      60,7 |      83,0 |
|     500 |             85,2 |            128,0 |   +42,8 |       26,9 |       63,2 |      90,2 |     125,6 |
|    1000 |            165,2 |            246,0 |   +80,8 |      106,8 |      176,3 |     167,4 |     232,0 |
|    2000 |            324,5 |            458,1 |  +133,6 |      265,5 |      392,4 |     325,8 |     447,1 |
|    3000 |            468,0 |             n/a† |       — |      408,6 |         0† |     470,0 |     551,2 |

**El INP del montaje reproduce la direccionalidad y la forma de la curva de
Fase 9.1** (settle S1: 68,8→419,0 R / 76,5→496,9 A; Δ creciente, ratio ~1,18
constante). El cruce de 100 ms de INP ocurre entre 500 y 1000 en ambos
(React ~165 @1000; Angular ~246 @1000) — consistente con el cruce de settle
de S1 entre 300 y 600 (los valores absolutos difieren porque el harness es
distinto: CDP mount-settle vs INP de Lighthouse).

### Interacción (F5 combined / F3 / F4; comparación con Fase 9.2 S4/S2)

| Dataset | INP combined R (ms) | INP combined A (ms) | Δ (A−R) | MW R (ms) | MW A (ms) |
| ------: | ------------------: | ------------------: | ------: | --------: | --------: |
|     300 |                23,6 |                24,5 |    +0,9 |      64,7 |      31,6 |
|     500 |                28,4 |                30,7 |    +2,3 |      95,6 |      44,6 |
|    1000 |                44,6 |                44,0 |    −0,6 |     194,0 |      79,9 |
|    2000 |                72,5 |                65,0 |    −7,5 |     402,2 |     217,7 |
|    3000 |                99,6 |                79,3 |   −20,3 |     528,3 |     283,2 |

**La interacción combinada NO cruza 100 ms de INP mediana en el rango
medido**: React 99,6 ms @3000 (justo en el límite), Angular 79,3 ms @3000.
Consistente con Fase 9.2 (S4 no cruza 100 ms de settle hasta 2000). La
direccionalidad del trabajo síncrono de Fase 9.2 **se confirma en
main-thread-work** (R crece 65→528 ms, A 32→283 ms; la brecha crece con el
dataset), pero **el INP no reproduce esa brecha**: el trabajo síncrono extra
de React se reparte en tareas por debajo del umbral de INP (Fase 9.2: sync
React 78 ms vs settle 78 ms; la diferencia aparece solo en el trabajo de
fondo, no en la latencia de la interacción).

### Interacción repetida (F5 repeat)

MW 7,7→50,3 ms (R) y 9,1→63,3 ms (A) según dataset; INP n/a (la interacción
select genera poco trabajo). Sin long tasks salvo artefactos aislados en
Angular @3000 (1 run con LT 63 ms). **Sin acumulación entre interacciones**
— consistente con Fase 9.3 (s4b nunca genera long tasks).

### Resumen de scores de rendimiento (medianas)

| Métrica                    |       React |      Angular |
| -------------------------- | ----------: | -----------: |
| F1@30 score                |        1.00 |         1.00 |
| F5 mount score 300→3000    | 1.00 → 0,67 | 1.00 → 0,67† |
| F5 combined score 300→3000 | 0,56 → 0,80 |  0,55 → 0,56 |

El score combinado es bajo (0,55–0,57) en ambos por el CLS del timespan
(§13); el score de montaje cae con el dataset en ambos. **No usar el score
como métrica única** (limitación conocida de Lighthouse en timespan).

## 11. Correlación con Fases 7–9

| Microbenchmark                                              | Fase | Métrica Lighthouse                                                                        | ¿Direccionalidad consistente?                                                                                                                  |
| ----------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 mount-settle (300→3000: 68,8→419,0 R / 76,5→496,9 A)     | 9.1  | F5 mount **INP** (54→468 R / 91→n/a A; MW 470/551 @3000)                                  | **Sí** — Angular peor en montaje en todos los puntos medidos; cruce de 100 ms consistente (S1 settle entre 300–600; INP mount entre 500–1000). |
| S4 combined (React > Angular desde 500; sync R 78 ms @2000) | 9.2  | F5 combined **INP** (R ≥ A; nunca > 100 ms) + **MW** (brecha crece 33→245 ms)             | **Parcial** — el trabajo extra de React aparece (MW) pero el INP no lo traduce en latencia perceptible; ninguna métrica cruza 100 ms.          |
| S1→S4 e2e (total dominado por mount; Δ Angular +11→+84 ms)  | 9.3  | F5 mount INP + MW (dominio del montaje claro: mount INP 468/628 @3000 vs combined 100/79) | **Sí** — el montaje domina las métricas de interacción de Lighthouse.                                                                          |
| Fase 5.9 (accesibilidad 100/100, perf 0,97/0,99 móvil)      | 5.9  | F1@30 + a11y (score 1.00; a11y 1.00/1.00)                                                 | **Sí** — equivalencia de carga inicial y accesibilidad se mantienen.                                                                           |

**NO afirmamos causalidad** por co-dirección: los harness difieren (CDP
directo vs Lighthouse) y la correlación es de direccionalidad, no de
magnitud.

## 12. Diferencias significativas vs ruido

**Significativas (reproducibles, con dirección estable en los 3 runs):**

1. **Montaje grande**: INP mount de Angular > React en 300/500/1000/2000
   (Δ +37 → +134 ms) y MW mayor en todos los tamaños. En 3000, la long task
   de Angular (542–621 ms) > React (457–466 ms) y MW 551 vs 470 ms. Consistente
   con Fase 9.1/9.3.
2. **Trabajo incremental**: MW del combined de React crece muy por encima de
   Angular (Δ 33 → 245 ms). Consistente con Fase 9.2.
3. **Scores de montaje**: caen en ambos con el dataset (1.00 → 0,67–0,69 a
   2000–3000).

**Probablemente ruido / no discriminante:**

- LCP/FCP de carga inicial (R/A: 63–100 ms, solapados, sin dirección
  consistente).
- INP del combined en 300–1000 (Δ ±2 ms; direccionalidad inestable).
- CLS del timespan combinado (0,77–0,99; véase §13 — semántica distinta).
- Scores de rendimiento del combined (0,55–0,57, idénticos).

## 13. Accesibilidad

- **a11y@500**: score **1.00/1.00 (100/100)** en React y Angular (3 runs
  cada uno, 0 audits fallidos).
- Audits aprobados (17, **idénticos** en ambos frameworks):
  `aria-allowed-attr`, `aria-conditional-attr`, `aria-hidden-body`,
  `aria-prohibited-attr`, `aria-valid-attr-value`, `aria-valid-attr`,
  `button-name`, `color-contrast`, `document-title`, `heading-order`,
  `html-has-lang`, `html-lang-valid`, `list`, `listitem`, `meta-viewport`,
  `target-size`, `landmark-one-main`.
- **H51 CONFIRMADA**: accesibilidad equivalente (resultado idéntico a
  Fase 5.9).

**Nota sobre CLS del timespan**: el CLS alto (0,77–0,99) en los pasos
`combined` es un artefacto del modo timespan: mide los desplazamientos
producidos por el propio cambio de lista durante la interacción (el
contenido se sustituye), no el CLS de página (que es 0 en ambos, medido en
los pasos de navegación). Ambas apps tienen CLS de página 0; el CLS del
timespan es semánticamente distinto y NO debe compararse con el CLS de
Fase 5.9.

## 14. Limitaciones

- **localhost sin throttling** y perfil desktop: no representan condiciones
  de campo ni dispositivos móviles (Fase 5.9 sí usó móvil simulado; aquí es
  inviable para INP real sin distorsionar la interacción).
- **INP requiere** input de confianza + flag `EventTimingTracing`; la
  capacidad difiere entre versiones de chrome-headless-shell (sonda 1208/
  1223/1228 vs 1234); el script elige automáticamente una versión con INP.
- **Long tasks en timespan**: derivadas de `main-thread-tasks` (> 50 ms); el
  audit `long-tasks` es notApplicable en timespan (v13).
- **TBT/INP del montaje a 3000 en Angular**: artefacto documentado (TBT=0/
  INP=n/a en 2/3 runs pese a long task real de 542–621 ms) — el TBT/INP del
  timespan solo captura bloqueo ligado a la interacción.
- **CLS del timespan** ≠ CLS de página (§13).
- `page.type` dispara N interacciones; INP reporta la peor (semántica
  correcta de INP, pero el número de eventos depende del driver).
- **Builds del laboratorio Fase 9** (10 features + scale-dataset), no los
  monoliths oficiales (que no soportan > 30 tareas); los bundles oficiales se
  verifican intactos.
- **Una máquina local**; resultados indicativos (metrics.md §1).
- Navegación SPA: F2/F3/F4/F5 miden timespans sobre la sección Tasks, no
  navegaciones de página completas.

## 15. Amenazas a la validez

- **Harness distinto al de Fases 7–9** (CDP directo vs Lighthouse): las
  comparaciones de magnitud entre fases son solo contextuales; la comparación
  válida es React vs Angular dentro de esta fase.
- **Sesiones por run**: el ruido entre sesiones (GC, scheduling) se mitiga
  con n=3 y medianas, pero no se elimina.
- **El settle dentro del timespan** (150–250 ms) captura el next-paint de la
  interacción (requisito del INP); el observador de Lighthouse añade overhead
  no cuantificado (a diferencia de Fases 9.x, donde la sonda lo medía).
- **Selección de shell con INP**: si el entorno cambia el caché de
  Playwright, la sonda puede elegir otra versión con comportamiento distinto;
  el JSON registra la elegida (1228) y la sonda (29,6 ms).
- **CLS del timespan** puede confundirse con CLS real si se leen las tablas
  sin la nota de §13.

## 16. Veredictos H47–H52

| Hipótesis                                         | Veredicto                                  | Evidencia                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H47 — Equivalencia percibida**                  | **PARCIALMENTE CONFIRMADA**                | Equivalente en carga inicial (F1/F5-nav: LCP 63–100 ms, score 1.00) e interacciones pequeñas/moderadas (INP combined < 100 ms hasta 2000). **Divergencia medible en montaje grande**: INP mount 165/246 ms @1000, 324/458 ms @2000, long tasks 466/547 ms @3000.                              |
| **H48 — Coste de montaje en métricas de usuario** | **CONFIRMADA**                             | El INP/TBT del paso mount crece con el dataset en ambos (R TBT 0→409 ms; A TBT 21→392 ms) y cruza 100 ms entre 500 y 1000. LCP/FCP **no** capturan el montaje (la carga inicial es SPA diferida) — el coste aparece en INP/TBT de interacción, no en LCP.                                     |
| **H49 — Trabajo síncrono → INP**                  | **PARCIALMENTE CONFIRMADA**                | El trabajo extra de React aparece en **main-thread-work** (combined 65→528 vs 32→283 ms, brecha creciente) pero **no se traduce en INP** (23,6→99,6 vs 24,5→79,3 ms; Δ ≤ 20 ms). El INP no cruza 100 ms en el rango medido. La conversión sync→latencia observable NO ocurre a estos tamaños. |
| **H50 — Direccionalidad consistente**             | **CONFIRMADA**                             | Montaje grande → Angular peor (INP + MW; consistente con 9.1/9.3); flujo completo → dominado por montaje → Angular peor en total (MW 470 vs 551 @3000). Interacción incremental → React acumula más trabajo de fondo (MW) pero sin latencia extra (INP). Consistente con 9.2.                 |
| **H51 — Accesibilidad**                           | **CONFIRMADA**                             | 100/100 ambos, 0 audits fallidos, 17 audits aprobados idénticos.                                                                                                                                                                                                                              |
| **H52 — Umbral de divergencia perceptible**       | **CONFIRMADA (interacción: en el límite)** | El montaje cruza el umbral de 100 ms de INP entre 500 y 1000 en ambos (y 200 ms @2000). La interacción combinada se acerca al umbral solo en el máximo dataset (React 99,6 ms @3000). El umbral de divergencia está claramente en el **montaje**, no en la interacción.                       |

## 17. Conclusiones

1. **Los microbenchmarks de Fases 9.1–9.3 se confirman en métricas de
   usuario con dirección consistente**: el montaje de Angular es más caro
   (INP + MW en todos los tamaños) y el trabajo incremental de React crece
   más (MW), pero **el INP no convierte el trabajo extra de React en
   latencia perceptible** dentro de 300–3000 tareas.
2. **El umbral de degradación perceptible está en el montaje**, no en la
   interacción: INP mount cruza 100 ms entre 500 y 1000 (ambos) y 200 ms a
   2000 (ambos); INP combined no cruza 100 ms de mediana en todo el rango
   (React llega a 99,6 ms justo en 3000).
3. **El coste total del flujo real (F5) está dominado por el montaje**, como
   en Fase 9.3: el INP del montaje (468/628 ms @3000) es 5–8× el del
   combined (100/79 ms).
4. **La carga inicial y la accesibilidad siguen siendo equivalentes**
   (H51; F1 nav: LCP ~64–97 ms, score 1.00; a11y 100/100 idéntico), en
   línea con Fase 5.9.
5. **Sin ganador global**: React gana montaje, Angular gana el trabajo de
   fondo incremental; en latencia de interacción percibida son equivalentes
   hasta 3000 tareas. Esto cierra el ciclo de Fases 5–10 con un resultado
   consistente: **las diferencias son de régimen (montaje vs incremental),
   no de superioridad de framework**.

## 18. Siguiente experimento recomendado

1. **Escalar el combined más allá de 3000** (4000–6000) para localizar el
   cruce real de INP de React (a 3000 está en 99,6 ms): el único punto donde
   la interacción incremental podría volverse perceptible.
2. **Dispositivo lento (CPU throttling 4×–6×)** con datasets 1000–3000: la
   equivalencia de INP se midió sin throttling; en hardware real los long
   tasks de 3000 tareas (466–621 ms) degradarían la experiencia de forma
   diferente (fragmentación de tareas React vs bloques Angular — Fase 9.1).
3. **Móvil simulado (Lighthouse timespan con throttling)**: repetir F4/F5
   con el perfil móvil de Fase 5.9 para conectar ambas metodologías.
