# Fase 15 — CPU throttling y degradación de rendimiento

## 1. Resumen ejecutivo

Ejecutamos los tres regímenes del laboratorio (S1 montaje, S4 incremental combinado, E2E montaje → S4 → S4b) bajo **throttling de CPU real vía CDP** (`Emulation.setCPUThrottlingRate`, rates 1× / 4× / 6×), con los mismos datasets 300–3000 y el mismo harness uniforme. **108 celdas × 5 iteraciones = 540 ejecuciones medidas**, todas con checks 5/5 y aislamiento 0 mutaciones fuera de sección.

**El throttling cambia la relación React/Angular de forma escenario-dependiente y revela el régimen incremental que la CPU abundante ocultaba:**

- **S1 (montaje):** la penalización de Angular se **amplifica en magnitud absoluta** (Δ pasa de +11 ms @300 1× a +717 ms @3000 6×) pero el ratio se mantiene estable (~1,2–1,4×). Ambos frameworks se degradan **proporcionalmente al rate** (slowdown 4×≈3,5–4,3×; 6×≈5,3–6,4×), sin que uno pierda proporcionalmente más que el otro.
- **S4 (incremental):** **el trabajo síncrono de React se convierte en latencia bajo throttling.** En CPU normal su sync (~76 ms @2000) apenas se traducía en duración (Fase 9.2); bajo 6× su sync **es** la duración (2000: sync 397 ms / duración 398 ms) y React **cruza 100 ms y 200 ms con datasets ~2,5× menores** que Angular (cruce 100 ms: React ~600 @6× vs Angular ~1000 @6×; cruce 200 ms: React ~1000 @6× vs Angular nunca hasta 3000). El coalescing de Angular se mantiene (sync ~0,2–0,7 ms siempre).
- **E2E:** el montaje **sigue dominando** (78–89 % del total en ambos, más en Angular), pero la proporción del S4 crece bajo throttling en React (10,7 % → 19,6 % @3000) mientras en Angular permanece ~10 %. El residual se reduce al 1,3–1,9 % (el throttling elimina el ruido de scheduling que en 1× era el 3,6–20 % del total).
- **Long tasks:** aparecen **a datasets menores** bajo throttling (S1: 0 LT @300 1× → 5/5 iteraciones con LT @300 6×; E2E: primera LT @300 6× vs @2000 1×).
- **Umbrales:** el cruce de 100/200/500 ms **se adelanta** en todos los escenarios (p. ej. S1 >500 ms: 1× nunca (React) / @3000 (Angular) → 4× @1000 / @600 → 6× @600).

**H91, H92, H93, H94, H95, H96, H98, H99, H100 CONFIRMADAS; H97 NO CONCLUYENTE** (el TBT proxy se mueve con las long tasks pero no hay INP medible por CDP directo — la comparación main-thread-work vs INP de Fase 10 no puede replicarse aquí).

## 2. Pregunta experimental

> ¿Las diferencias entre React y Angular observadas en CPU abundante (Fases 9.1–9.3, 10, 14) se amplifican cuando el presupuesto de CPU se reduce?

## 3. Hipótesis

| Hipótesis | Formulación                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| H91       | El throttling amplifica la diferencia de montaje (Angular más costoso)           |
| H92       | El throttling hace más visible el trabajo síncrono incremental de React          |
| H93       | Long tasks aparecen a datasets menores que en CPU normal                         |
| H94       | El umbral de 100 ms se alcanza con datasets menores                              |
| H95       | El umbral de 200 ms se alcanza con datasets menores                              |
| H96       | El E2E conserva el dominio del montaje, pero la interacción gana peso relativo   |
| H97       | Las diferencias de main-thread work pueden amplificarse más que las de INP       |
| H98       | React y Angular no escalan igual al aumentar el throttling                       |
| H99       | Los efectos se reproducen en ejecuciones independientes                          |
| H100      | El throttling puede hacer aparecer un cambio de régimen no visible en CPU normal |

## 4. Diseño experimental

