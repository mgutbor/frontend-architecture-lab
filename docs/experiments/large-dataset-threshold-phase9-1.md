# Fase 9.1 — Umbral de degradación en grandes datasets (S1)

> Estado: **completado** · 220 iteraciones medidas (5 datasets × 2 frameworks × 10) + 80 de confirmación (4 datasets × 2 frameworks × 10) + 20 de sonda de overhead + 10 de warm-up por sesión.

## 1. Objetivo

Resolver la única pregunta que la Fase 9 dejó abierta: **¿existe un umbral de degradación perceptible al montar la vista completa (S1: navegación Projects → Tasks, que renderiza toda la lista) cuando el dataset crece de 300 a 3000 tareas?** Y si existe: en qué tamaño aparece, qué framework lo alcanza primero, si el crecimiento es lineal o cambia de régimen, si el trabajo síncrono y la latencia divergen, y si aparecen long tasks.

Se usa exclusivamente el escenario S1 de Fase 9, con las mismas 10 features de Fase 8 montadas (16 áreas), mismo viewport, mismo navegador, misma build de producción y el mismo dataset determinista (regla `scale-dataset.ts`). L2=300 se regenera dentro de esta fase como referencia contemporánea.

## 2. Hipótesis H31–H34

| ID      | Hipótesis                                                                                                                        | Métrica                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **H31** | Existe un tamaño dentro del rango experimental donde S1 supera 100 ms de settle en al menos un framework.                        | mediana de `duration` (tiempo hasta el commit completo de las N filas) |
| **H32** | El crecimiento de S1 entre 300 y 3000 puede caracterizarse como aproximadamente lineal, sublineal, superlineal o NO CONCLUYENTE. | pendiente ms/1000 elementos entre puntos consecutivos                  |
| **H33** | La diferencia React/Angular observada en S1 a 300 elementos se mantiene, aumenta o desaparece al crecer el dataset.              | Δ (Angular−React) y ratio por dataset                                  |
| **H34** | Las primeras long tasks aparecen antes o después del umbral de 100 ms y su aparición es atribuible al dataset, no a ruido.       | PerformanceObserver longtask por dataset                               |

Formuladas antes de medir; podían quedar CONFIRMADA / REFUTADA / NO CONCLUYENTE.

## 3. Diseño

- Solo S1 (montaje de la lista completa). Sin funcionalidades nuevas.
- Escalera de datos: **300 (L2 regenerado), 600, 1000, 1500, 3000** tareas, controladas por `?dataset=N` (mismo build de producción para todos los niveles; el dataset se resuelve en runtime).
- 10 iteraciones medidas por (framework, dataset), 1 warm-up; resets a Projects entre iteraciones.
- **Tandas de confirmación**: +10 iteraciones por framework en todo dataset cuya mediana o p95 de duración ≥ 100 ms (se ejecutaron en 600, 1000, 1500 y 3000).
- **Sonda de overhead del observador** en 1000: mismas 10 iteraciones con MutationObserver ON y OFF por framework, para cuantificar el coste del harness.
- Copia aislada `/tmp/lab-phase9-1` (clon APFS de la copia de Fase 8, HEAD `cc11abf`, baseline `367f089`). El árbol principal no se modifica.

## 4. Datasets

Generación determinista idéntica a Fase 9 (`scale-dataset.ts`): fixture de 30 + extras `task-031..task-3000`, títulos "Incident report N", status/prioridad/asignado/proyecto ciclando (project-006 sin tareas). Cada iteración verifica que la lista alcanza exactamente N filas (checkOk 10/10 en todas las celdas; parada controlada con error si no llega en el plazo).

## 5. Entorno

| Variable   | Valor                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Máquina    | local (macOS `darwin-arm64`); CPU/memoria en el JSON                                               |
| Node       | v25.3.0                                                                                            |
| Navegador  | chrome-headless-shell `HeadlessChrome/151.0.7922.34` (único headless funcional, Fases 4.1/5.1/7/9) |
| Copia      | `/tmp/lab-phase9-1` (HEAD `cc11abf` = c6 Fase 8; baseline `367f089`)                               |
| Servidores | estáticos Node http equivalentes, localhost sin red                                                |
| Viewport   | 1280×800, deviceScaleFactor 1                                                                      |

## 6. Metodología

**Protocolo mount-settle determinista** (framework-agnóstico): `t0 → click Tasks → tSync (dispatch síncrono) → poll hasta que .task-list li alcanza N → tRows → 2 rAF + macrotask + 100 ms de flush (recoge long tasks/mutaciones residuales) → t1`. Separación de fases:

- `sync` = tSync − t0 (trabajo síncrono del evento);
- `mountToRows` = tRows − tSync (commit diferido hasta DOM completo);
- `duration` = tRows − t0 (**commit / duración de interacción; métrica primaria del umbral**);
- `paintTail` = t1 − tRows (ventana de flush, informativa, ~constante);
- long tasks y mutaciones recogidas en la ventana completa [t0, t1].

**Decisión metodológica documentada**: se descartó una ventana de quiescencia fija (~150 ms) porque añade un piso que cruzaría 100 ms ya en el dataset menor y anularía la pregunta del umbral; en su lugar, `duration` = tiempo hasta el commit completo (las N filas en el DOM), que es el coste real de construir el árbol. La consistencia con Fase 9 (S1 a 300: 67,0/75,8 ms con el protocolo antiguo vs 68,8/76,5 ms aquí) valida el protocolo.

**Harness ligero**: long tasks + MutationObserver mínimo (childList + characterData; cuenta registros/nodos añadidos/eliminados; sin atributos ni clasificación de aislamiento — S1 es un montaje, no una actualización localizada). ScriptDuration de CDP NO se usa (no fiable en este headless-shell, verificado en Fase 7). Estadísticos por celda: n, mediana, min, max, p90, p95, desviación.

**Heurística de crecimiento** (documentada): pendiente por segmento = Δ / (Δtamaño/1000); |s2−s1| ≤ 0,25·max(|s1|,|s2|,1) → lineal; s2 < 0,75·s1 → sublineal; s2 > 1,25·s1 → superlineal; >2× → cambio de régimen.

**Umbrales operativos**: 50 / 100 / 200 ms como umbrales del experimento (NO equivalen automáticamente a percepción humana; se documenta). El principal es 100 ms.

## 7. Resultados crudos

Todos los valores por iteración están en `docs/experiments/results/large-dataset-threshold-phase9-1.json`. Resumen por celda (mediana; min–max; p95):

| Dataset |      React duration |    Angular duration | React p95 | Angular p95 | sync R/A | mountToRows R/A | muts (registros) R/A | heap Δ (kB) R/A |        nodesΔ R/A |
| ------- | ------------------: | ------------------: | --------: | ----------: | -------: | --------------: | -------------------: | --------------: | ----------------: |
| 300     |    68,8 (55,5–78,2) |    76,5 (72,1–84,4) |      78,2 |        84,4 |  0,3/0,1 |       68,6/76,4 |                    — |               — |   26 515 / 26 966 |
| 600     |  105,4 (94,6–116,0) |  124,1 (96,8–139,7) |     116,0 |       139,7 |  0,2/0,2 |     105,3/123,9 |                    — |               — |                 — |
| 1000    | 156,0 (152,0–183,7) | 183,5 (168,6–209,6) |     183,7 |       209,6 |  0,2/0,1 |     155,9/183,4 |                    — |               — |                 — |
| 1500    | 228,6 (216,8–256,8) | 274,6 (239,9–317,9) |     256,8 |       317,9 |  0,2/0,2 |     228,5/274,4 |                    — |               — |                 — |
| 3000    | 422,8 (393,5–487,9) | 499,5 (468,3–775,4) |     487,9 |       775,4 |  0,2/0,1 |     422,6/499,5 |                    — |               — | 264 115 / 268 616 |

(muts y heap completos en el JSON; en 3000: heap 17 872 / 20 428 kB por montaje.)

## 8. Resultados agregados (con confirmación)

| Dataset | React mediana → confirmación | Angular mediana → confirmación | Δ (A−R) | ratio | LT R/A (suma) | iteraciones >100 ms R/A | iteraciones >200 ms R/A |
| ------- | ---------------------------: | -----------------------------: | ------: | ----: | ------------: | ----------------------: | ----------------------: |
| 300     |                       68,8 — |                         76,5 — |    +7,7 | 1,11× |         0 / 0 |             0/10 / 0/10 |                     0/0 |
| 600     |                105,4 → 104,1 |                  124,1 → 126,5 |   +18,7 | 1,18× |         0 / 9 |             9/10 / 9/10 |                     0/0 |
| 1000    |                156,0 → 156,0 |                  183,5 → 185,9 |   +27,5 | 1,18× |        10 / 9 |           10/10 / 10/10 |                     0/1 |
| 1500    |                228,6 → 223,6 |                  274,6 → 266,0 |   +46,0 | 1,20× |       10 / 10 |           10/10 / 10/10 |                   10/10 |
| 3000    |                422,8 → 419,0 |                  499,5 → 496,9 |   +76,7 | 1,18× |       10 / 13 |           10/10 / 10/10 |                   10/10 |

