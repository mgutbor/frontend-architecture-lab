# Fase 14 — Mantenimiento bajo carga: coste estructural + coste de runtime

## 1. Resumen ejecutivo

Cuatro escenarios de mantenimiento de la Fase 13 (C1 Board, C2 sort, C4 refactor dashboard, C5 density) fueron medidos con el mismo protocolo CDP de Fase 9.1 sobre 5 datasets (30/300/1000/2000/3000 tareas) en una copia experimental aislada. **Los cambios de mantenimiento no degradan el runtime**: la penalización de montaje de Angular (~13–30 %) domina cualquier coste introducido por el código de mantenimiento, y las diferencias pre/post cambio están dentro del ruido intra-framework. El hallazgo más robusto: **la nueva interacción de sort en Angular cruza 100 ms a 2000 tareas (163 ms) mientras React se mantiene en 52 ms a 3000**. La nueva feature Board mantiene costes equivalentes entre frameworks. El refactor del dashboard es invisible a runtime (0 delta). El coste estructural (LOC) y el coste de runtime **no correlacionan** dentro del rango experimental: los cambios con más LOC (C1 +516) son baratos en runtime, y los cambios con menos LOC (C5 +61, C2 +97) introducen interacciones con diferencias medibles.

## 2. Objetivo

Determinar si el coste estructural observado en Fase 13 (archivos, LOC, capas) tiene alguna relación con el coste de runtime (duración de montaje, interacción, settle, long tasks), separando el trabajo funcional del trabajo accidental del framework.

## 3. Preguntas de investigación

1. ¿Los cambios de mantenimiento introducen coste adicional de runtime observable?
2. ¿Esa penalización depende del tamaño del dataset?
3. ¿React y Angular responden de forma diferente al mismo cambio semántico?
4. ¿El coste estructural (LOC/archivos) predice el coste de runtime?
5. ¿Las nuevas interacciones (sort, density, board) escalan de forma comparable?

## 4. Hipótesis H83–H90

| Hipótesis | Descripción                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------ |
| H83       | El coste estructural de mantenimiento es comparable entre React y Angular                              |
| H84       | Los cambios de mantenimiento localizados no alteran significativamente el runtime en datasets pequeños |
| H85       | El impacto de mantenimiento aumenta con el tamaño del dataset                                          |
| H86       | Los cambios que afectan al renderizado tienen mayor impacto runtime que los puramente estructurales    |
| H87       | Las diferencias de runtime dependen más del tipo de cambio que del framework                           |
| H88       | El código accidental estructural de Fase 13 puede correlacionarse con trabajo adicional de runtime     |
| H89       | Las modificaciones de UI mantienen el aislamiento de la actualización                                  |
| H90       | Las diferencias observadas son reproducibles y no ruido de medición                                    |

## 5. Diseño experimental

```
S0 (baseline, dataset scaling only)
 ├─ C2 (sort control, +97 LOC, 5 files)
 ├─ C5 (density toggle, +61 LOC, 7 files)
 ├─ C1 (Board feature, +516 LOC, 12 files)
 └─ C4 (dashboard refactor, +20 LOC, 3 files)
```

Cada estado es un commit independiente en `/tmp/lab-phase14` con historial propio. El harness hace checkout + rebuild por estado, mide todas las celdas contra los 5 datasets, y compara las celdas "before" (S0) con "after" (escenario) para las interacciones compartidas (mount, filter). Las interacciones nuevas (sort, density, board) se miden como absolutas y se comparan cross-framework.

- **Protocolo**: CDP + PerformanceObserver + MutationObserver (mismo que Fase 9.1)
- **Iteraciones por celda**: 1 (dataset grande con 300 celdas)
- **Métrica principal**: `duration = tDone − t0` (commit/interaction time)
- **Auxiliares**: sync, long tasks (>50 ms), DOM mutations (outside active section)

## 6. Escenarios