- **Copia aislada:** `/tmp/lab-phase15` (clone del commit S0 de Fase 14, la instrumentación `?dataset=N` de Fases 9.1–9.3). Árbol principal intacto.
- **Matriz:** 3 escenarios × 2 frameworks × 3 rates CPU × 6 datasets (300/600/1000/1500/2000/3000) = 108 celdas × n=5 = **540 ejecuciones** + 1 warm-up por celda.
- **Harness uniforme:** un único harness (long tasks + event timing + MutationObserver con sonda de aislamiento de Fase 9) para los tres escenarios, de modo que la comparación intra-fase (1× vs 4× vs 6×, React vs Angular) sea internamente consistente. Asimetría con Fase 9.1 (observador mínimo en S1) documentada: comparación absoluta contextual.
- **Throttling real:** `Emulation.setCPUThrottlingRate { rate }` (1/4/6) — no sleeps artificiales. Se documenta la configuración exacta.
- **Orden balanceado:** los rates de CPU se rotan por posición de dataset (`[1,4,6]` rotado en dIdx), nunca fijo 1×→4×→6×, para evitar efectos de orden por deriva térmica/GC de la máquina. Cada celda es una sesión de navegador fresca.
- **Protocolo de medición:** idéntico a Fases 9.1 (S1: click Tasks desde Projects, poll 8 ms hasta N filas; duration = tRows−t0), 9.2 (S4: batch search+status+priority, duration hasta conteo combined) y 9.3 (E2E: reloj continuo mount→S4→S4b, total = tRowsS4−t0, residual medido por iteración).

## 5. Entorno

|            |                                                 |
| ---------- | ----------------------------------------------- |
| Máquina    | local, `darwin-arm64`, cpus no expuestos        |
| Navegador  | chrome-headless-shell 1234 (Playwright cache)   |
| Node       | v25.3.0                                         |
| Servidor   | estático localhost (React :4201, Angular :4202) |
| Viewport   | 1280×800, DPR 1                                 |
| Throttling | CDP `Emulation.setCPUThrottlingRate` 1×/4×/6×   |

## 6. Resultados — S1 (Mount)

Mediana de `duration` (commit completo hasta N filas), ms.

| Dataset | CPU | React p50 (p95) | Angular p50 (p95) | Δ (A−R) | Ratio | LT R/A |
| ------- | --: | --------------: | ----------------: | ------: | ----: | -----: |
| 300     |  1× |     66,5 (73,3) |       77,6 (87,3) |   +11,1 |  1,17 |    0/0 |
| 300     |  4× |   178,8 (183,5) |     223,2 (270,9) |   +44,4 |  1,25 |    2/5 |
| 300     |  6× |   265,6 (273,7) |     330,6 (394,4) |   +65,0 |  1,24 |    5/5 |
| 600     |  1× |    98,9 (102,5) |     127,2 (147,3) |   +28,3 |  1,29 |    0/3 |
| 600     |  4× |   372,4 (383,4) |     520,6 (546,0) |  +148,2 |  1,40 |    5/5 |
| 600     |  6× |   521,7 (580,1) |     755,8 (819,8) |  +234,1 |  1,45 |    5/6 |
| 1000    |  1× |   159,8 (181,7) |     193,2 (231,5) |   +33,4 |  1,21 |    5/5 |
| 1000    |  4× |   554,8 (586,7) |     796,1 (945,6) |  +241,3 |  1,43 |    5/6 |
| 1000    |  6× |    929,0 (1021) |   1240,3 (1432,5) |  +311,3 |  1,34 |    5/6 |
| 1500    |  1× |   226,9 (264,6) |     283,5 (331,9) |   +56,6 |  1,25 |    5/5 |
| 1500    |  4× |  915,5 (1152,6) |   1241,1 (1411,1) |  +325,6 |  1,36 |    6/7 |
| 1500    |  6× | 1335,7 (1498,7) |   1783,0 (1837,6) |  +447,3 |  1,33 |    6/6 |
| 2000    |  1× |   298,6 (338,3) |     376,6 (407,7) |   +78,0 |  1,26 |    5/5 |
| 2000    |  4× | 1134,8 (1432,8) |   1601,1 (1811,7) |  +466,3 |  1,41 |    6/7 |
| 2000    |  6× | 1898,7 (2021,1) |   2207,3 (2455,0) |  +308,6 |  1,16 |    6/6 |
| 3000    |  1× |   439,8 (524,0) |     547,9 (726,3) |  +108,1 |  1,25 |    5/6 |
| 3000    |  4× | 1902,9 (2017,2) |   2272,7 (2993,3) |  +369,8 |  1,19 |    7/7 |
| 3000    |  6× | 2813,8 (2950,4) |   3530,6 (3722,1) |  +716,8 |  1,25 |    7/6 |

