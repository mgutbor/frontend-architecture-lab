# Fase 9.3 — Flujo end-to-end: montaje + interacción en datasets grandes

> Laboratorio Frontend Architecture Lab · React (useSyncExternalStore) vs Angular (signals + DI) · mismo contrato funcional y mismo dataset
> Experimentos: `interaction-end-to-end-phase9-3` · Evidencia cruda: `docs/experiments/results/interaction-end-to-end-phase9-3.json`

## 1. Pregunta experimental

Las Fases 9.1 y 9.2 aislaron dos regímenes de coste distintos:

- **S1 — montaje de la vista completa** (9.1): cruza 100 ms entre 300 y 600 tareas; escala ~lineal hasta 3000 (React ~419 ms / Angular ~497 ms a 3000); ratio Angular/React ~1,18× estable.
- **S4 — actualización incremental combinada** (9.2): el trabajo síncrono de React crece con las filas (hasta ~78 ms a 2000) mientras Angular lo mantiene plano (~0,2 ms), pero **ninguna actualización incremental cruza 100 ms hasta 2000** (React S4 78,1 ms / Angular 56,3 ms).

La pregunta de esta fase es: **¿qué ocurre en el flujo real — entrar en una vista grande, montarla e interactuar sobre ella — y cómo se combinan ambos regímenes?**

Objetivos concretos:

1. medir la duración de entrada (navigation), del montaje, de la primera interacción (S4), de una interacción repetida (S4b) y el total hasta que la interfaz queda estable;
2. medir el total directamente (no sumar S1 + S4) y cuantificar el **residual** `total − (mount + s4)`;
3. determinar si el flujo combinado cruza los umbrales 100 / 200 / 500 ms antes o después que los experimentos aislados;
4. determinar si el coste de montaje domina el total y si React y Angular **acumulan** el coste de forma diferente;
5. long tasks, aislamiento y estabilidad.

## 2. Contexto de Fases 9.1 y 9.2

| Régimen                           |       300 |       500 |       750 |        1000 |        1500 |      2000 |        3000 |
| --------------------------------- | --------: | --------: | --------: | ----------: | ----------: | --------: | ----------: |
| S1 mount (9.1, mediana ms) R/A    | 68,8/76,5 |         — |         — | 156,0/183,5 | 228,6/274,6 |         — | 419,0/496,9 |
| S4 combined (9.2, mediana ms) R/A | 18,7/17,5 | 28,4/17,8 | 38,3/25,9 |   49,3/36,6 |   63,8/44,7 | 78,1/56,3 |           — |

La Fase 9.2 concluyó que las actualizaciones incrementales degradan 4–6× **después** que el montaje completo. Esta fase mide ambos regímenes **en la misma sesión y en el mismo flujo**, porque el flujo real acumula los dos costes.

## 3. Hipótesis H41–H46

- **H41 — Coste end-to-end**: el flujo completo tendrá un coste aproximadamente consistente con la combinación de montaje + interacción, pero **no necesariamente igual** a la suma de ambas mediciones aisladas.
- **H42 — Dominio del montaje**: en datasets grandes, el montaje inicial dominará el coste total frente a la actualización incremental.
- **H43 — Diferencia React/Angular**: Angular mantendrá una penalización de montaje; React mostrará mayor coste incremental durante S4. Determinar cuál domina el flujo completo.
- **H44 — Umbral end-to-end**: existe un tamaño a partir del cual el flujo completo supera 100 / 200 / 500 ms (no asumir que será igual al umbral de S1).
- **H45 — Long tasks**: la aparición de long tasks será explicable por el tamaño del dataset, no por acumulación indefinida entre interacciones.
- **H46 — Aislamiento**: las interacciones siguen modificando únicamente la feature activa.

## 4. Metodología