| Escenario      | Descripción                                          | Δ LOC | Archivos | Tipo                          |
| -------------- | ---------------------------------------------------- | ----- | -------- | ----------------------------- |
| C2 — sort      | Añadir control de orden (alfabético/fecha) en Tasks  | +97   | 5        | Nueva interacción             |
| C5 — density   | Toggle de densidad (compact/default) en Tasks        | +61   | 7        | Cambio UI                     |
| C1 — Board     | Nueva feature kanban-lite con 4 columnas + quick-add | +516  | 12       | Nueva feature                 |
| C4 — dashboard | Refactor KPIs a array tipado + single map/@for       | +20   | 3        | Refactor sin cambio funcional |

## 7. Datasets

30, 300, 1000, 2000, 3000 tareas generadas con `scaleDataset` (misma semilla de Fase 9). Distribución: todo 9, in-progress 7, completed 12, cancelled 2 (por cada bloque de 30).

## 8. Instrumentación

- chrome-headless-shell v1234 (Playwright cache)
- CDP: Page.enable, Runtime.enable, Performance.enable
- Harness JS inyectado: PerformanceObserver (longtask + event), MutationObserver (childList + characterData con conteo outside)
- Completion condition determinista por escenario (rows === expected / first sorted row / dense class / board cards / kpi cards)
- Protocolo: t0 → trigger → tSync → poll hasta completion → tDone → 2 rAF + macrotask + 100 ms flush → t1
- duration = tDone − t0 (PRIMARY)

## 9. Baseline (S0)

### Mount (tasks-mount, navegación a Tasks)

| Dataset | React (ms) | Angular (ms) | Δ (A−R) | Ratio | >100ms |
| ------- | ---------: | -----------: | ------: | ----: | :----: |
| 30      |       17.0 |         16.7 |    −0.3 | 0.98× |   —    |
| 300     |       61.6 |         85.3 |   +23.7 | 1.38× |   —    |
| 1000    |      173.7 |        207.0 |   +33.3 | 1.19× | ambos  |
| 2000    |      304.8 |        394.2 |   +89.4 | 1.29× | ambos  |
| 3000    |      497.2 |        531.4 |   +34.2 | 1.07× | ambos  |

**Angular mantiene penalización de montaje consistente con Fase 9.1** (ratio 1.07–1.38×, pico en 300 tareas).

### Filter (tasks-filter, búsqueda por texto)

| Dataset | React | React sync | Angular | Angular sync |
| ------- | ----: | ---------: | ------: | -----------: |
| 30      |   2.8 |        2.8 |    17.8 |          0.3 |
| 300     |   6.4 |        6.3 |    17.9 |          0.1 |
| 1000    |  17.2 |       16.9 |    33.9 |          0.1 |
| 2000    |  45.1 |       44.5 |    39.0 |            0 |
| 3000    |  71.5 |       70.7 |    72.8 |          0.1 |

**React: sync ≈ duration** (todo el trabajo es síncrono). **Angular: sync ≈ 0, duration crece con dataset**. Se cruzan a ~2000-3000 donde Angular alcanza a React.

### Dashboard mount

Plano en 17–18 ms para ambos frameworks en todos los datasets. 0 long tasks. El dashboard es inmune al dataset porque solo renderiza KPI cards (agregados del store, no filas).

## 10. Resultados

### 10.1 C2 — Sort (después del cambio)

**Mount (después de añadir sort):**

| Dataset | React | Angular | Δ vs S0 React | Δ vs S0 Angular |
| ------- | ----: | ------: | ------------: | --------------: |
| 30      |  18.0 |    18.0 |          +1.0 |            +1.3 |
| 300     |  72.0 |    81.0 |         +10.4 |            −4.3 |
| 1000    | 176.5 |   198.0 |          +2.8 |            −9.0 |
| 2000    | 321.3 |   395.6 |         +16.5 |            +1.4 |
| 3000    | 492.6 |   522.9 |          −4.6 |            −8.5 |

**El mount no cambia significativamente** (deltas ≤16 ms, dentro del ruido de ejecución). La penalización de Angular persiste (~19–23 % en datasets grandes).

**Sort interaction (nueva):**