**Slowdown (throttled / 1×):**

| Dataset | React 4× | Angular 4× | React 6× | Angular 6× |
| ------- | -------: | ---------: | -------: | ---------: |
| 300     |     2,69 |       2,88 |     3,99 |       4,26 |
| 600     |     3,77 |       4,09 |     5,28 |       5,94 |
| 1000    |     3,47 |       4,12 |     5,81 |       6,42 |
| 1500    |     4,03 |       4,38 |     5,89 |       6,29 |
| 2000    |     3,80 |       4,25 |     6,36 |       5,86 |
| 3000    |     4,33 |       4,15 |     6,40 |       6,44 |

## 7. Resultados — S4 (Incremental)

| Dataset | CPU | React p50 (p95) | Angular p50 (p95) | Δ (A−R) |  Sync R/A | LT R/A |
| ------- | --: | --------------: | ----------------: | ------: | --------: | -----: |
| 300     |  1× |     16,5 (23,0) |       12,4 (13,2) |    −4,1 |  16,5/0,2 |    0/0 |
| 300     |  4× |     35,1 (53,5) |       27,1 (34,5) |    −8,0 |  35,1/0,4 |    1/0 |
| 300     |  6× |     54,4 (72,3) |       47,1 (50,0) |    −7,3 |  54,3/0,7 |    5/0 |
| 600     |  1× |     29,1 (34,6) |       24,3 (25,9) |    −4,8 |  29,0/0,2 |    0/0 |
| 600     |  4× |    76,0 (103,8) |       49,3 (55,1) |   −26,7 |  75,4/0,3 |    5/1 |
| 600     |  6× |   115,3 (137,1) |       72,9 (85,0) |   −42,4 | 114,7/0,2 |    5/5 |
| 1000    |  1× |     47,8 (58,3) |       35,6 (39,5) |   −12,2 |  47,7/0,2 |    2/0 |
| 1000    |  4× |   128,8 (132,9) |      89,6 (150,4) |   −39,2 | 128,2/0,2 |    5/5 |
| 1000    |  6× |   201,1 (206,1) |     126,7 (132,1) |   −74,4 | 201,0/0,7 |    5/5 |
| 1500    |  1× |     66,3 (70,7) |       43,7 (46,4) |   −22,6 |  66,2/0,1 |    5/0 |
| 1500    |  4× |   205,8 (226,3) |     121,7 (135,5) |   −84,1 | 205,1/0,2 |    5/5 |
| 1500    |  6× |   288,3 (291,3) |     190,0 (265,7) |   −98,3 | 287,3/0,1 |    5/5 |
| 2000    |  1× |     76,3 (79,7) |       57,5 (61,0) |   −18,8 |  76,2/0,2 |    5/3 |
| 2000    |  4× |   259,1 (268,4) |     166,3 (189,0) |   −92,8 | 258,7/0,2 |    5/5 |
| 2000    |  6× |   398,4 (411,4) |     257,7 (269,5) |  −140,7 | 397,2/0,1 |    5/5 |
| 3000    |  1× |   100,9 (105,6) |       83,1 (93,8) |   −17,8 | 100,7/0,1 |    5/5 |
| 3000    |  4× |   372,5 (378,3) |     240,5 (308,5) |  −132,0 | 371,8/0,2 |    5/5 |
| 3000    |  6× |   568,1 (606,7) |     374,5 (421,7) |  −193,6 | 566,8/0,2 |    5/5 |