Las tandas de confirmación reproducen la medición principal dentro de ±5 % en todos los puntos (mediana), salvo la cola de Angular en 3000 (máx. 775 ms en una iteración, mediana estable ~497–500 ms).

## 9. Análisis de escalabilidad

Pendientes por segmento (ms por 1000 elementos), mediana de duración:

| Segmento  | React | Angular |
| --------- | ----: | ------: |
| 300→600   | 122,0 |   158,7 |
| 600→1000  | 126,5 |   148,5 |
| 1000→1500 | 145,2 |   182,2 |
| 1500→3000 | 129,5 |   149,9 |

- **React**: pendientes 122–145 ms/1000 (rango ±10 % alrededor de ~130) → **aproximadamente lineal**.
- **Angular**: pendientes 148–182 ms/1000 (rango ±10 % alrededor de ~160) → **aproximadamente lineal**, con más ruido por segmento.
- **Sin cambio de régimen** hasta 3000: ninguna pendiente se desvía sostenidamente >25 % de la anterior; la pendiente de Angular (~160) es sistemáticamente ~1,2× la de React (~130).

## 10. Umbrales 50 / 100 / 200 ms

| Dataset |    >50 ms R/A |   >100 ms R/A |   >200 ms R/A |
| ------- | ------------: | ------------: | ------------: |
| 300     | 10/10 · 10/10 |   0/10 · 0/10 |         0 · 0 |
| 600     | 10/10 · 10/10 |   9/10 · 9/10 |         0 · 0 |
| 1000    | 10/10 · 10/10 | 10/10 · 10/10 |         0 · 1 |
| 1500    | 10/10 · 10/10 | 10/10 · 10/10 | 10/10 · 10/10 |
| 3000    | 10/10 · 10/10 | 10/10 · 10/10 | 10/10 · 10/10 |

**Umbral de 100 ms: entre 300 y 600 elementos, en ambos frameworks.** Por interpolación lineal entre los puntos medidos (estimación, no medida directa), Angular cruza 100 ms antes (~450 elementos; pendiente 158,7) que React (~555; pendiente 122,0), a pesar de que React es más rápido en todos los puntos medidos. El umbral de 200 ms se cruza entre 1000 y 1500 en ambos.

## 11. Long tasks

| Dataset | React (iteraciones con LT / suma) |    Angular | Duración típica (mediana) |
| ------- | --------------------------------: | ---------: | ------------------------: |
| 300     |                             0 / 0 |      0 / 0 |                         — |
| 600     |                             0 / 0 |   9/10 · 9 |    Angular ~52 ms (50–63) |
| 1000    |                        10/10 · 10 |   9/10 · 9 |                 ~50–60 ms |
| 1500    |                        10/10 · 10 | 10/10 · 10 |                 ~50–70 ms |
| 3000    |                        10/10 · 10 | 10/10 · 13 |                 ~50–90 ms |

- Las long tasks **aparecen desde 600** (Angular) y **1000** (React), nunca en 300 — presencia determinista ligada al dataset, reproducida en las tandas de confirmación; no son ruido de ejecución.
- **Matiz relevante**: en 600, React tiene mediana 105 ms (por encima del umbral) con **cero long tasks** — su trabajo de commit se reparte en tareas <50 ms — mientras Angular (124 ms) genera long tasks en 9/10 iteraciones. A partir de 1000 ambos producen long tasks en todas las iteraciones.

## 12. Sync vs settle (causalidad)

`sync` es **plano (~0,1–0,3 ms) en ambos frameworks y en todos los datasets**; `mountToRows ≈ duration` (el 99 %+ de la duración es commit diferido). Esto responde a la pregunta de Fase 9:

- La cadena "**más trabajo síncrono → mayor commit → mayor settle**" observada en S2/S3/S4 de Fase 9 **NO se reproduce en S1**: aquí no hay trabajo síncrono que crezca (React y Angular hacen ~0,2 ms síncronos en 300 y en 3000).
- Lo que crece en S1 es el **trabajo de commit diferido**, proporcional al DOM construido: nodesΔ pasa de ~26,5k (300) a ~264k (3000) nodos en ambos; la duración crece ~lineal con el número de filas (~122–158 ms por 1000 filas).
- Por tanto, la causa del cruce del umbral en S1 es el **coste de construcción del árbol** (commit), no el dispatch síncrono. La correlación dataset → DOM → duración sí es demostrable (monótona, reproducible); la cadena sync → settle no aplica (sync constante ≈ 0).

## 13. Comparación React/Angular