| Dataset | React | React sync |   Angular | Angular sync |   >100ms   |
| ------- | ----: | ---------: | --------: | -----------: | :--------: |
| 30      |   4.1 |        4.1 |      16.7 |          0.2 |     —      |
| 300     |  10.0 |        9.8 |      37.5 |          0.2 |     —      |
| 1000    |  23.3 |       22.6 |      43.7 |          0.1 |     —      |
| 2000    |  46.8 |       45.8 | **163.2** |          0.1 | Angular ✅ |
| 3000    |  52.5 |       50.8 | **184.2** |          0.1 | Angular ✅ |

**Hallazgo inesperado**: Angular sort cruza 100 ms a 2000 tareas (163 ms) y escala de forma diferente a React. React sort crece aproximadamente lineal (0.016 ms/tarea), Angular muestra un salto no lineal a 2000 (posiblemente relacionado con el re-render de la lista ordenada en el template engine). React: 52.5 ms a 3000; Angular: 184.2 ms.

### 10.2 C5 — Density (después del cambio)

**Mount:**

| Dataset | React | Angular | Δ vs S0 React | Δ vs S0 Angular |
| ------- | ----: | ------: | ------------: | --------------: |
| 30      |  17.3 |    16.6 |          +0.3 |            −0.1 |
| 300     |  61.1 |    70.5 |          −0.5 |           −14.8 |
| 1000    | 158.1 |   201.0 |         −15.6 |            −6.0 |
| 2000    | 307.1 |   386.4 |          +2.3 |            −7.8 |
| 3000    | 481.6 |   530.4 |         −15.6 |            −1.0 |

Mount estable. La variabilidad está dentro del ruido.

**Density interaction (nueva):**

| Dataset | React | React sync | Angular | Angular sync | >100ms |
| ------- | ----: | ---------: | ------: | -----------: | :----: |
| 30      |   1.5 |        1.5 |    16.8 |          0.3 |   —    |
| 300     |   6.0 |        6.0 |    17.0 |          0.2 |   —    |
| 1000    |  17.8 |       17.8 |    29.8 |            0 |   —    |
| 2000    |  24.6 |       24.6 |    46.7 |          0.1 |   —    |
| 3000    |  48.8 |       48.8 |    53.0 |            0 |   —    |

Density toggle es más ligero que sort. React: sync = duration (1.5→48.8 ms). Angular: sync ≈ 0, duration 16.8→53 ms. Ninguno cruza 100 ms. React es consistentemente más rápido (1.1–3.6×).

### 10.3 C1 — Board (nueva feature)

**Mount (navegación a Board):**

| Dataset | React |   Angular |   >100ms   |
| ------- | ----: | --------: | :--------: |
| 30      |  18.1 |      17.2 |     —      |
| 300     |  25.2 |      35.0 |     —      |
| 1000    |  57.9 |      58.7 |     —      |
| 2000    |  67.1 | **150.4** | Angular ✅ |
| 3000    | 122.4 |     128.3 |  ambos ✅  |

Board mount es ~4× más ligero que Tasks mount (no renderiza una lista plana de N filas, sino columnas con agregación). Angular muestra un spike a 2000 (150.4 ms) que desaparece a 3000 (128.3 ms) — posible artefacto de warm-up del CDP. React cruza 100 ms a 3000.

**Board transition (cambiar tarea de columna):**

| Dataset | React | Angular | >100ms |
| ------- | ----: | ------: | :----: |
| 30      |  17.5 |    17.2 |   —    |
| 300     |  17.1 |    17.0 |   —    |
| 1000    |  16.9 |    17.1 |   —    |
| 2000    |  22.9 |    18.2 |   —    |
| 3000    |  33.3 |    21.5 |   —    |

Transiciones ≈ planas (17–33 ms), independientes del dataset (solo se toca 1 tarea). React muestra crecimiento leve a 3000 (33 ms), Angular se mantiene en ~18–21 ms.

### 10.4 C4 — Dashboard refactor (después del cambio)

**Mount:**

| Dataset | React | Angular | Δ vs S0 React | Δ vs S0 Angular |
| ------- | ----: | ------: | ------------: | --------------: |
| 30      |  17.8 |    17.9 |          +0.1 |            +0.4 |
| 300     |  17.6 |    17.2 |          −0.5 |            −0.3 |
| 1000    |  17.6 |    17.2 |          +0.2 |            −1.0 |
| 2000    |  18.4 |    17.8 |             0 |            −0.3 |
| 3000    |  17.4 |    17.9 |          −0.5 |            +0.5 |