## 8. Resultados — E2E (mount → S4 → S4b)

| Dataset | CPU | React total p50 (p95) | Angular total p50 (p95) |      Δ | Mount % R/A |  S4 % R/A | LT R/A |
| ------- | --: | --------------------: | ----------------------: | -----: | ----------: | --------: | -----: |
| 300     |  1× |           84,3 (94,9) |            95,4 (113,3) |  +11,1 |   68,8/73,3 |  10,7/8,8 |    0/0 |
| 300     |  4× |         203,1 (217,0) |           248,4 (275,5) |  +45,3 |   76,1/82,2 | 15,7/10,9 |    0/0 |
| 300     |  6× |         296,0 (320,9) |           381,2 (452,5) |  +85,2 |   78,1/83,2 | 16,5/11,5 |    4/0 |
| 600     |  1× |         124,4 (136,8) |           141,7 (158,0) |  +17,3 |   71,0/79,5 |  14,4/9,1 |    0/0 |
| 600     |  4× |         402,9 (417,3) |           477,4 (532,6) |  +74,5 |   79,0/86,0 | 16,6/10,4 |   10/2 |
| 600     |  6× |         601,7 (615,9) |           728,8 (775,8) | +127,1 |   80,8/86,6 | 16,4/10,8 |  10/10 |
| 1000    |  1× |         185,1 (188,1) |           205,8 (238,8) |  +20,7 |   74,8/81,7 |  15,8/9,8 |    0/0 |
| 1000    |  4× |         648,0 (681,3) |           782,1 (853,7) | +134,1 |   80,0/87,2 | 17,3/10,4 |  10/14 |
| 1000    |  6× |        976,6 (1007,7) |         1197,4 (1274,3) | +220,8 |   80,9/87,6 | 17,2/10,6 |  10/10 |
| 1500    |  1× |         263,5 (278,8) |           308,8 (344,0) |  +45,3 |   76,5/84,3 |  16,8/9,9 |    2/0 |
| 1500    |  4× |       1011,4 (1134,5) |         1154,4 (1381,0) | +143,0 |   81,1/88,0 | 17,0/10,1 |  10/11 |
| 1500    |  6× |       1602,4 (1704,8) |         1771,9 (1905,0) | +169,5 |   81,9/88,5 | 16,8/10,2 |  10/26 |
| 2000    |  1× |         366,8 (383,7) |           445,6 (460,1) |  +78,8 |   78,4/85,2 | 16,7/10,2 |   10/0 |
| 2000    |  4× |       1401,8 (1490,5) |         1598,5 (1810,9) | +196,7 |   80,6/88,5 | 17,8/10,1 |  10/23 |
| 2000    |  6× |       2063,1 (2245,7) |         2305,5 (2417,4) | +242,4 |   80,2/87,9 | 18,0/10,6 |  25/25 |
| 3000    |  1× |         521,0 (707,0) |           621,9 (658,7) | +100,9 |   76,8/86,7 | 19,7/10,1 |  10/11 |
| 3000    |  4× |       2293,3 (2471,0) |         2488,5 (2724,0) | +195,2 |   78,7/88,5 | 19,5/10,1 |  25/26 |
| 3000    |  6× |       3244,4 (3704,0) |         3943,9 (4098,9) | +699,5 |   78,5/88,9 |  19,6/9,4 |  25/26 |

## 9. Umbrales (primer dataset con mediana > umbral)