- **Misma infraestructura que Fases 7/9/9.1/9.2**: `chrome-headless-shell` vía CDP, servidores estáticos equivalentes para cada build de producción, mismo viewport (1280×800), sin red externa, sin throttling, una máquina local.
- **Mismo dataset** para ambos frameworks vía `?dataset=N` (regla determinista `scale-dataset.ts` del dominio, validada por nivel).
- **Mismo protocolo commit-determinista** de Fase 9.1/9.2: `duration` = tiempo hasta que el conteo objetivo está en el DOM (polling de 8 ms), con poll de estabilidad, recogida de long tasks y ventana de flush final.
- **Una expresión de medición continua por iteración** (reloj único `performance.now()`), de modo que `total` se mide directamente, nunca como suma.
- N=10 iteraciones por celda (framework × dataset), 1 warm-up, resets entre iteraciones fuera de la ventana medida.
- **Células críticas repetidas** (tandas de confirmación de +10): el primer dataset con total ≥ 100 ms, el primero con ≥ 200 ms y el primero con long tasks (deduplicados), más el dataset 500 (cruce de 100 ms por mediana) y el 1000 (cruce de 200 ms de Angular) re-ejecutados explícitamente.
- **Sonda de overhead del observador** (flujo completo en 1000, observer ON vs OFF).
- **Validación de dataset** por nivel y framework: total / incident / inProgress / combined (high) / combinedLow (low) contra la regla documentada.

### 4.1 Anomalía de dataset detectada (y corregida)

La validación detectó que el conteo `combined` (incident + in-progress + **high**, i ≡ 1 mod 12) y `combinedLow` (incident + in-progress + **low**, i ≡ 5 mod 12) **no siempre coinciden**: en la escalera 300–3000 coinciden en 300/750/1000/1500 (23/60/81/123) pero difieren en 1 en 500 (40 vs 39) y 2000 (165 vs 164). Igual que la anomalía de Fase 9.2 (fórmula `i % 3 === 2` vs `i % 3 === 1`), el error estaba en la fórmula del harness, no en las apps. Cada fase del flujo mide contra **su propio** conteo.

### 4.2 Artefacto corregido en s4b (interacción repetida)

En los datasets donde `combined === combinedLow` (300/750/1000/1500) el **conteo de filas no cambia** al pasar de high a low (solo cambia el contenido: otro conjunto de tareas con el mismo tamaño). Un poll basado solo en el conteo habría pasado **antes** del render diferido de Angular, subestimando s4b. Se corrigió detectando el commit de s4b por **cambio de contenido** (el texto de la primera fila debe cambiar) + conteo `combinedLow`.

## 5. Protocolo temporal

Por iteración (una sesión, un reloj):

```
t0 ──click Tasks (desde Projects)──► tSection (sección Tasks en DOM)
   ──► tRowsM (N filas completas en el DOM)
   ── settle 16 ms ──► t0s4
   ──► S4 (search "incident" + status in-progress + priority high)
   ──► tSyncS4 ──► tRowsS4 (conteo combined) ── estabilidad 16 ms ── settle 16 ms ──► t0s4b
   ──► S4b (priority high → low; commit por cambio de contenido + combinedLow)
   ──► tSyncS4b ──► tRowsS4b ── estabilidad 16 ms ── flush final (2 rAF + macrotask + 100 ms) ──► tEnd
```

| Métrica           | Definición                        | Notas                                                                                              |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `navigation`      | `tSection − t0`                   | entrada a la feature                                                                               |
| `mount`           | `tRowsM − t0`                     | misma definición que S1 de Fase 9.1                                                                |
| `s4`              | `tRowsS4 − t0s4`                  | misma definición que S4 de Fase 9.2                                                                |
| `s4Sync`          | `tSyncS4 − t0s4`                  | trabajo síncrono de la primera interacción                                                         |
| `s4b` / `s4bSync` | ídem para la interacción repetida | commit por contenido + conteo                                                                      |
| `total`           | `tRowsS4 − t0`                    | **PRIMARIA para los umbrales**                                                                     |
| `total2`          | `tRowsS4b − t0`                   | flujo completo con interacción repetida                                                            |
| `stableEnd`       | `tEnd − t0`                       | informativa; incluye el piso fijo del flush final (100 ms), NO usable para umbrales                |
| `residual`        | `total − (mount + s4)`            | medido por iteración; = hueco `tRowsM→t0s4` (settle 16 ms + cuantización del poll + scheduling/GC) |