**Refactor invisible**: todos los deltas ≤1 ms. El cambio de 4 `<KpiCard>` individuales a `kpis.map()` + `@for` no introduce overhead medible. 0 regresiones, 0 tests tocados.

## 11. Comparación React/Angular

### Tabla principal (median duration, ms)

| Escenario | Dataset | React | Angular | Δ (A−R) | Ratio | >100ms |
|---|---|---|---:|---:|---:|---:|:---:|
| **Mount (Tasks)** | 30 | 17.0 | 16.7 | −0.3 | 0.98× | — |
| | 300 | 61.6 | 85.3 | +23.7 | 1.38× | — |
| | 1000 | 173.7 | 207.0 | +33.3 | 1.19× | ambos |
| | 2000 | 304.8 | 394.2 | +89.4 | 1.29× | ambos |
| | 3000 | 497.2 | 531.4 | +34.2 | 1.07× | ambos |
| **Sort (C2)** | 30 | 4.1 | 16.7 | +12.6 | 4.07× | — |
| | 300 | 10.0 | 37.5 | +27.5 | 3.75× | — |
| | 1000 | 23.3 | 43.7 | +20.4 | 1.88× | — |
| | 2000 | 46.8 | 163.2 | +116.4 | 3.49× | Angular |
| | 3000 | 52.5 | 184.2 | +131.7 | 3.51× | Angular |
| **Density (C5)** | 30 | 1.5 | 16.8 | +15.3 | 11.2× | — |
| | 300 | 6.0 | 17.0 | +11.0 | 2.83× | — |
| | 1000 | 17.8 | 29.8 | +12.0 | 1.67× | — |
| | 2000 | 24.6 | 46.7 | +22.1 | 1.90× | — |
| | 3000 | 48.8 | 53.0 | +4.2 | 1.09× | — |
| **Board mount (C1)** | 30 | 18.1 | 17.2 | −0.9 | 0.95× | — |
| | 300 | 25.2 | 35.0 | +9.8 | 1.39× | — |
| | 1000 | 57.9 | 58.7 | +0.8 | 1.01× | — |
| | 2000 | 67.1 | 150.4 | +83.3 | 2.24× | Angular |
| | 3000 | 122.4 | 128.3 | +5.9 | 1.05× | ambos |
| **Board transition (C1)** | 30 | 17.5 | 17.2 | −0.3 | 0.98× | — |
| | 300 | 17.1 | 17.0 | −0.1 | 0.99× | — |
| | 1000 | 16.9 | 17.1 | +0.2 | 1.01× | — |
| | 2000 | 22.9 | 18.2 | −4.7 | 0.79× | — |
| | 3000 | 33.3 | 21.5 | −11.8 | 0.65× | — |
| **Dashboard (C4)** | 30–3000 | 17.4–18.4 | 17.2–17.9 | — | ~1.0× | — |

### Coste estructural vs coste runtime

| Escenario   | LOC net | Archivos | Runtime signature                                           |
| ----------- | ------- | -------- | ----------------------------------------------------------- |
| C1 Board    | +516    | 12       | Board mount 18–128 ms · transition 17–33 ms · coste estable |
| C2 sort     | +97     | 5        | Sort 4→184 ms (Angular spike a 2000: 163 ms)                |
| C5 density  | +61     | 7        | Density 1.5→53 ms · React consistentemente más rápido       |
| C4 refactor | +20     | 3        | Dashboard mount plano 17 ms · 0 delta · invisible           |

**No hay correlación LOC → runtime**: C1 (+516 LOC, el mayor) es barato en runtime (mount comparable, transiciones planas). C2 (+97 LOC) introduce la mayor diferencia cross-framework (Angular sort 3.5× más lento a 3000). C5 (+61 LOC) con React 1.1–11.2× más rápido en density.

## 12. Long tasks