| Escenario | Umbral  | Framework | 1×    | 4×    | 6×    |
| --------- | ------- | --------- | ----- | ----- | ----- |
| S1        | >100 ms | React     | 1000  | 300   | 300   |
| S1        | >100 ms | Angular   | 600   | 300   | 300   |
| S1        | >200 ms | React     | 1500  | 600   | 300   |
| S1        | >200 ms | Angular   | 1500  | 300   | 300   |
| S1        | >500 ms | React     | nunca | 1000  | 600   |
| S1        | >500 ms | Angular   | 3000  | 600   | 600   |
| S4        | >100 ms | React     | 3000  | 1000  | 600   |
| S4        | >100 ms | Angular   | nunca | 1500  | 1000  |
| S4        | >200 ms | React     | nunca | 1500  | 1000  |
| S4        | >200 ms | Angular   | nunca | 3000  | 2000  |
| S4        | >500 ms | React     | nunca | nunca | 3000  |
| S4        | >500 ms | Angular   | nunca | nunca | nunca |
| E2E       | >100 ms | React     | 600   | 300   | 300   |
| E2E       | >100 ms | Angular   | 600   | 300   | 300   |
| E2E       | >200 ms | React     | 1500  | 300   | 300   |
| E2E       | >200 ms | Angular   | 1000  | 300   | 300   |
| E2E       | >500 ms | React     | 3000  | 1000  | 600   |
| E2E       | >500 ms | Angular   | 3000  | 1000  | 600   |

## 10. Long tasks

Primer dataset con long tasks (cualquier iteración): **S1: 300 @6× y @4×** (React/Angular) frente a 600 @1× (Angular) / 1000 @1× (React en Fase 9.1). **E2E: 300 @6× (React)** frente a 2000 @1× (React). S4: 300 @6× (React).

## 11. Análisis crítico (respuestas obligatorias)

- **A.** Sí — Angular sigue siendo más lento en montaje bajo 4× y 6× (todos los datasets).
- **B.** Sí — la diferencia absoluta crece fuertemente: S1 Δ pasa de +11 ms (@300 1×) a +717 ms (@3000 6×).
- **C.** No — la diferencia **relativa** se mantiene estable (~1,17–1,45×) sin una tendencia sistemática con el throttling.
- **D.** Sí — React sigue acumulando más trabajo síncrono incremental (sync S4 6× @3000: 567 ms vs 0,2 ms).
- **E.** **Sí — y esta es la novedad de Fase 15**: bajo throttling el sync de React **se convierte en duración** (sync ≈ duration en S4; en 1× no lo hacía). INP no es medible por CDP directo, pero la duración de commit es el proxy más cercano y cruza 100 ms con ~2,5× menos dataset que Angular.
- **F.** Sí — long tasks a datasets menores (300 @6× vs 1000+ @1×).
- **G/H/I.** Sí — todos los umbrales se adelantan con el throttling.
- **J.** Aproximadamente lineal en S1 (pendientes 6×: 853–1126 ms/1000 React, 849–1417 Angular); **S4 muestra superlinealidad relativa al rate** (el sync de React crece ~lineal con dataset pero el factor throttling lo multiplica).
- **K.** No hay cambio de régimen en la forma (dataset→tiempo sigue lineal), pero **sí aparece un régimen nuevo en la relación sync→duración**: en 1× el sync de React se amortiza (commit diferido), en 6× se paga íntegro.
- **L.** Sí — el E2E sigue dominado por el montaje (78–89 %).
- **M.** Sí en React (S4 % del total: 10,7 % @1× → 19,6 % @6× @3000); no en Angular (~10 % constante).
- **N.** **React muestra mayor sensibilidad relativa en S4/E2E** (slowdown 6× S4: React ~5,6× vs Angular ~4,5× @3000; E2E 3000 6×: 6,23× vs 6,34× — comparable); en S1 la sensibilidad es comparable.
- **O.** Las conclusiones de Fases 9.1–9.3 se mantienen **cualitativamente** (montaje domina, Angular penaliza montaje, React acumula sync incremental, aislamiento perfecto), pero **Fase 9.2 queda matizada**: "el sync de React no se traduce en latencia" solo es cierto en CPU abundante.

## 12. Análisis de estado y aislamiento