Los settles entre fases se mantienen **mínimos y fijos (16 ms, simétricos)** para que el total esté dominado por trabajo real y no por pisos de protocolo. La ventana de flush de 100 ms solo recoge long tasks/mutaciones residuales de la última fase. Reset entre iteraciones (fuera de la ventana medida): filtros a lista completa (N filas) + vuelta a Projects (vista pequeña), para que cada iteración mida un montaje real.

## 6. Datasets

`?dataset=N` con **N = 300, 500, 750, 1000, 1500, 2000, 3000** (300 = baseline de Fase 7/9; 3000 = límite práctico del navegador headless, ya medido estable en 9.1). Validación de dataset 7/7 niveles × 2 frameworks OK (incluye la anomalía 500/2000).

## 7. Resultados de montaje

| dataset | mount React (ms) | mount Angular (ms) | Δ (A−R) | ratio |
| ------- | ---------------: | -----------------: | ------: | ----: |
| 300     |             57,3 |               69,8 |   +12,5 | 1,22× |
| 500     |             79,4 |              101,8 |   +22,4 | 1,28× |
| 750     |            103,9 |              147,5 |   +43,6 | 1,42× |
| 1000    |            137,2 |              178,1 |   +40,9 | 1,30× |
| 1500    |            221,6 |              249,5 |   +27,9 | 1,13× |
| 2000    |            273,4 |              367,9 |   +94,5 | 1,35× |
| 3000    |            400,0 |              525,1 |  +125,1 | 1,31× |

- Angular penaliza el montaje en **todos** los datasets (ratio ~1,2–1,4×; la varianza entre sesiones hace fluctuar el ratio, la dirección es estable). Consistente con S1 de Fase 9.1 (1,18×).
- `navigation ≈ mount`: la sección y la lista completa se montan casi atómicamente (`mountToRows` ~0,1–1,7 ms) en ambos frameworks — la sección no es un hito intermedio útil.

## 8. Resultados S4 (primera interacción)

| dataset | s4 React (ms) | sync React | s4 Angular (ms) | sync Angular | Δ s4 (A−R) |
| ------- | ------------: | ---------: | --------------: | -----------: | ---------: |
| 300     |           8,9 |        8,9 |             8,7 |          0,2 |       −0,2 |
| 500     |          14,9 |       14,9 |            11,5 |          0,1 |       −3,4 |
| 750     |          21,0 |       21,0 |            17,8 |          0,2 |       −3,2 |
| 1000    |          28,7 |       28,7 |            20,5 |          0,1 |       −8,2 |
| 1500    |          46,6 |       46,4 |            29,7 |          0,1 |      −16,9 |
| 2000    |          60,4 |       60,3 |            42,1 |          0,2 |      −18,3 |
| 3000    |          99,0 |       98,7 |            55,7 |          0,1 |      −43,3 |

- El trabajo síncrono de React **crece con las filas filtradas** (8,9 → 99 ms); Angular lo mantiene plano (~0,1–0,2 ms) gracias al coalescing de signals.
- La brecha de duración de S4 crece con el dataset: **React es más lento en S4 desde 500** y la diferencia se amplía (Δ −3,4 → −43,3 ms).
- Dentro del flujo, `s4` es **menor** que el S4 aislado de Fase 9.2 (300: 8,9/8,7 vs 18,7/17,5; 1000: 28,7/20,5 vs 49,3/36,6). Posibles causas (no aisladas): poll de 8 ms vs 16 ms, y sesión "caliente" tras el montaje (JIT/GC). Es un efecto entre fases, no una medición comparable 1:1.

## 9. Resultados end-to-end (total, mediana ms — commit de la primera interacción)

| dataset | total React (p95) | total Angular (p95) | Δ (A−R) | ratio |
| ------- | ----------------: | ------------------: | ------: | ----: |
| 300     |         83,7 (91) |        95,0 (101,2) |   +11,3 | 1,13× |
| 500     |       112,2 (129) |       129,4 (133,6) |   +17,2 | 1,15× |
| 750     |    142,6 (240,5†) |       181,8 (208,1) |   +39,2 | 1,27× |
| 1000    |       184,6 (192) |       216,7 (246,4) |   +32,1 | 1,17× |
| 1500    |       285,5 (299) |       297,0 (377,2) |   +11,5 | 1,04× |
| 2000    |     351,4 (385,2) |       427,8 (459,5) |   +76,4 | 1,22× |
| 3000    |       521,6 (636) |       605,1 (687,5) |   +83,5 | 1,16× |

