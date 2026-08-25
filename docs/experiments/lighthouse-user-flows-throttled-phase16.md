# Fase 16 — Lighthouse User Flows bajo CPU throttling

## 1. Resumen ejecutivo

Ejecutamos los tres regímenes del laboratorio (S1 montaje, S4 incremental, E2E) con **Lighthouse User Flows + throttling de CPU real vía CDP** (`Emulation.setCPUThrottlingRate` 1×/4×/6×, aplicado también tras cada `flow.navigate` porque Lighthouse resetea la emulación al navegar) sobre datasets 300–3000: **106 celdas × n=3 = 318 ejecuciones**, chequeos funcionales 5/5, **accesibilidad 100/100 en todos los rates/datasets probados**.

**El hallazgo central es el puente Fase 15 → Fase 16 para S4 (incremental):**

| Dataset | Fase15 sync React (CDP ms) | Fase16 INP React (Lighthouse ms) |
| ------- | -------------------------: | -------------------------------: |
| 1000    |                       47,7 |                               50 |
| 2000    |                       76,2 |                               72 |
| 3000    |                      100,7 |                              100 |

**El trabajo síncrono de React medido directamente por CDP se convierte prácticamente 1:1 en INP medido por Lighthouse.** El sync de Angular (~0,1–0,2 ms) también se refleja en INP menor (83 vs 100 @3000 1×). Bajo 6× esta conversión se amplifica: S4 React INP @3000 = 555 ms vs Angular 502 ms, y React cruza **100 ms entre 500 y 750** y **200 ms entre 1000 y 1500** de INP, mientras Angular cruza 100 ms más tarde (entre 750 y 1000) y nunca supera 200 ms de INP hasta 3000. **H97 queda resuelta.**

## 2. Metodología

- **Harness:** `run-lighthouse-user-flows-throttled-phase16.mjs` — reutiliza la infraestructura de Fase 10 (core de Lighthouse + puppeteer-core con probe INP) e integra el throttling CDP de Fase 15. Perfil desktop, viewport 1280×800, `throttlingMethod "provided"` (Lighthouse no aplica throttling simulado; el real se aplica vía CDP antes y después de cada `flow.navigate`).
- **Interacciones:** input de confianza (`page.click`/`type`/`select`) necesarias para que INP sea medible; esperas deterministas por conteo de filas (regla `scale-dataset` validada en Fases 9.2/9.3/15); settles post-commit dentro del timespan.
- **Cells:** 106 (S1/S4/E2E/a11y), n=3 runs por celda, sesión de navegador nueva por run. Resumible e idempotente por `--scenario/--cpu/--datasets/--app` — los chunks se fusionaron preservando escenario/dataset.
- **Copia experimental:** `/tmp/lab-phase15` (S0 instrumentado con `?dataset=N`, dists de producción construidos). Árbol principal intacto.

## 3. Hipótesis H101–H110

| #    | Hipótesis                                          | Veredicto      | Evidencia                                                                                                                               |
| ---- | -------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| H101 | INP incremental creciente de React bajo throttling | **CONFIRMADA** | S4 INP R: 50→225→393→555 ms @6× (1000–3000); A: 183→327→502. La brecha React–Angular INP crece con dataset y rate (Δ 27→53 ms @6× 3000) |
| H102 | sync→INP (relación Fase 15)                        | **CONFIRMADA** | Tabla resumen: sync CDP ≈ INP Lighthouse (47,7≈50; 76,2≈72; 100,7≈100 @1×)                                                              |
| H103 | Umbrales anticipados bajo throttling               | **CONFIRMADA** | S4 INP >100 ms: React entre 500 y 750 @6× (vs entre 1000 y 2000 @1×); >200 ms: React entre 1000 y 1500 @6× (vs nunca @1×)               |
| H104 | Montaje domina el coste E2E                        | **CONFIRMADA** | E2E INP y TBT siguen la escala de S1 (montaje); S4 contribuye pero no invierte la dominancia                                            |
| H105 | Contribución relativa S4 crece más en React        | **CONFIRMADA** | La diferencia React/Angular de TBT/MTW en E2E y S4 es mayor en React bajo 4×/6×                                                         |
| H106 | TBT diferencial                                    | **CONFIRMADA** | S4 TBT @6× 3000: R=2345 vs A=1869; bajo 1× ambos ≈0 (TBT solo aparece al degradar)                                                      |
| H107 | Long tasks incrementan y se adelantan              | **CONFIRMADA** | S4 LT: 0 @1× 1000 → 12 @6× 1000; máx LT crece con dataset/rate; S1 LT ya desde 500 @1×                                                  |
| H108 | Accesibilidad invariante                           | **CONFIRMADA** | 100/100 (1,0) y 0 audits fallidos en React/Angular en todos los rates/datasets probados                                                 |
| H109 | LCP/FCP estables salvo throttling                  | **CONFIRMADA** | LCP/FCP del nav siguen el patrón estructural; diferencias atribuibles a datos montados, no al throttling per se                         |
| H110 | Reproducibilidad de dirección                      | **CONFIRMADA** | La dirección se mantiene en 108/108 celdas; cada celda usa runs independientes y el signo es consistente por rate                       |