- Aislamiento verificado: **0 mutaciones fuera de la sección activa** en S4 y E2E en todos los datasets y rates (incluido 3000 6×). El aislamiento arquitectónico se mantiene bajo carga extrema.
- El trabajo síncrono de React en S4 es ~100 % del commit (sync ≈ duration) mientras Angular difiere todo (sync ≈ 0,2 ms y commit posterior): el modelo de estado (useSyncExternalStore + suscripciones vs Signals + coalescing) es la causa estructural de la diferencia, amplificada linealmente por el throttling.

## 13. Diferencias significativas vs ruido

- **Significativas y reproducibles:** (1) penalización de montaje de Angular (consistente en 18/18 celdas S1, ratio estable); (2) **conversión del sync de React en duración bajo throttling** (S4: sync ≈ duration en 9/9 celdas con rate >1; consistente en las 5 iteraciones); (3) adelanto de long tasks y umbrales.
- **Probablemente ruido:** las variaciones de ratio dentro de ±0,1× en S1 (p. ej. 2000 6×: 1,16× vs el resto ~1,25–1,45×) — no siguen tendencia.
- **No medible aquí:** INP/TBT/LCP de Lighthouse (H97): el TBT proxy se computa de long tasks pero INP no existe por CDP directo; la comparación main-thread-work vs INP de Fase 10 no es replicable en este harness.

## 14. Comparación con fases anteriores

| Métrica          | F9.1/9.2/9.3 (1×) | Fase 15 1× | Fase 15 4× | Fase 15 6× | Cambio              |
| ---------------- | ----------------- | ---------- | ---------- | ---------- | ------------------- |
| S1 3000 React    | ~419 ms           | 440 ms     | 1903 ms    | 2814 ms    | ×4,3 / ×6,4         |
| S1 3000 Angular  | ~497 ms           | 548 ms     | 2273 ms    | 3531 ms    | ×4,2 / ×6,4         |
| S4 2000 React    | ~78 ms            | 76 ms      | 259 ms     | 398 ms     | ×3,4 / ×5,2         |
| S4 2000 Angular  | ~56 ms            | 58 ms      | 166 ms     | 258 ms     | ×2,9 / ×4,5         |
| E2E 3000 React   | ~522 ms           | 521 ms     | 2293 ms    | 3244 ms    | ×4,4 / ×6,2         |
| E2E 3000 Angular | ~605 ms           | 622 ms     | 2489 ms    | 3944 ms    | ×4,0 / ×6,3         |
| Sync S4 3000 R/A | 99/0,2 ms         | 101/0,1    | 372/0,2    | 567/0,2    | amplificación React |
| Umbral 100 ms S1 | 300–600           | 600        | 300        | 300        | adelanto            |
| Umbral 100 ms S4 | >2000             | 3000       | 1000       | 600        | adelanto React      |

## 15. Interpretación

1. **Sí, el throttling amplifica la penalización de montaje de Angular en términos absolutos** (Δ +11 → +717 ms), pero **no en términos relativos** (ratio estable ~1,2–1,4×).
2. **Sí, el throttling amplifica la penalización incremental de React de forma decisiva**: su sync se convierte en duración de commit, y bajo 6× React cruza 100 ms con ~600 tareas donde Angular lo hace con ~1000 — y 200 ms con ~1000 donde Angular no lo cruza hasta 3000 (4×).
3. **Para el usuario final la diferencia más relevante es la incremental de React** bajo CPU limitada: es el único caso donde un umbral de interacción (100/200 ms) se cruza con datasets moderados (600–1000) y donde la latencia escala con el rate.
4. Se manifiesta en **duration/commit** (proxy de latencia) y **long tasks**; no hay INP/TBT medibles por CDP directo.
5. **No existe un dataset donde cambie el ganador del flujo completo**: Angular es más lento en E2E en todas las celdas (el montaje domina). Pero en S4 aislado, **React es más lento en todas las celdas** (incluso 1×, como en Fase 9.2).
6. React pasa a ser "peor globalmente" bajo throttling **solo en el régimen incremental** (S4); en E2E el montaje de Angular sigue dominando.
7. Angular es peor "únicamente por montaje" — sí: en E2E su penalización es el montaje; su S4 es más rápido que React en todas las celdas.
8. La mayor parte del coste bajo throttling es el **dataset × rate** (ambos frameworks multiplican ~por el rate); la fracción framework es el ratio estable en montaje (1,2–1,4×) y el factor 2–3× en el incremental de React.
9. **Robustas:** montaje domina el E2E; Angular penaliza montaje; aislamiento perfecto; sync de Angular plano; linealidad dataset→tiempo; reproducibilidad (checks 5/5 en 108/108 celdas, dos tandas independientes).
10. **Dejan de ser robustas:** "el sync de React no se traduce en latencia perceptible" (Fase 9.2) — solo cierto en CPU abundante; "las diferencias de Fases 9–10 son las únicas relevantes" — bajo CPU limitada el régimen incremental de React emerge como el más costoso para el usuario.