† p95 de React a 750 en la tanda principal: un pico de 240,5 ms en 1 iteración; la tanda de confirmación da 148,3 (p95 163,3) — pico no reproducible (ruido de scheduling).

- **El total de Angular es mayor en todos los datasets** (Δ +11,3 → +83,5 ms). La penalización de montaje de Angular domina; la ventaja incremental de React en S4 compensa parcialmente pero no la supera.
- Ratio total Angular/React ~1,04–1,27×, sin tendencia clara (el ratio fluctúa por la varianza del montaje entre sesiones).

## 10. Mount vs interaction (dominio del coste)

| dataset | mount% React | s4% React | mount% Angular | s4% Angular |
| ------- | -----------: | --------: | -------------: | ----------: |
| 300     |         68,5 |      10,8 |           73,5 |         9,3 |
| 500     |         70,4 |      13,3 |           78,2 |         8,8 |
| 750     |         73,0 |      14,8 |           81,2 |         9,9 |
| 1000    |         74,5 |      15,7 |           82,3 |         9,7 |
| 1500    |         77,7 |      16,4 |           84,4 |         9,7 |
| 2000    |         77,8 |      16,8 |           86,0 |         9,9 |
| 3000    |         77,3 |      19,1 |           87,2 |         9,5 |

- **El montaje domina el flujo en ambos frameworks** (68–87 % del total) y su dominio **crece con el dataset** (más en Angular: 73,5 → 87,2 %).
- El peso relativo de S4 es estable en Angular (~9–10 %) y crece ligeramente en React (10,8 → 19,1 %) por su trabajo síncrono.

## 11. Residual (total vs mount + s4)

| dataset | residual React (ms / %) | residual Angular (ms / %) |
| ------- | ----------------------: | ------------------------: |
| 300     |             17,4 / 21,0 |               16,1 / 16,9 |
| 500     |             17,5 / 15,8 |               16,2 / 12,7 |
| 750     |             17,3 / 12,1 |                16,2 / 9,0 |
| 1000    |              17,8 / 9,7 |                17,0 / 7,9 |
| 1500    |              16,6 / 5,8 |                17,6 / 5,9 |
| 2000    |              18,1 / 5,2 |                17,3 / 4,0 |
| 3000    |              18,7 / 3,5 |                19,2 / 3,4 |

- **El residual es plano (~16–19 ms) en todos los datasets y ambos frameworks**: coincide con el settle fijo de 16 ms + la cuantización del poll (~8 ms). No crece con el dataset → **no hay amplificación por scheduling/GC** entre fases: `total ≈ mount + s4 + 17 ms` en todo el rango.
- En porcentaje, el residual cae del ~21 % al ~3,5 % porque el total crece mientras el residual permanece constante.

## 12. Long tasks

| dataset | LT React (suma) | por fase (mount/s4/s4b) | iter. afectadas | LT Angular | por fase (mount/s4/s4b) | iter. afectadas |
| ------- | --------------: | ----------------------- | --------------: | ---------: | ----------------------- | --------------: |
| 300–500 |               0 | —                       |               0 |          0 | —                       |               0 |
| 750     |               2 | 1/1/0                   |               1 |          0 | —                       |               0 |
| 1000    |               0 | —                       |               0 |          0 | —                       |               0 |
| 1500    |               0 | —                       |               0 |          0 | —                       |               0 |
| 2000    |              20 | 10/10/0                 |           10/10 |          0 | —                       |               0 |
| 3000    |              20 | 10/10/0                 |           10/10 |         14 | 7/7/0                   |            7/10 |