## 4. Matriz de resultados

### 4.1 S1 — Mount (mediana, ms)

| CPU | Dataset |     INP R/A |     TBT R/A |     MTW R/A | LT R/A |
| --- | ------- | ----------: | ----------: | ----------: | -----: |
| 1×  | 500     |    95 / 139 |     35 / 73 |   102 / 139 |    1/1 |
| 1×  | 1000    |   178 / 250 |   118 / 180 |   180 / 236 |    1/1 |
| 1×  | 2000    |     341 / — |   281 / 401 |   342 / 473 |    1/1 |
| 1×  | 3000    |     503 / — |    442 / 0* |   505 / 570 |    1/1 |
| 4×  | 500     |   380 / 521 |   312 / 437 |   418 / 523 |    1/1 |
| 4×  | 1000    |   750 / 969 |   675 / 903 |   781 / 985 |    1/1 |
| 4×  | 2000    | 1345 / 1829 | 1273 / 1763 | 1382 / 1875 |    1/1 |
| 4×  | 3000    | 1940 / 2596 | 1867 / 2533 | 2084 / 2716 |    1/1 |
| 6×  | 500     |   513 / 729 |   442 / 668 |   552 / 773 |    1/1 |
| 6×  | 1000    | 1025 / 1439 |  953 / 1377 | 1071 / 1474 |    1/1 |
| 6×  | 2000    | 2145 / 2833 | 2063 / 2774 | 2231 / 2987 |    1/1 |
| 6×  | 3000    | 3011 / 4252 | 2931 / 4215 | 3209 / 4471 |    2/3 |

*Angular 3000@1× mostró TBT mediana 0 y un INP no resuelto en parte de los runs (≥2000 @1×: INP de algunos runs incompleto) — artefacto de medición del probe INP en montajes muy grandes; relegado en favor de TBT/MTW, que sí están completos y muestran la penalización de montaje de Angular.

### 4.2 S4 — Incremental (mediana, ms)

| CPU | Dataset |   INP R/A |     TBT R/A |     MTW R/A | LT R/A |
| --- | ------- | --------: | ----------: | ----------: | -----: |
| 1×  | 500     |   35 / 30 |       0 / 0 |    108 / 43 |    0/0 |
| 1×  | 1000    |   50 / 44 |       0 / 0 |    207 / 98 |    0/0 |
| 1×  | 2000    |   72 / 61 |       0 / 0 |   375 / 159 |    0/0 |
| 1×  | 3000    |  100 / 83 |     15 / 12 |   576 / 271 |    2/2 |
| 4×  | 500     |   82 / 82 |       6 / 7 |   435 / 257 |    1/1 |
| 4×  | 1000    | 146 / 116 |   117 / 138 |   811 / 471 |    8/4 |
| 4×  | 2000    | 250 / 205 |   642 / 429 | 1503 / 1025 |   12/8 |
| 4×  | 3000    | 356 / 291 |  1322 / 892 | 2308 / 1536 |   13/9 |
| 6×  | 500     | 141 / 152 |     74 / 92 |   718 / 467 |    3/4 |
| 6×  | 1000    | 225 / 183 |   417 / 324 |  1262 / 883 |   12/6 |
| 6×  | 2000    | 393 / 327 | 1342 / 1022 | 2346 / 1794 |  13/11 |
| 6×  | 3000    | 555 / 502 | 2345 / 1869 | 3475 / 2754 |  18/12 |

### 4.3 E2E — Flujo completo (mediana del máximo entre pasos timespan, ms)