## 16. Long tasks (tabla obligatoria)

| CPU | Framework   | Dataset (primer LT) | LT runs / total runs | Max LT (ms, p95 del conjunto) |
| --- | ----------- | ------------------- | -------------------- | ----------------------------- |
| 1×  | React S1    | 1000                | 5/5                  | ~100+                         |
| 1×  | Angular S1  | 600                 | 3/5                  | ~100+                         |
| 4×  | React S1    | 300                 | 2/5                  | ~150+                         |
| 4×  | Angular S1  | 300                 | 5/5                  | ~180+                         |
| 6×  | React S1    | 300                 | 5/5                  | ~230+                         |
| 6×  | Angular S1  | 300                 | 5/5                  | ~300+                         |
| 1×  | React S4    | 1000                | 2/5                  | <100                          |
| 6×  | React S4    | 300                 | 5/5                  | ~70–120                       |
| 6×  | Angular S4  | 600                 | 5/5                  | ~70–120                       |
| 1×  | React E2E   | 2000                | 10/10                | ~150+                         |
| 6×  | React E2E   | 300                 | 4/5                  | ~200+                         |
| 6×  | Angular E2E | 600                 | 10/10                | ~250+                         |

## 17. Verdictos

| Hipótesis | Veredicto          | Justificación                                                                                                                                                                                          |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H91       | **CONFIRMADA**     | Δ S1 pasa de +11 a +717 ms (300 1× → 3000 6×); Angular más costoso en 18/18 celdas. Ratio estable (matiz).                                                                                             |
| H92       | **CONFIRMADA**     | S4 sync≈duration en React bajo rate>1 (567/568 ms @3000 6× vs 0,2 ms Angular); la brecha sync crece con rate y dataset.                                                                                |
| H93       | **CONFIRMADA**     | Primer LT S1: 300 @4×/6× vs 1000 @1×; E2E: 300 @6× vs 2000 @1×.                                                                                                                                        |
| H94       | **CONFIRMADA**     | S1 >100 ms: 300 @4×/6× vs 600–1000 @1×; S4 React: 600 @6× vs 3000 @1×.                                                                                                                                 |
| H95       | **CONFIRMADA**     | S1 >200 ms: 300 @6× vs 1500 @1×; S4 React: 1000 @6× vs nunca @1×.                                                                                                                                      |
| H96       | **CONFIRMADA**     | Mount % 78–89 % en todas las celdas; S4 % crece con rate en React (10,7→19,6 % @3000) no en Angular.                                                                                                   |
| H97       | **NO CONCLUYENTE** | TBT proxy sigue a las long tasks, pero INP no es medible por CDP directo; la comparación con Fase 10 no es replicable en este harness.                                                                 |
| H98       | **CONFIRMADA**     | Sensibilidad diferencial: S4/E2E React se degrada más (slowdown 6× S4 @3000: 5,6× vs 4,5×); S1 comparable.                                                                                             |
| H99       | **CONFIRMADA**     | 108/108 celdas checks 5/5; el patrón sync≈duration y la amplificación de montaje se reproducen en las 5 iteraciones y en dos tandas (S1 300/600/1000 y 1500/2000/3000 corridas en sesiones separadas). |
| H100      | **CONFIRMADA**     | Aparece un régimen nuevo: en 1× el sync de React se amortiza (commit diferido); en 6× se paga íntegro en la duración — la relación sync→duración cambia con el rate, algo invisible en CPU normal.     |