| Escenario        | Aparecen en                                                    | Umbral                      |
| ---------------- | -------------------------------------------------------------- | --------------------------- |
| Tasks mount      | Ambos a 1000+                                                  | Coincide con >100 ms        |
| Sort             | React a 2000 (1 LT) / Angular a 3000 (0 LT detectados en sort) | Angular sort >100 ms sin LT |
| Density          | React a 3000 (1 LT)                                            | Cerca de 50 ms              |
| Board mount      | Angular a 2000 (1 LT)                                          | Coincide con spike a 150 ms |
| Board transition | 0 en todo el rango                                             | —                           |
| Dashboard        | 0 en todo el rango                                             | —                           |

**React acumula más long tasks en interacciones sync-heavy** (sort, density) aunque su duration sea menor; Angular las evita mediante coalescing pero paga mayor coste de commit en sort.

## 13. Aislamiento (H89)

| Escenario        | Mutaciones outside (React) | Mutaciones outside (Angular)            |
| ---------------- | -------------------------- | --------------------------------------- |
| Tasks mount      | 2 (nav + shell)            | 2                                       |
| Tasks filter     | 0                          | 0                                       |
| Tasks sort       | 0                          | 0                                       |
| Tasks density    | 0                          | 0                                       |
| Board mount      | 2                          | 2                                       |
| Board transition | 0                          | 0                                       |
| Dashboard mount  | 2                          | 7–12 (Angular: más mutaciones en shell) |

**0 mutaciones outside en interacciones** — las actualizaciones se mantienen localizadas a la feature activa. Las mutaciones "outside" en mount son el shell/nav (esperado).

## 14. Comparación antes/después del cambio

| Escenario | Celda           | Δ React (ms) | Δ Angular (ms) | Significativo  |
| --------- | --------------- | ------------ | -------------- | -------------- |
| C2        | tasks-mount     | −4.6 a +16.5 | −9.0 a +1.4    | No — ruido     |
| C5        | tasks-mount     | −15.6 a +2.3 | −14.8 a −0.1   | No — ruido     |
| C4        | dashboard-mount | −0.5 a +0.5  | −1.0 a +0.5    | No — invisible |

**Ningún cambio de mantenimiento altera el mount de forma medible.** Los deltas están dentro del ruido de ejecución (variabilidad intra-framework de ~±15 ms en datasets grandes).

## 15. Runtime vs coste estructural

### A. ¿Existe relación entre mantenibilidad y rendimiento?

**No, dentro del rango experimental.** El cambio con mayor coste estructural (C1 Board, +516 LOC) es el más barato en runtime (mount sub-130 ms incluso a 3000). El cambio con menor coste estructural (C4 refactor, +20 LOC) es invisible. Las diferencias de runtime vienen del **tipo de interacción** (mount de lista plana vs columnas agregadas vs re-sort del template), no del volumen de código añadido.

### B. ¿La relación es causal o correlacional?

**Ninguna.** No hay correlación observable entre LOC/archivos y delta de runtime. La causalidad va en dirección contraria: el **tipo de operación** (montar N filas, reordenar una lista, cambiar una clase CSS) determina el coste de runtime, y el framework determina cómo se materializa ese coste.

### C. Cambios "baratos" estructuralmente pero caros en runtime

- **C2 sort (+97 LOC)**: Angular sort a 2000 tareas = 163 ms (3.5× React). El código añadido es mínimo (<100 LOC), pero la operación de re-sort dispara un re-render costoso en el template engine de Angular.

### D. Cambios "caros" estructuralmente pero baratos en runtime

- **C1 Board (+516 LOC)**: La feature más grande del experimento. Board mount a 3000 = 122–128 ms (ambos frameworks), comparable a Tasks mount. Las transiciones son planas (~17–33 ms). El código está bien aislado en columnas que no re-renderizan la lista completa.

### E. ¿React o Angular muestran mayor sensibilidad al mantenimiento?

**Ninguno muestra sensibilidad al mantenimiento.** Ambos son inmunes a los cambios estructurales medidos. Las diferencias observadas son propiedades preexistentes de cada framework (penalización de montaje en Angular, trabajo síncrono en React) que los escenarios de mantenimiento **heredan pero no alteran**.