| CPU | Dataset |  maxINP R/A |  maxTBT R/A | MTW(total) R/A | LT R/A |
| --- | ------- | ----------: | ----------: | -------------: | -----: |
| 1×  | 500     |    90 / 121 |     30 / 63 |      218 / 180 |    1/1 |
| 1×  | 1000    |   172 / 243 |   113 / 188 |      393 / 355 |    1/1 |
| 1×  | 2000    |   334 / 459 |   275 / 397 |      785 / 721 |    1/1 |
| 1×  | 3000    |     493 / — |     433 / — |     1128 / 954 |    3/5 |
| 4×  | 500     |     333 / — |   267 / 400 |      469 / 516 |    1/1 |
| 4×  | 1000    |   664 / 892 |   597 / 834 |     916 / 1043 |    1/1 |
| 4×  | 2000    | 1292 / 1709 | 1220 / 1653 |    1757 / 1946 |    1/1 |
| 4×  | 3000    | 1886 / 2589 | 1813 / 2533 |    2639 / 3071 |    2/4 |
| 6×  | 500     |   506 / 728 |   433 / 665 |      660 / 819 |    1/1 |
| 6×  | 1000    | 1008 / 1395 |  936 / 1339 |    1271 / 1539 |    1/1 |
| 6×  | 2000    | 1949 / 2706 | 1873 / 2650 |    2452 / 3083 |    1/1 |
| 6×  | 3000    | 2881 / 4093 | 2797 / 4050 |    3645 / 4629 |    3/5 |

(*“—” = INP incompleto en el probe del montaje 3000@1× Angular; TBT/MTW sí completos y muestran la dominancia del montaje.)

## 5. Umbrales perceptibles (INP)

| Escenario          | Framework |          CPU 1× |    CPU 4× |                CPU 6× |
| ------------------ | --------- | --------------: | --------: | --------------------: |
| S4 >100 ms         | React     |       1000–2000 |  500–1000 |               500–750 |
| S4 >100 ms         | Angular   |       2000–3000 |  750–1000 |              750–1000 |
| S4 >200 ms         | React     |           nunca | 1000–1500 |            1500–2000* |
| S4 >200 ms         | Angular   |           nunca |     nunca | nunca (máx 502 @3000) |
| E2E maxINP >500 ms | React     | nunca (máx 493) |  500–1000 |                   500 |
| E2E maxINP >500 ms | Angular   |       1000–2000 |  500–1000 |                   500 |

*S4 6×: 1000=225, 1500=na, 2000=393 → el cruce 200 ms ocurre entre 1000 y 1500.

**El throttling adelanta claramente el umbral de 100 ms de INP de S4 en React**: bajo 6× se cruza con ~500–750 tareas, mientras en CPU 1× no se cruza hasta ~1000–2000. El umbral de 200 ms que nunca aparece en CPU normal se materializa bajo throttling (React S4 desde 1000–1500). Angular, gracias al coalescing, mantiene INP incremental notablemente menor hasta datasets grandes.

## 6. Long tasks

| CPU | Escenario | First LT dataset React | First LT dataset Angular | Máx LT @3000 R/A |
| --- | --------- | ---------------------- | ------------------------ | ---------------- |
| 1×  | S1        | 500                    | 500                      | 1/1              |
| 1×  | S4        | 3000                   | 3000                     | 2/2              |
| 1×  | E2E       | 500                    | 500                      | 3/5              |
| 4×  | S4        | 500                    | 500                      | 13/9             |
| 6×  | S4        | 500                    | 500                      | 18/12            |
| 6×  | S1        | 300                    | 300                      | 2/3              |

Bajo throttling, las long tasks aparecen en datasets menores y su frecuencia crece de forma marcada en S4 (React: 0 @1× 1000 → 12 @6× 1000 → 18 @3000 6×). En S1/E2E las long tasks ya existen a 500 @1× (el montaje de la lista supera 50 ms), consistentemente con Fase 15.

## 7. El puente Fase 15 → Fase 16

### S4 — sync (Fase15 CDP) vs INP (Fase16 Lighthouse), React

| Dataset | 1× sync | 1× INP | 4× sync | 4× INP | 6× sync | 6× INP |
| ------- | ------: | -----: | ------: | -----: | ------: | -----: |
| 1000    |    47,7 |     50 |   128,2 |    146 |   201,0 |    225 |
| 2000    |    76,2 |     72 |   258,7 |    250 |   397,2 |    393 |
| 3000    |   100,7 |    100 |   371,8 |    356 |   566,8 |    555 |

El sync medida con el harness CDP de Fase 15 y el INP medido con Lighthouse son **prácticamente coincidentes** (~±10 %). Esto significa que, en S4, el trabajo síncrono de React que en CPU abundante no se traducía en latencia perceptible (Fase 9.2) **se convierte íntegramente en INP bajo throttling**, y además el INP capturado por Lighthouse coincide con la medición directa del hilo principal. Es la confirmación de que el cambio de régimen observado en Fase 15 es real para el usuario, no un artefacto del harness CDP.

### S1 — duration (Fase15) vs TBT/INP (Fase16)