- React: long tasks **deterministas** desde 2000 (montaje + s4 síncrono, ambos > 50 ms en bloque); a 3000 se mantienen 10+10. El pico aislado de 750 (1 iteración) no se reproduce.
- Angular: **0 long tasks hasta 3000** pese a un montaje más pesado (el trabajo se reparte en tareas < 50 ms); a 3000 aparecen 14 (7 mount + 7 s4) en 7/10 iteraciones.
- **La fase s4b nunca genera long tasks** en ningún framework: no hay acumulación entre interacciones. La aparición es atribuible al dataset (reproducida en confirmaciones), no a ruido.

## 13. Umbrales (50/100/200/500 ms operativos, sobre `total`)

| umbral   | React                                                                 | Angular                                                                      |
| -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| > 100 ms | **entre 300 y 500** (500: 112,2; 10/10 iter. > 100; confirmado 114,1) | **entre 300 y 500** (500: 129,4; 10/10; confirmado 124,0)                    |
| > 200 ms | **en 1500** (285,5; 10/10; confirmado 283,2)                          | **en 1000** (216,7; 9/10; confirmado 213,0, 9/10) — ver matiz del observador |
| > 500 ms | **en 3000** (521,6; 10/10; confirmado 524,6)                          | **en 3000** (605,1; 10/10; confirmado 605,1)                                 |

- **100 ms**: ambos cruzan entre 300 y 500 — la misma horquilla que S1 (9.1: entre 300 y 600). El flujo end-to-end **no cruza materialmente antes** que el montaje aislado: la interacción añade s4 (~9–15 ms a esos tamaños) sobre un montaje que ya domina.
- **200 ms**: **Angular cruza antes que React** (1000 vs 1500). Matiz de validez: la sonda de overhead mide ~30 ms de coste del observador en Angular a 1000 (construcción DOM incremental); corregido, el total de Angular a 1000 ≈ 185 ms → el cruce corregido cae entre 1000 y 1500. Con el harness oficial (mismo observador en ambos), el cruce de Angular en 1000 es **reproducible** (9/10 y 9/10 en dos tandas independientes).
- **500 ms**: ambos en 3000 (React 521,6 / Angular 605,1, 10/10), holgado respecto al overhead.
- Ningún framework supera 200 ms por debajo de su propio cruce: los cruces son limpios (0/10 → 9-10/10), no graduales.

## 14. Aislamiento

- **0 mutaciones fuera de la sección activa (outsideActive) en las fases S4 y S4b**, en los 7 datasets y ambos frameworks (sonda de aislamiento de Fase 9, targets desconectados contados como dentro).
- La fase de montaje reemplaza la sección (su `outsideActive` cuenta el trabajo de construcción — artefacto documentado en Fases 9/9.1/9.2), por lo que el veredicto de aislamiento se basa exclusivamente en S4/S4b.
- Mutaciones S4 (registros): React 342→3267, Angular 1244→13169 (la construcción DOM incremental de Angular genera ~4× más registros — asimetría ya documentada, no una violación de aislamiento).

## 15. Comparación con Fase 9.1 (S1, montaje)

- `mount` del flujo reproduce S1 de 9.1 dentro de la varianza entre sesiones (1000: 137,2 vs 156,0; 1500: 221,6 vs 228,6; 3000: 400,0 vs 419,0). Diferencias atribuibles a: poll de 8 ms vs 16 ms, observador completo vs mínimo (9.1 documentó +9/+15,6 ms de overhead en 1000), varianza de sesión.
- **Conclusión sin cambios**: el montaje sigue dominando el flujo y su cruce de 100 ms permanece en la horquilla 300–600.

## 16. Comparación con Fase 9.2 (S4, actualización incremental)

- `s4` del flujo es **menor** que el S4 aislado de 9.2 en ambos frameworks (300: 8,9/8,7 vs 18,7/17,5; 1000: 28,7/20,5 vs 49,3/36,6). No es una medición directamente comparable (poll 8 vs 16 ms; sesión post-montaje con JIT caliente), pero indica que la interacción **en contexto** no es más cara que aislada.
- **Conclusión sin cambios**: ninguna actualización incremental (ni aislada ni en flujo) cruza 100 ms por sí sola hasta 2000; en el flujo, el cruce de 100 ms lo produce el montaje, no la interacción.

## 17. Diferencias significativas vs ruido

**Significativas y reproducibles:**