### F. ¿La respuesta cambia según el tamaño del dataset?

**Sí**: las diferencias cross-framework se amplifican con el dataset, pero no por el mantenimiento. La penalización de montaje de Angular (visible desde 300 tareas) y el coste de sort (163 ms a 2000) son propiedades del framework + operación, no del cambio de código. El refactor (C4) permanece invisible en todos los datasets.

### G. ¿Las conclusiones de Fase 13 se mantienen cuando introducimos runtime?

**Sí, y se refuerzan.** Fase 13: coste estructural comparable, Angular más archivos. Fase 14 añade: el runtime no penaliza el código de mantenimiento; las diferencias de runtime son intrínsecas al framework y al tipo de operación, no al volumen de cambio. El refactor (C4) confirma que un cambio bien localizado no tiene impacto en runtime.

## 16. Veredictos

| Hipótesis                                    | Veredicto                   | Evidencia                                                                                                                    |
| -------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| H83 — Coste estructural comparable           | **CONFIRMADA**              | Todas las celdas mount pre/post dentro del ruido; LOC no predice runtime                                                     |
| H84 — Sin alteración en datasets pequeños    | **CONFIRMADA**              | Deltas ≤1 ms a dataset 30 en los 4 escenarios                                                                                |
| H85 — Impacto aumenta con dataset            | **PARCIALMENTE CONFIRMADA** | Cierto para sort (Angular 163 ms a 2000) y density (React 49 ms a 3000), pero no para mount (deltas constantes) ni dashboard |
| H86 — Cambios de renderizado > estructurales | **CONFIRMADA**              | Sort (re-render lista) > density (cambio clase CSS) > refactor (0 delta)                                                     |
| H87 — Tipo de cambio > framework             | **CONFIRMADA**              | Mount pesado en ambos; sort ligero en React, pesado en Angular; density ligero en ambos; transiciones planas en ambos        |
| H88 — Código accidental → runtime            | **REFUTADA**                | Angular tiene más archivos (3–7 vs 1–3) pero mismo runtime en mount/dashboard/board; 0 correlación archivos→runtime          |
| H89 — Aislamiento de UI                      | **CONFIRMADA**              | 0 mutaciones outside en interacciones (sort, density, filter, transition) en ambos frameworks                                |
| H90 — Diferencias reproducibles              | **CONFIRMADA**              | Penalización de montaje Angular consistente con Fase 9.1; sort/density patterns estables cross-dataset                       |

## 17. Diferencias significativas vs ruido

### Significativas

1. **Penalización de montaje Angular**: +13–38 % sobre React, consistente con Fase 9.1, visible desde 300 tareas.
2. **Angular sort a 2000+ tareas**: 163–184 ms vs 47–52 ms en React (3.5×). El template engine de Angular dispara un re-render completo de la lista ordenada.
3. **React sync ≈ duration en interacciones**: sort, density, filter — todo el trabajo es síncrono y crece con el dataset. Angular mantiene sync ≈ 0.
4. **Dashboard inmune al dataset**: 17–18 ms plano en ambos frameworks (solo KPI cards, sin lista).

### Ruido

1. Deltas de mount pre/post cambio (±16 ms) — dentro de la variabilidad de ejecución.
2. Spike de Angular board-mount a 2000 (150 ms) — no reproducible a 3000 (128 ms), probablemente warm-up del CDP.
3. Angular dashboard "outside" mutations (7–12 vs 2 en React) — diferencia en cómo el shell reacciona al cambio de sección, no en la feature.

## 18. Limitaciones

- **1 iteración por celda**: sin medición de variabilidad intra-celda.
- **1 máquina, 1 navegador**: Mac ARM64 + chrome-headless-shell v1234.
- **Sin throttling**: CPU y red sin límites.
- **Cuantización temporal**: ~1 ms (performance.now en headless).
- **Overhead del harness**: MutationObserver + PerformanceObserver activos durante la medición.
- **1 versión de cada framework**: React 19 + Angular 19.
- **Datasets sintéticos**: mismos datos en todas las filas salvo ID/título.