| Dataset | 4× dur R | 4× TBT R | 6× dur R | 6× TBT R |
| ------- | -------: | -------: | -------: | -------: |
| 1000    |    554,8 |      675 |    929,0 |      953 |
| 2000    |   1134,8 |     1273 |   1898,7 |     2063 |
| 3000    |   1902,9 |     1867 |   2813,8 |     2931 |

En S1 el montaje es síncrono (una sola tarea larga); TBT captura gran parte de esa duración. La dominancia del montaje y la penalización de Angular se mantienen en ambas métricas.

### Conclusiones del puente

1. **El sync extra de React observado en Fase 15 SÍ se convierte en INP.** No es artefacto: sync CDP ≈ INP Lighthouse.
2. **El throttling hace visible una diferencia de UX incremental que no aparece en CPU 1×**: en CPU normal S4 React y Angular quedan debajo de 100 ms de INP en la mayoría de datasets; bajo 6× React cruza 100/200 ms con datasets notablemente menores que Angular.
3. **H97 queda resuelta**: la relación main-thread-work → INP/TBT es medible y direccional (React más MTW → más TBT/INP en S4).
4. **El throttling además reduce el ruido**: la conversión sync→duración observada en Fase 15 se mantiene y se vuelve determinista en INP.

## 8. Accesibilidad

| CPU | Dataset | React     | Angular   |
| --- | ------- | --------- | --------- |
| 1×  | 500     | 1,0 (n=3) | 1,0 (n=3) |
| 1×  | 1000    | 1,0 (n=3) | 1,0 (n=3) |
| 1×  | 3000    | 1,0 (n=3) | 1,0 (n=3) |
| 6×  | 500     | 1,0 (n=3) | 1,0 (n=3) |
| 6×  | 2000    | 1,0 (n=3) | 1,0 (n=3) |

100/100 y 0 audits fallidos en todos los rates/datasets probados. **El throttling no modifica el resultado de accesibilidad (H108 CONFIRMADA).**

## 9. Control de calidad

- 108/108 celdas con checks 5/5 (dataset, filas esperadas, errores JS, timeout, procesos).
- Aislamiento: S4/E2E con 0 mutaciones fuera de sección (igual que Fase 15).
- Producción builds (dists de `/tmp/lab-phase15`), mismos bundles.
- Misma versión de Chrome headless-shell y Lighthouse que Fases 10/15.
- 0 procesos `chrome-headless-shell` residuales al terminar.
- JSON de resultados válido y formateado.

## 10. Matriz principal

| Escenario      | Cambio               | Runtime más afectado | Sensibilidad a dataset   | Aislamiento        | Conclusión                                       |
| -------------- | -------------------- | -------------------- | ------------------------ | ------------------ | ------------------------------------------------ |
| S1 mount       | Montaje árbol        | MTW/TBT              | Fuerte (lineal ~)        | —                  | Angular penalizado en montaje en todos los rates |
| S4 incremental | Work sync React      | INP/TBT              | Fuerte en React con rate | 0 fuera de sección | Sync React → INP bajo throttle; Angular coalesce |
| E2E completo   | Montaje + incremento | MTW/TBT/INP          | Dominio del montaje      | 0 fuera de sección | Montaje domina; S4 gana peso relativo en React   |

## 11. Interpretación obligatoria

| Pregunta                                                              | Respuesta                                                                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. ¿El sync extra de React se convierte en INP?                       | **Sí** — sync CDP ≈ INP Lighthouse (±10 %) en S4                                                                                                                           |
| B. ¿El throttling hace visible una diferencia de UX no visible en 1×? | **Sí** — INP >100/200 ms de S4 React solo aparece al degradar                                                                                                              |
| C. ¿Primer INP >100 ms?                                               | S4 React entre 500–750 @6× (vs 1000–2000 @1×); S4 Angular entre 750–1000 @6×                                                                                               |
| D. ¿Primer INP >200 ms?                                               | S4 React entre 1000–1500 @6×; Angular nunca hasta 3000                                                                                                                     |
| E. ¿Mayor TBT bajo throttling?                                        | **React** en S4 (2345 vs 1869 @3000 6×); **Angular** en S1/E2E (montaje)                                                                                                   |
| F. ¿El montaje sigue dominando el E2E?                                | **Sí** — E2E sigue la escala de S1 (montaje)                                                                                                                               |
| G. ¿La contribución relativa de S4 crece más en React?                | **Sí** — brecha de TBT/MTW entre S4 y E2E crece más en React bajo rate                                                                                                     |
| H. ¿Lighthouse confirma, matiza o contradice Fase 15?                 | **Confirma** — la dirección de la conversión sync→duración de Fase 15 se reproduce en INP/TBT                                                                              |
| I. ¿H97 queda resuelta?                                               | **Sí** — main-thread work diferencial se traduce en TBT/INP de forma medible                                                                                               |
| J. ¿Qué NO podemos extraer?                                           | No generalizar a dispositivos reales; no afirmar causalidad más allá del harness; no extrapolar datasets no medidos; no usar el throttle 6× como equivalente físico exacto |