- **React es más rápido en todos los puntos medidos** (ratio ~1,11–1,20×, estable).
- La **diferencia absoluta crece con el dataset**: +7,7 → +18,7 → +27,5 → +46,0 → +76,7 ms (300→3000). La **ratio se mantiene ~constante** (~1,18). Es decir: la ventaja relativa de React en S1 es estable; la ventaja absoluta crece proporcionalmente al tamaño.
- **Chunking de trabajo**: a 600 ms de duración similar (105 vs 124), React reparte el trabajo sin long tasks mientras Angular los genera — diferencia en cómo se fraccionan las tareas de commit, no en la duración total.
- **Coincidencia con Fase 9**: S1 a 300 midió 67,0/75,8 ms (protocolo antiguo) vs 68,8/76,5 ms (protocolo nuevo) — consistencia excelente entre fases.

## 14. Análisis de causalidad

| Afirmación                                                    | Estado                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| El dataset determina el tamaño del DOM (nodesΔ ~proporcional) | **Medido** (26,5k → 264k nodos)                                                    |
| El tamaño del DOM determina el tiempo de commit               | **Medido** (crecimiento ~lineal, pendientes estables)                              |
| El trabajo síncrono del evento es despreciable en S1          | **Medido** (sync ~0,2 ms plano en ambos)                                           |
| "Más sync → más settle" explica el cruce del umbral           | **NO demostrado** (sync no crece; la causalidad es dataset → DOM → commit)         |
| El cruce del umbral es atribuible al dataset                  | **Sí** (monótono, reproducible, confirmado en 4 de 5 puntos)                       |
| Angular cruza 100 ms antes que React                          | **Estimación por interpolación** (~450 vs ~555), no medida directa entre 300 y 600 |

## 15. Limitaciones

1. **Protocolo nuevo**: `duration` = tiempo hasta commit completo (filas en DOM), no incluye pintura completa ni colas posteriores; el piso de la ventana de flush se reporta aparte (paintTail, informativo). Los absolutos solo son comparables dentro de esta fase (y con Fase 9 S1 a 300, validado).
2. **Overhead del harness**: la sonda en 1000 mide +9 ms (React) / +15,6 ms (Angular) por el MutationObserver mínimo — ~6 %/9 % del valor medido; las conclusiones de cruce del umbral se mantienen sin observador (React 147 / Angular 168 ms sin observer en 1000).
3. **Cuantización del poll**: el instante en que la lista se completa se detecta por polling de 16 ms (resolución ~16 ms, simétrica).
4. **Interpolación del cruce**: el punto exacto del umbral entre 300 y 600 es una estimación lineal, no una medida.
5. **Localhost sin throttling**: no representa condiciones de campo (CPU real, red, dispositivos móviles).
6. **Una máquina local**, un solo navegador headless: resultados indicativos, no benchmark científico (metrics.md §1).
7. **A 3000 filas (~265k nodos)**: el navegador se acerca a sus límites (una iteración de Angular alcanzó 775 ms); todas las celdas completaron y verificaron N filas, sin inestabilidad que obligara a detener el escalado.

## 16. Amenazas a la validez

- **Efecto de orden**: React siempre se mide antes que Angular en cada dataset; el estado de la máquina (temperatura, turbo) puede favorecer sistemáticamente al primero medido. Mitigación parcial: las tandas de confirmación repiten en orden distinto y reproducen los valores.
- **El harness afecta más a Angular** (más registros de mutación por construcción incremental): cuantificado en la sonda (+15,6 vs +9 ms), incluido en los valores reportados.
- **La medición de "settle" como commit-completo** subestima la percepción real si el navegador pinta en varias pasadas; para un montaje síncrono, pintar sigue al commit en un frame (~16 ms), simétrico entre frameworks.
- **Heurística de forma de crecimiento** sobre 5 puntos: clasifica "lineal" con margen, pero no es un ajuste estadístico.
- **Un solo escenario (S1)** por diseño de la fase: las conclusiones no se extrapolan a otros escenarios (Fase 9 mostró que S2/S3/S4 se comportan distinto).

## 17. Resultados inesperados

1. **Angular cruza 100 ms antes que React aunque es más lento en todos los puntos**: la pendiente más pronunciada de Angular (158,7 vs 122 ms/1000) hace que el cruce interpolado ocurra antes (~450 vs ~555 elementos). El orden del cruce y el orden de la magnitud son independientes.
2. **React supera 100 ms sin long tasks** (600: 105 ms, 0 LT) mientras Angular los genera — el fraccionamiento de tareas del commit es una propiedad distinta de la duración total.
3. **La brecha de latencia de S1 crece con el dataset** (7,7 → 76,7 ms) a ratio constante (~1,18×): la ventaja de React en montaje es proporcional, no fija.
4. **`sync` no participa en absoluto**: 0,2 ms plano en ambos, en contraste con los escenarios de filtro de Fase 9 donde el sync de React crecía (2→19 ms). En S1 el coste es 100 % commit diferido.