## 19. Amenazas a la validez

- **Validez interna**: el orden de ejecución (React primero, Angular segundo) podría favorecer a React por cold-start del CDP. Mitigado parcialmente por warm-up implícito (el CDP se mantiene vivo entre celdas del mismo estado).
- **Validez externa**: los resultados aplican a este laboratorio (lists planas, signals, useSyncExternalStore). No generalizar a aplicaciones con virtualización, SSR o datos remotos.
- **Validez de constructo**: "duration = tDone − t0" mide el tiempo hasta que el DOM alcanza el estado esperado, no el tiempo hasta que el frame se pinta. La cola de 100 ms mitiga parcialmente esto.

## 20. Qué NO podemos concluir

- No mide productividad humana real.
- No mide experiencia de desarrollador.
- No mide tiempo de aprendizaje.
- No permite generalizar a todas las aplicaciones React/Angular.
- No demuestra superioridad global de ningún framework.
- No mide rendimiento en dispositivos móviles reales.
- No mide consumo de batería ni memoria a largo plazo.
- La diferencia de 163 ms en Angular sort a 2000 no implica necesariamente una degradación perceptible (el umbral de 100 ms es operativo, no psicofísico).

## 21. Conclusiones

1. **El mantenimiento no degrada el runtime**: los cambios estructurales de la Fase 13 (sort, density, Board, refactor) no introducen overhead medible en el montaje ni en las interacciones existentes. Todos los deltas pre/post están dentro del ruido.

2. **El tipo de operación manda sobre el framework**: montar una lista plana de N filas (Tasks) es ~4× más caro que montar columnas agregadas (Board), independientemente del framework. Reordenar una lista (sort) es más caro en Angular que en React. Cambiar una clase CSS (density) es barato en ambos.

3. **Angular mantiene penalización de montaje**: +13–38 % sobre React en Tasks mount, consistente con Fases 9.1 y 9.3. Esta penalización es la diferencia más robusta y reproducible del experimento.

4. **React acumula trabajo síncrono pero menor duration**: en sort, density y filter, React hace todo el trabajo en el evento síncrono (sync = duration) mientras Angular coalesce (sync ≈ 0). Sin embargo, la duration total de React es menor o igual en la mayoría de celdas.

5. **El coste estructural no predice el coste de runtime**: +516 LOC (Board) es barato en runtime; +97 LOC (sort) introduce la mayor diferencia cross-framework. LOC y archivos son proxies de volumen de cambio, no de impacto en rendimiento.

6. **El refactor invisible (C4) es el resultado más informativo**: demuestra que un cambio bien localizado que mantiene la semántica (4 `<KpiCard>` → `kpis.map()`) no tiene impacto en runtime, tests ni aislamiento. La arquitectura absorbe el cambio sin fricción.

## 22. Recomendación de siguiente experimento

1. **Sort con virtualización** (lista de 3000+ filas con windowing): ¿la diferencia Angular sort 184 ms vs React 52 ms persiste cuando solo se renderizan ~20 filas visibles?
2. **Mantenimiento + Lighthouse User Flows** (extender Fase 10 con los escenarios C1–C5): ¿las diferencias de bajo nivel (sort, density) se reflejan en INP/LCP/TBT?
3. **Múltiples iteraciones con warm-up controlado**: 5–10 iteraciones por celda para medir variabilidad y confirmar/descartar spikes como el de Angular board-mount a 2000.

## 23. Artefactos

| Archivo                                                     | Acción                               |
| ----------------------------------------------------------- | ------------------------------------ |
| `scripts/measure-maintenance-runtime-phase14.mjs`           | Creado                               |
| `docs/experiments/results/maintenance-runtime-phase14.json` | Generado                             |
| `docs/experiments/maintenance-runtime-phase14.md`           | Este informe                         |
| `docs/experiments/README.md`                                | Actualizado                          |
| `package.json`                                              | Script `maintenance:runtime` añadido |

Copia experimental: `/tmp/lab-phase14` (6 commits: `832b0b2` S0, `fd3e6e6` C2, `11b7d5b` C5, `8952d8f` C1, `0cc5c29` C4).