- Cruce de 100 ms entre 300 y 500 en ambos (confirmado en tandas independientes).
- Angular cruza 200 ms en 1000 (9/10, reproducido 9/10) vs React en 1500 (10/10).
- Ambos cruzan 500 ms en 3000 (10/10).
- Residual plano ~17 ms en todo el rango (aditividad exacta, sin amplificación).
- Brecha de `s4Sync` que crece (React 8,9→99 vs Angular ~0,1–0,2).
- `s4b` de Angular ~4–5× el de React (render diferido del contenido con ~20× más mutaciones DOM).
- `mount%` creciente de Angular (73,5→87,2 %).
- Long tasks deterministas de React desde 2000 (10/10 iteraciones); Angular 0 hasta 3000.

**Ruido / con matiz:**

- El cruce de 100 ms "marginal" de Angular a 300 (1/10 iteraciones > 100 en algunas tandas; p95 101–111 — bordea el umbral sin cruzarlo por mediana).
- El pico de p95 de React a 750 (240,5 ms en 1 iteración; confirmación 148,3 — no reproducible).
- La corrección del overhead del observador de Angular (~30 ms a 1000) desplaza el cruce corregido de 200 ms de 1000 a la horquilla 1000–1500.
- La variación entre sesiones del montaje (Δ ratio 1,13–1,42×, fluctuante).

## 18. Limitaciones

- localhost, una máquina, sin throttling, un único headless-shell; no representa condiciones de campo ni dispositivos móviles.
- El observador añade overhead asimétrico (~30 ms a Angular en 1000 por su construcción DOM incremental, cuantificado por la sonda en dos muestras: 32,4 / 33,1 ms; React ~6–9 ms). No es eliminable si se quiere medir mutaciones/aislamiento; los cruces de 100 y 500 ms son holgados respecto a él; el de 200 ms de Angular es sensible (documentado).
- Polls de 8 ms: cuantización ~8 ms en todas las duraciones (incluida en los valores).
- `residual` incluye el settle fijo de 16 ms (piso simétrico); solo el exceso sobre ~16–24 ms es atribuible a scheduling/GC.
- `stableEnd` incluye el piso del flush final (100 ms) y no se usa para umbrales; `total2` incluye dos settles de 16 ms y el coste de s4b.
- El reset entre iteraciones reconstruye la lista completa fuera de la ventana medida (a 3000 es costoso pero no contamina la medición).
- Las comparaciones con 9.1/9.2 son contextuales (harness ligeramente distinto: poll, observador, sesión).

## 19. Reproducibilidad

- Script único: `node scripts/measure-interaction-end-to-end-phase9-3.mjs [/tmp/lab-phase9-3] [--quick] [--no-build] [--datasets=300,500]` — resumible por tramos (merge en el JSON existente), determinista (validación de dataset por nivel + checks funcionales por iteración; parada controlada si un conteo objetivo no se alcanza o no se mantiene).
- 7 datasets × 2 frameworks × 10 iteraciones = **140 iteraciones medidas** + 7 tandas de confirmación (70 iteraciones) + validaciones. Checks 10/10 en todas las celdas.
- La copia experimental `/tmp/lab-phase9-3` (clon de lab-phase9-2 con las 10 features de Fase 8 + `scale-dataset` + builds de producción) queda lista para reproducir o extender la medición.

## 20. Veredictos