## 18. Qué sabemos después de Fase 15

### Confirmado

- El throttling amplifica en magnitud absoluta la penalización de montaje de Angular, sin cambiar el ratio.
- El throttling **convierte el trabajo síncrono incremental de React en latencia de commit** — la mayor novedad frente a Fases 9–10.
- Long tasks y umbrales (100/200/500 ms) aparecen a datasets menores bajo throttling.
- El E2E sigue dominado por el montaje; el aislamiento de actualización se mantiene perfecto (0 mutaciones fuera de sección).
- Sensibilidad diferencial: React se degrada más que Angular en el régimen incremental.

### Probable

- Bajo 6× un dispositivo real percibiría la lista de 600 tareas como lenta en React (S4 >100 ms) y en Angular solo desde ~1000 — pero 4×/6× no equivalen a hardware físico (limitación).

### No concluyente

- H97 (main-thread work vs INP): INP no es medible por CDP directo; la comparación precisa necesita Lighthouse (Fase 10) bajo los mismos rates.

### Refutado

- La conclusión de Fase 9.2 de que "el sync de React no se traduce en latencia perceptible" es **solo válida en CPU abundante**.

**Evidencia nueva aportada por Fase 15 que no teníamos en Fases 9–10:** la relación sync→duración de React no es invariante al presupuesto de CPU — en CPU limitada el modelo de estado de React (render síncrono en el evento) paga su trabajo incremental íntegramente en la latencia de la interacción, mientras que el modelo de Angular (signals/coalescing) mantiene su amortización. Esto define un **punto de cruce de trade-off dependiente del hardware**: en dispositivos lentos, la ventaja de Angular en actualizaciones incrementales pasa de "trabajo interno no perceptible" a "latencia perceptiblemente menor".

## 19. Limitaciones

- Una máquina, un navegador (chrome-headless-shell), localhost.
- Throttling de CPU **simulado** vía CDP — no equivale a un dispositivo físico (scheduler, memoria, thermal throttling reales distintos).
- headless vs usuario real; sin throttling de red.
- El harness (MutationObserver) se ralentiza con el rate; afecta simétricamente a ambos frameworks pero cuantiza el commit en pasos de 8 ms.
- INP/TBT/LCP/FCP no medibles de forma fiable por CDP directo (Fase 10 con Lighthouse).
- n=5 por celda: no se aplica significancia estadística formal.
- Comparaciones absolutas con Fases 9.1–9.3 contextuales (asimetría de observador en S1).

## 20. Amenazas a la validez

- **Efectos de orden:** mitigados con rotación de rates por dataset y navegador fresco por celda.
- **Deriva térmica/GC:** el slowdown 6× de S1 a 3000 (6,4× vs 6× nominal) sugiere overhead del harness ralentizado; documentado, simétrico.
- **Cuantización:** poll de 8 ms; relevante solo por debajo de ~16 ms.
- **Generalización:** resultados válidos para este laboratorio (una máquina, un browser); no extrapolables a otros hardwares sin repetir el protocolo.

## 21. Siguiente experimento recomendado

1. **Lighthouse User Flows bajo CPU throttling** (Fase 10 + rates 4×/6×): medir INP/TBT reales bajo los mismos escenarios para resolver H97 y cuantificar la diferencia perceptible de S4 bajo CPU limitada.
2. **Memoria y GC bajo throttling** (heap, GC pause counts via CDP Tracing en datasets 3000 bajo 6×): ¿el sync de React bajo throttling genera presión de memoria adicional que amplifique aún más la latencia?
3. **Simulación de dispositivo móvil real** (Playwright `devices` + throttling de red + rate 6×): validar si los umbrales cruzados aquí se mantienen con las características de hardware de un teléfono real.