## 18. Veredictos

| Hipótesis                          | Veredicto                                                 | Evidencia                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H31 — Umbral de 100 ms**         | **CONFIRMADA**                                            | Ambos frameworks superan 100 ms de mediana entre 300 y 600 (600: React 105,4 / Angular 124,1; confirmado 104,1/126,5). Interpolación: cruce ~450 (Angular) / ~555 (React).                                                                                                                     |
| **H32 — Escalabilidad**            | **CONFIRMADA (lineal)**                                   | Pendientes por 1000 elementos: React 122–145 (≈130), Angular 148–182 (≈160); sin cambio de régimen hasta 3000; ninguna desviación sostenida >25 % entre segmentos.                                                                                                                             |
| **H33 — Diferencia React/Angular** | **CONFIRMADA (aumenta en absoluto, estable en relativo)** | Δ (A−R): 7,7 → 18,7 → 27,5 → 46,0 → 76,7 ms (300→3000); ratio estable 1,11–1,20 (≈1,18).                                                                                                                                                                                                       |
| **H34 — Long tasks**               | **CONFIRMADA**                                            | Primeras long tasks en 600 (Angular) / 1000 (React); nunca en 300; presencia determinista en todas las iteraciones a partir de 1000 (reproducida en confirmaciones) → atribuibles al dataset. Matiz: React a 600 (105 ms) no produce long tasks (trabajo <50 ms por tarea); Angular sí (9/10). |

## 19. Conclusiones

1. **Existe un umbral de degradación operativo (100 ms) en S1, y está entre 300 y 600 tareas** en ambos frameworks — mucho antes del límite de 3000 explorado. Con el dataset del laboratorio (30–300) el montaje quedaba por debajo; el laboratorio realista del contrato (≤ 30 tareas) está muy lejos del umbral, pero el patrón de la feature escala ~lineal hacia él.
2. **El crecimiento es aproximadamente lineal** en ambos (~130 vs ~160 ms por 1000 tareas), sin cambio de régimen hasta 3000. La constante de proporcionalidad de Angular es ~1,2× la de React.
3. **La diferencia React/Angular de S1 crece en términos absolutos** con el dataset (hasta +77 ms en 3000) a ratio constante — la ventaja de React en construcción de árbol se amplifica con el tamaño.
4. **El cruce del umbral no se explica por trabajo síncrono** (plano en ambos); se explica por el coste de commit proporcional al DOM (26,5k → 264k nodos). La cadena causal de Fase 9 (sync → settle) es específica de los escenarios de actualización; en el montaje no aplica.
5. **Las long tasks no son un simple subproducto del umbral**: React a 105 ms no las produce (commit fraccionado <50 ms) mientras Angular a 124 ms sí. El fraccionamiento de tareas es una propiedad independiente de la duración.
6. La consistencia con Fase 9 (S1 a 300: 67,0/75,8 vs 68,8/76,5 ms) valida el protocolo mount-settle nuevo.

## 20. Siguiente experimento recomendado

1. **Localizar el cruce con precisión entre 300 y 600** (400/450/500/550) para confirmar o refutar la estimación interpolada del orden del cruce (¿Angular antes que React?) — la única pregunta que esta fase deja con estimación, no medida.
2. **Fraccionamiento de tareas**: instrumentar el perfil de tareas del commit (no solo long tasks) para caracterizar por qué React reparte el montaje de 105 ms sin long tasks y Angular no — propiedad distinta de la duración, relevante para UX en dispositivos lentos.
3. **Fase 9 × 9.1**: repetir S2/S4 con datasets grandes ahora que se sabe que el montaje cruza 100 ms a ~500 filas, para medir si las actualizaciones incrementales (donde React sí acumula trabajo síncrono) cruzan el umbral antes o después que el montaje.

---

**Reproducibilidad**: `node scripts/measure-large-dataset-threshold-phase9-1.mjs /tmp/lab-phase9-1` (builds de producción + 5 datasets × 2 frameworks × 10 iteraciones + sonda + confirmaciones; resumible con `--datasets=a,b,c`, que fusiona con el JSON existente; `--quick` para N=3). La copia `/tmp/lab-phase9-1` se reconstruye con `cp -cR /tmp/lab-phase9 /tmp/lab-phase9-1` (dists incluidas; commits `367f089` baseline / `cc11abf` HEAD).