| Hipótesis                          | Veredicto                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H41 — Coste end-to-end**         | **CONFIRMADA** — el total medido = `mount + s4 + ~17 ms` constantes en todo el rango (residual plano 16–19 ms, sin amplificación por scheduling/GC). Los dos regímenes se combinan de forma **aditiva**, no multiplicativa. Matiz: `s4` en flujo es menor que el S4 aislado de 9.2 (efecto de contexto/sesión, no aislado causalmente).                       |
| **H42 — Dominio del montaje**      | **CONFIRMADA** — mount% = 68–78 % (React) y 74–87 % (Angular) del total; el dominio **crece con el dataset** (Angular 73,5 → 87,2 %).                                                                                                                                                                                                                         |
| **H43 — Diferencia React/Angular** | **CONFIRMADA** — Angular penaliza el montaje en todos los datasets (Δ +12,5 → +125,1 ms; ratio ~1,2×); React paga más en S4 (Δ −3,4 → −43,3 ms). **En el flujo completo domina la penalización de montaje de Angular**: el total de Angular es mayor en los 7 datasets (Δ +11,3 → +83,5 ms), parcialmente compensado por el coste incremental de React en S4. |
| **H44 — Umbral end-to-end**        | **CONFIRMADA** — >100 ms: ambos entre 300 y 500; >200 ms: Angular en 1000 (confirmado, con matiz de observador), React en 1500; >500 ms: ambos en 3000. El flujo no cruza materialmente antes que S1: el montaje domina y la interacción solo desplaza el cruce dentro de la misma horquilla.                                                                 |
| **H45 — Long tasks**               | **CONFIRMADA** — aparición determinista y atribuible al dataset (React desde 2000, 10/10 iteraciones; Angular desde 3000, 7/10; reproducidas en confirmaciones). **Sin acumulación entre interacciones**: s4b nunca genera long tasks.                                                                                                                        |
| **H46 — Aislamiento**              | **CONFIRMADA** — 0 mutaciones fuera de la sección activa en S4/S4b, los 7 datasets y ambos frameworks.                                                                                                                                                                                                                                                        |

## 21. Conclusión

**El flujo real (entrar → montar → interactuar → repetir) es aditivo y está dominado por el montaje.** Las dos preguntas que dejaron abiertas las Fases 9.1 y 9.2 — "¿cómo se acumulan los dos regímenes?" y "¿el flujo combinado cruza umbrales antes que los experimentos aislados?" — tienen respuesta con evidencia:

1. **Aditividad exacta**: `total = mount + s4 + ~17 ms` en todo el rango 300–3000. No hay amplificación (GC/scheduling) entre fases: el residual es plano y simétrico. La "acumulación" temida no existe a nivel de coste.
2. **El montaje manda**: 68–87 % del total, y más en Angular (87 % a 3000). El cruce de 100 ms del flujo (entre 300 y 500) está en la misma horquilla que S1: la interacción añade s4, pero el montaje ya cruza antes. **El flujo no degrada antes que el montaje aislado.**
3. **Dos perfiles de coste distintos y estables**: Angular paga más en el montaje (ratio ~1,2×) y React paga más en la interacción (s4Sync crece hasta 99 ms a 3000; s4b de React 15,8 vs 48,8 ms de Angular). En el total, la penalización de montaje de Angular domina (Δ total siempre a favor de React, +11 → +84 ms).
4. **Long tasks**: React las genera desde 2000 (montaje + s4 síncronos > 50 ms); Angular ninguna hasta 3000 (trabajo fragmentado), y en s4b **nunca** en ninguno. No hay degradación acumulativa entre interacciones.
5. **Aislamiento intacto** bajo el flujo completo en los 7 tamaños.

El flujo end-to-end **no cambia la conclusión de Fases 9.1/9.2**: montaje e interacción son regímenes aditivos; el umbral de 100 ms lo fija el montaje; la interacción incremental sigue siendo barata relativa al montaje incluso a 3000 (React s4 99 ms vs mount 400 ms; Angular 56 vs 525 ms).

## 22. Siguiente experimento recomendado

1. **Escalar el caso de interacción más pesado en flujo**: repetir S4 (filtros combinados) de forma repetida sobre 2000–3000 tareas (3–5 S4 encadenados) para comprobar empíricamente si la brecha de `s4Sync` de React (99 ms a 3000) acaba generando long tasks acumuladas — el único régimen donde la acumulación podría aparecer (en esta fase s4b nunca generó long tasks porque su render es menor que el de s4).
2. **Lighthouse user flows** sobre el flujo S1→S4 con datasets 1000–2000 para triangular con métricas de campo (la infraestructura headless-shell ya está desbloqueada desde Fase 5.9/9).
3. **Dataset con contenido heterogéneo** (no solo "Incident report N"): el filtro por título actual es un caso degenerado de coincidencia de strings; un catálogo con títulos variados cambiaría el coste de filtrado de React (más trabajo síncrono por fila).