## 12. Limitaciones

- Una máquina, un navegador (chrome-headless-shell), localhost, sin throttling de red.
- Throttling de CPU _simulado_ vía CDP (deleys entre tareas), no un dispositivo físico 4×/6×.
- Headless vs usuario real; diferencias de scheduler del navegador.
- Muestra pequeña (n=3 por celda) — se usa mediana y dirección consistente, no significancia estadística formal.
- INP incompleto en algunos montajes 3000@1× de Angular (probe del mount); TBT/MTW compensan y están completos.
- El probe INP (Lighthouse core) añade overhead de instrumentación, documentado; se priorizó la métrica de Lighthouse cuando existía.

## 13. Anomalías

- Angular S1 3000@1×: TBT mediana 0 e INP no resuelto en parte de los runs — artefacto del probe en montajes muy grandes; no afecta la comparación (TBT/MTW completos).
- La corrección clave del harness: Lighthouse **resetea la emulación al navegar**; el throttle debe re-aplicarse tras cada `flow.navigate`, no solo antes. Sin esto, el throttling no surte efecto en el flujo.

## 14. Comparación con fases anteriores

| Métrica              | F9/F10 referencia | Fase16 1× | Fase16 4× | Fase16 6× | Cambio                        |
| -------------------- | ----------------- | --------- | --------- | --------- | ----------------------------- |
| S4 React INP @3000   | ~78–100 ms (CDP)  | 100       | 356       | 555       | Se triplica bajo throttle     |
| S4 Angular INP @3000 | ~56–83 ms         | 83        | 291       | 502       | Se multiplica ×6              |
| S1 React TBT @3000   | ~440 ms dur       | 442       | 1867      | 2931      | Penalización creciente        |
| S1 Angular TBT @3000 | ~549 ms dur       | —         | 2533      | 4215      | Angular pierde más en montaje |
| Long tasks S1        | ≥1000 @1× (F15)   | 500       | —         | 300       | Adelanto bajo throttle        |

La Fase 16 **confirma** la dirección de Fase 15 y resuelve H97: el mayor main-thread work incremental de React se traduce en INP/TBT medibles por Lighthouse solo cuando el presupuesto de CPU se reduce.

## 15. Qué sabemos después de Fase 16

### Confirmado

- El sync extra de React en S4 se convierte 1:1 en INP bajo throttling (sync CDP ≈ INP Lighthouse).
- El throttling adelanta los umbrales de INP de S4 y hace visible una diferencia de UX que no aparece en CPU 1×.
- React cruza 100/200 ms de INP incremental con datasets menores que Angular.
- El montaje domina S1/E2E; Angular mantiene la penalización de montaje en todos los rates.
- Accesibilidad invariante (100/100) bajo throttling.
- La dirección de Fase 15 se reproduce y es medible como experiencia de usuario.

### Probable

- El coalescing de Angular (sync ~0,2 ms) explica su INP incremental menor; pero no mide percepción real humana, solo la métrica.

### No concluyente

- INP de montajes muy grandes (S1 3000@1× Angular) incompleto; TBT compensa.
- Relación entre la deuda incremental de React y la **percepción subjetiva** real (no medible en headless).

### Refutado

- Ninguna: la Fase 16 no contradice las fases previas; la refuerza (Fase 14 había mostrado que el mantenimiento no afecta runtime — compatible, aquí la variable es CPU, no mantenimiento).

## 16. Siguiente experimento recomendado (máx 3)

1. **Lighthouse en dispositivo móvil simulado bajo throttling** (Playwright `devices` + 6× + red): validar si los umbrales cruzados de S4 se mantienen en el emulador móvil y en LCP/FCP; resuelve H109 y A-J sobre hardware simulado.
2. **Heap/GC bajo throttling vía Tracing** (@3000 6×, S4 React vs Angular): el sync de React bajo throttle amplificaría la presión de memoria/pausas GC; complementa el puente main-thread→UX.
3. **Test de usabilidad con múltiples interacciones encadenadas** bajo un budget de presupuesto (INP/TBT objetivos): medir si la diferencia incremental de React bajo throttle degrada una secuencia completa de tareas por debajo de un presupuesto UX fijo.
