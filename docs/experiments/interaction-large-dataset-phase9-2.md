# Fase 9.2 — Actualizaciones incrementales bajo datasets grandes

> Experimento del Frontend Architecture Lab · React Monolith vs Angular Monolith
> Evidencia cruda: [`results/interaction-large-dataset-phase9-2.json`](./results/interaction-large-dataset-phase9-2.json)
> Script: `scripts/measure-interaction-large-dataset-phase9-2.mjs` (`pnpm interaction:large-dataset`)

---

## 1. Pregunta experimental

La Fase 9 mostró que al crecer el dataset (30 → 100 → 300 tareas) la latencia percibida agregada seguía siendo equivalente, pero React acumulaba mucho más **trabajo síncrono** por interacción de lista (signals/coalescing de Angular lo mantenían plano). La Fase 9.1 demostró que el **montaje completo** (S1) cruza el umbral operativo de 100 ms entre 300 y 600 tareas y escala ~lineal hasta 3000.

La pregunta de esta fase: **¿cuándo empiezan las actualizaciones incrementales (filtros) a convertir su diferente coste interno en latencia de commit perceptible?**

Específicamente: (1) ¿el trabajo síncrono de React sigue creciendo con las filas?; (2) ¿Angular mantiene su coalescing?; (3) ¿esa diferencia acaba afectando a settle/commit medible?; (4) ¿en qué dataset cada framework cruza 50/100/200 ms?; (5) ¿las actualizaciones incrementales degradan antes o después que el montaje de S1?; (6) ¿aparece un cambio de régimen dentro del rango práctico del navegador?

## 2. Hipótesis H35–H40

| Hipótesis | Definición                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| **H35**   | La diferencia de trabajo síncrono de React crece con el dataset en S2/S4.                                         |
| **H36**   | Angular mantiene trabajo síncrono aproximadamente plano (coalescing) bajo carga.                                  |
| **H37**   | A partir de cierto tamaño, la diferencia de trabajo síncrono se convierte en diferencia medible de settle/commit. |
| **H38**   | S2/S4 cruzan 100 ms antes o después que S1.                                                                       |
| **H39**   | Crecimiento ~lineal sin discontinuidad (cambio de régimen) hasta el límite práctico del navegador.                |
| **H40**   | Las actualizaciones de S2/S4 siguen afectando solo a la sección activa (aislamiento).                             |

Ninguna se da por confirmada antes de medir; el veredicto se basa exclusivamente en los datos de la sección 18.

## 3. Metodología

Misma infraestructura de Fases 7/9/9.1: copia experimental aislada en `/tmp/lab-phase9-2` (clon de `/tmp/lab-phase9-1`), builds de producción de ambas apps, `chrome-headless-shell` vía CDP directo (único headless funcional en este entorno), servidores estáticos idénticos, **cero dependencias nuevas**.

Dataset por `?dataset=N` con la regla determinista `scale-dataset.ts` del dominio (idéntico para ambos frameworks). Las 10 features de Fase 8 siguen montadas (16 áreas de navegación).

## 4. Datasets

| Nivel | Tareas | Esperado S2 (`incident`) | Esperado S4 (`combined`) |
| ----- | -----: | -----------------------: | -----------------------: |
| 300   |    300 |                      274 |                       23 |
| 500   |    500 |                      474 |                       40 |
| 750   |    750 |                      724 |                       60 |
| 1000  |   1000 |                      974 |                       81 |
| 1500  |   1500 |                     1474 |                      123 |
| 2000  |   2000 |                     1974 |                      165 |

Los conteos esperados se calculan con la regla documentada de generación. **Anomalía detectada y corregida**: la fórmula de Fase 9 asumía `priority === 'high'` cuando `i % 3 === 2`; la regla real es `i % 3 === 1`. Coinciden en 30/100/300 (0/6/23) y en 600/750/1000/1500, pero divergen en 500 (39 vs 40). La validación de dataset de esta fase lo detectó (fallo de `waitFor` en la validación de 500), se corrigió la fórmula y la validación confirmó `combined = 40` en ambas apps.

## 5. Protocolo de medición

Reutiliza el **protocolo commit-determinista de Fase 9.1** aplicado a actualizaciones incrementales:

```
t0 → dispatch acción → tSync (trabajo síncrono)
   → poll de 16 ms hasta que la lista filtrada alcanza el conteo esperado → tRows
   → poll de estabilidad (el conteo debe mantenerse)
   → 2 rAF + macrotask + 100 ms de flush (long tasks / mutaciones residuales) → t1
```

- `sync` = tSync − t0 — trabajo síncrono del/de los evento(s).
- `commitToRows` = tRows − tSync — commit diferido hasta el conteo objetivo.
- **`duration` = tRows − t0 — PRIMARIA** (misma definición que S1 de Fase 9.1: tiempo hasta que la lista alcanza el tamaño objetivo, por lo que los umbrales S1 vs S2 vs S4 son comparables dentro de la misma metodología).
- `paintTail` = t1 − tRows — ventana de flush (informativa).

No se usó ScriptDuration de CDP. Se mantienen las correcciones de Fase 7 (reset diferido, `settleRows` hasta que la lista completa vuelve y se confirma estable). Se rechazó una ventana de quiescencia fija (piso de ~150 ms que cruzaría el umbral en el dataset menor, invalidando la pregunta).

**Harness**: long tasks + event timing (PerformanceObserver) + MutationObserver (childList + attributes + characterData) con la sonda de aislamiento de Fase 9 (mutaciones fuera de `main` / fuera de la sección activa; targets desconectados contados como dentro). El coste del observador se cuantifica con una **sonda de overhead** (S2 a 1000, ON vs OFF).

**Ejecución**: validación de dataset por nivel (total/incident/inProgress/combined contra la regla) → N=10 iteraciones por celda (checks funcionales por iteración) → sonda de overhead → tandas de confirmación (+10) para celdas con mediana o p95 ≥ 100 ms (no hubo ninguna). Total: **240 iteraciones medidas** (6 datasets × 2 escenarios × 2 apps × 10) + 6 validaciones. Ejecutado por tramos resumibles (`--datasets=…`, merge en el JSON) por estabilidad del entorno.

## 6. Resultados S2 — Search/Filtro

Mediana de `duration` (ms, commit hasta el conteo objetivo; p95 entre paréntesis). `sync` = trabajo síncrono.

| Dataset | React dur (p95) | Angular dur (p95) | Δ (A−R) |   sync R/A | LT R/A | >50 ms R/A | >100 ms R/A |
| ------- | --------------: | ----------------: | ------: | ---------: | -----: | ---------: | ----------: |
| 300     |       8,4 (9,6) |       17,5 (18,1) |    +9,1 |  8,1 / 0,2 |    0/0 |        0/0 |         0/0 |
| 500     |     14,0 (14,8) |       19,6 (22,3) |    +5,6 | 13,6 / 0,2 |    0/0 |        0/0 |         0/0 |
| 750     |     18,2 (20,6) |       26,1 (27,9) |    +7,9 | 17,6 / 0,2 |    0/0 |        0/0 |         0/0 |
| 1000    |     24,8 (27,5) |       31,9 (36,4) |    +7,1 | 24,1 / 0,2 |    0/0 |        0/0 |         0/0 |
| 1500    |     33,2 (35,4) |       39,7 (41,7) |    +6,5 | 32,2 / 0,1 |    0/0 |        0/0 |         0/0 |
| 2000    |     38,0 (40,9) |       48,0 (49,7) |   +10,0 | 36,8 / 0,2 |    0/0 |        0/0 |         0/0 |

- El trabajo síncrono de React crece con el dataset (8,1 → 36,8 ms); el de Angular es plano (~0,1-0,2 ms).
- La **duración** es mayor en Angular en todos los datasets: su commit es **diferido** (no ocurre dentro del evento), y el poll lo capta ~17-48 ms después; React hace todo el trabajo en el evento y su `duration ≈ sync`.
- Las mutaciones DOM son **constantes** (34/27 registros) en todos los tamaños: el filtro `incident` elimina exactamente 26 filas (N − 26 → N − 26) y React/Angular reutilizan las filas conservadas por key.
- Ninguna celda de S2 supera 50 ms en la ejecución final (p95 máx. 49,7 Angular a 2000); en tandas anteriores de 2000 Angular tuvo cruces esporádicos de 50 ms (1/10 y 5/10 según tanda) — su p95 está justo en el borde del umbral. Ninguno se acerca a 100 ms.

## 7. Resultados S4 — Combinado (search + status + priority)

| Dataset | React dur (p95) | Angular dur (p95) |          Δ (A−R) |   sync R/A | LT R/A | >50 ms R/A | >100 ms R/A |
| ------- | --------------: | ----------------: | ---------------: | ---------: | -----: | ---------: | ----------: |
| 300     |     18,7 (19,8) |       17,5 (18,0) | −1,2 (inestable) | 18,7 / 0,2 |    0/0 |        0/0 |         0/0 |
| 500     |     28,4 (34,0) |       17,8 (21,7) |        **−10,6** | 28,3 / 0,1 |    0/0 |        0/0 |         0/0 |
| 750     |     38,3 (41,2) |       25,9 (31,3) |        **−12,4** | 38,2 / 0,2 |    0/0 |        0/0 |         0/0 |
| 1000    |     49,3 (52,7) |       36,6 (40,4) |        **−12,7** | 49,3 / 0,2 |    5/0 |        4/0 |         0/0 |
| 1500    |     63,8 (73,4) |       44,7 (54,5) |        **−19,1** | 63,7 / 0,1 |    9/1 |        9/3 |         0/0 |
| 2000    |     78,1 (89,7) |       56,3 (66,2) |        **−21,8** | 78,0 / 0,2 |   10/8 |       10/9 |         0/0 |

- **En 300 ambos son equivalentes** (18,7 vs 17,5 ms; la dirección es inestable entre ejecuciones — en la primera tanda React era más rápido con 14,4 vs 17,8). **Desde 500 en adelante Angular es claramente más rápido** (Δ −10,6 → −21,8), reproducible en los 5 datasets ≥ 500.
- La duración de React **es** su trabajo síncrono (`duration ≈ sync`, commitToRows ~0,1): el coste del filtrado combinado (3 predicados sobre N tareas + render del resultado) ocurre dentro del evento.
- La duración de Angular crece más despacio (17,5 → 56,3): commit diferido coalescido; el crecimiento refleja el mayor resultado filtrado (23 → 165 filas).
- **Ninguno cruza 100 ms** de mediana en todo el rango (React p95 máx. 89,7 a 2000).
- Long tasks: React desde 1000 (5/10, ~50 ms de sync), 9/10 a 1500 (63,7 ms), 10/10 a 2000 (78 ms, máx 89,7). Angular: 0/10 a 1000, 1/10 a 1500, 8/10 a 2000 (54-68 ms). React genera long tasks antes y más largas; ninguna alcanza el umbral de 100 ms de duración total.

## 8. Sync vs commit

Separación explícita de las tres conclusiones (A. trabajo interno · B. coste de commit · C. experiencia):

- **S2**: el sync de React crece (A), pero su commit ocurre en el evento (B ≈ A) y queda por debajo del commit diferido de Angular (B). La experiencia C (duración medida) es **Angular más lento** (+5,6 a +10 ms) en todo el rango — por el momento del commit, no por trabajo síncrono.
- **S4**: el sync de React crece (A) y **se convierte** en duración (B = A). A partir de 500, B supera al commit diferido de Angular, que se mantiene por debajo gracias al coalescing. La experiencia C (duración) es **React más lento** desde 500 (Δ −10,6 a −21,8 ms).
- **Ninguna** diferencia supera 100 ms de mediana en el rango observado: todo permanece en latencia sub-umbral, aunque S4 a 2000 (React 78,1; p95 89,7) se acerca.

## 9. Long tasks

| Dataset | S2 LT (R/A) | S4 LT (R/A) | Duración mediana LT (R/A, S4) |
| ------- | ----------: | ----------: | ----------------------------: |
| 300–750 |         0/0 |         0/0 |                             — |
| 1000    |         0/0 |         5/0 |                    ~50 / — ms |
| 1500    |         0/0 |         9/1 |            63,7 / — ms (sync) |
| 2000    |         0/0 |        10/8 |   78 / 54-68 ms (máx 89,7/68) |

- Aparecen desde 1000 (React, S4) y son deterministas en las iteraciones afectadas.
- La duración de las long tasks de React crece con el sync (50 → 78 ms); las de Angular son más cortas y estables (54-68 ms).
- Las long tasks de React son **el propio trabajo síncrono del evento** superando 50 ms; en Angular corresponden al commit diferido cuando el resultado filtrado es grande.

## 10. Aislamiento (H40)

| Dataset  | S2 outsideActive (R/A) | S4 outsideActive (R/A) |
| -------- | ---------------------: | ---------------------: |
| 300–2000 |                  0 / 0 |                  0 / 0 |

**0 mutaciones fuera de la sección activa** en las 24 celdas (6 datasets × 2 escenarios × 2 apps), con la sonda corregida de Fase 9 (referencia viva de la sección; targets desconectados contados como dentro). El aislamiento se mantiene perfecto a cualquier tamaño: la búsqueda/filtro solo toca la sección Tasks.

## 11. Comparación con S1 (montaje completo)

S1 se toma de los resultados de Fase 9.1 (mismo protocolo de commit; observador mínimo vs observador completo de esta fase — asimetría acotada por la sonda de overhead: +1,4 / +2,4 ms).

| Dataset |                  S1 dur (R/A) | S2 dur (R/A) | S4 dur (R/A) |
| ------- | ----------------------------: | -----------: | -----------: |
| 300     |                   68,8 / 76,5 |   8,4 / 17,5 |  18,7 / 17,5 |
| 1000    |                 156,0 / 183,5 |  24,8 / 31,9 |  49,3 / 36,6 |
| 1500    |                 228,6 / 274,6 |  33,2 / 39,7 |  63,8 / 44,7 |
| 2000    | — (9.1: 3000 → 422,8 / 499,5) |  38,0 / 48,0 |  78,1 / 56,3 |

**El montaje completo es 3-7× más caro que cualquier actualización incremental al mismo tamaño de dataset** (a 1000: S1 156/183 vs S4 49/37; a 1500: S1 229/275 vs S4 64/45).

## 12. Umbrales (50 / 100 / 200 ms — operativos, no percepción)

| Umbral     | S1 (Fase 9.1)                                                             | S2                                                                              | S4                                                                  |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 50 ms      | ya en 300 (68,8/76,5)                                                     | ninguno (p95 máx. 49,7 Angular a 2000; cruces esporádicos en tandas anteriores) | React ~1000 (49,3, p95 52,7); Angular ~1500-2000 (gt50 3/10 y 9/10) |
| **100 ms** | **entre 300 y 600** (600: 105,4/124,1; cruce interpolado ~555 R / ~450 A) | **no cruza hasta 2000**                                                         | **no cruza hasta 2000** (React 78,1, p95 89,7)                      |
| 200 ms     | entre 1000 y 1500 (~1160-1240 interpolado)                                | no cruza                                                                        | no cruza                                                            |

**Las actualizaciones incrementales degradan mucho más tarde que el montaje.** S1 cruza 100 ms entre 300 y 600; S2/S4 no lo cruzan (mediana) en todo el rango 300-2000. Interpolación (etiquetada como inferencia, no medida): S4 cruzaría 100 ms en ~2 650 tareas (React) / ~4 000 (Angular); S2 aún más tarde.

## 13. Análisis de crecimiento

Pendientes de duración (ms por 1000 tareas de dataset), heurística de Fase 9.1:

| Segmento  |      S2 R/A |      S4 R/A |
| --------- | ----------: | ----------: |
| 300→500   | 28,0 / 10,5 |  48,5 / 1,5 |
| 500→750   |   16,8 / 26 | 39,6 / 32,4 |
| 750→1000  | 26,4 / 23,2 | 44,0 / 42,8 |
| 1000→1500 | 16,8 / 15,6 | 29,0 / 16,2 |
| 1500→2000 |  9,6 / 16,6 | 28,6 / 23,2 |

- **S4 React**: pendientes moderadas y decrecientes en general (48,5 → 28,6), sin picos >50. La no-uniformidad está modulada por el crecimiento **escalonado del conjunto de resultados** (23 → 40 → 60 → 81 → 123 → 165 filas), no por el dataset: en términos de **ms por fila de resultado**, React S4 es ~0,81 → 0,71 → 0,64 → 0,61 → 0,52 → 0,47 (sublineal/decreciente), Angular 0,76 → 0,45 → 0,43 → 0,45 → 0,36 → 0,34 (decreciente, con el piso del commit diferido).
- **S2**: pendientes bajas y oscilantes (9-28 ms/1000); el delta de trabajo es el filtrado (crece con N) pero el commit DOM es constante (26 filas).
- **Angular sync**: plano (0,0-0,4 ms/1000) en todos los segmentos.

## 14. Cambio de régimen

**No se observa discontinuidad ni cambio de régimen** en 300-2000 en ningún escenario ni framework. El crecimiento es aproximadamente lineal en el tamaño del resultado filtrado (sublineal en el dataset) y los saltos aparentes de pendiente corresponden al crecimiento escalonado del propio resultado filtrado (23 → 165 filas), no a un comportamiento emergente. La heurística de segmentos clasifica los tramos como lineal/sublineal mezclados, sin ningún tramo superlineal >1,25× respecto al anterior.

## 15. Diferencias significativas vs ruido

**Significativas y reproducibles** (dirección estable en los 6 datasets y en las múltiples tandas de ejecución):

1. El trabajo síncrono de React crece con el dataset en S2 (8,1 → 36,8 ms) y S4 (18,7 → 78,0 ms); Angular permanece ~0,1-0,2 ms (H35/H36).
2. En S4, a partir de 500, la duración de React supera a la de Angular (Δ −10,6 → −21,8 ms): la conversión sync → duración ocurre y es medible (H37 en S4).
3. S2/S4 no cruzan 100 ms en 300-2000, frente a S1 que cruza entre 300 y 600 (H38).
4. Aislamiento perfecto (0 mutaciones fuera de la sección) en las 24 celdas (H40).
5. Long tasks: React en S4 desde 1000 y creciendo en duración (50 → 78 ms); Angular más tarde y más cortas.

**Ruido / no concluyente**:

- La diferencia S2 Angular-vs-React (+5,6 a +10 ms) depende del instante del commit diferido y de la cuantización del poll (16 ms): la magnitud exacta es incierta, aunque la dirección es estable.
- La dirección de S4 a 300 es inestable entre tandas (primera ejecución: React 14,4 < Angular 17,8; final: React 18,7 > Angular 17,5): en 300 ambos son equivalentes; la ventaja de Angular solo es robusta desde 500.
- Los valores absolutos varían ±1-4 ms entre tandas de ejecución (p. ej. S4 a 2000: 76,8/58,7 en una tanda, 78,1/56,3 en otra): variabilidad normal del navegador, no cambia ninguna conclusión.
- Heap (CDP, informativo): el delta de heap de React crece con el dataset y es ~10× el de Angular a 2000 (S4: 10 843 vs 1 158 kB; S2: 4 785 vs 322 kB) — consistente con Fase 7, pero CDP es poco fiable en este headless-shell y no se usa como métrica primaria.

## 16. Limitaciones

- Mediciones en localhost, una máquina, sin throttling; no representan condiciones de campo.
- Cuantización del poll (16 ms) en el instante de commit; afecta sobre todo a Angular (commit diferido), dando un piso de ~16-20 ms en su duración.
- Comparación S1 vs S2/S4 con harness asimétrico (Fase 9.1: observador mínimo; esta fase: observador completo); el overhead del observador es pequeño (sonda en S2 a 1000: +1,4 / +2,4 ms), y los cruces de 100 ms están holgados respecto a ese overhead.
- El reset entre iteraciones reconstruye la lista completa (hasta 2000 filas) fuera de la ventana medida; no contamina la métrica pero alarga la ejecución.
- Los umbrales 50/100/200 ms son operativos del experimento, no equivalen automáticamente a percepción humana.
- La extrapolación del cruce de 100 ms de S4 (~2 650 / ~4 000) es una inferencia sobre pendientes observadas, no una medida.
- Una única máquina/headless; resultados indicativos, no benchmark científico (metrics.md §1).

## 17. Reproducibilidad

- Copia experimental `/tmp/lab-phase9-2` (clon de lab-phase9-1; apps intactas; builds de producción verificados).
- Script único: `node scripts/measure-interaction-large-dataset-phase9-2.mjs [/tmp/lab-phase9-2] [--quick] [--no-build] [--datasets=300,500]` — resumible por tramos (merge en el JSON existente) y determinista (validación de dataset + checks funcionales por iteración; parada controlada si un conteo no se alcanza).
- 240 iteraciones medidas + 6 validaciones; JSON generado automáticamente por el script.
- Anomalía corregida documentada en §4 (fórmula de conteo combinado de Fase 9 divergente en 500).

## 18. Veredictos finales

| Hipótesis                                    | Veredicto                              | Evidencia                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H35 — Escalabilidad del trabajo síncrono** | **CONFIRMADA**                         | Sync de React: S2 8,1→36,8 ms; S4 18,7→78,0 ms (crecimiento medible en 6 datasets). Angular plano (~0,1-0,2 ms).                                                                                                                                                                              |
| **H36 — Coalescing bajo carga**              | **CONFIRMADA**                         | Angular mantiene sync ~0,1-0,2 ms en los 6 datasets y ambos escenarios, con commit diferido coalescido (commitToRows crece con el resultado, no con el dataset).                                                                                                                              |
| **H37 — Conversión a latencia perceptible**  | **CONFIRMADA (escenario-dependiente)** | En S4 la conversión ocurre y es medible: `duration ≈ sync` para React y supera a Angular desde 500 (Δ −10,6 → −21,8, reproducible en 5 datasets). En S2 NO ocurre a favor de React: su commit síncrono queda por debajo del commit diferido de Angular (+5,6 a +10 ms). Ninguna cruza 100 ms. |
| **H38 — Umbral incremental vs S1**           | **CONFIRMADA**                         | S1 cruza 100 ms entre 300-600 (600: 105,4/124,1); S2/S4 no cruzan (mediana) en 300-2000 (S4 máx 78,1; p95 89,7). Interpolado, S4 cruzaría ~2 650 (React) / ~4 000 (Angular) — mucho después que S1 (~450-555).                                                                                |
| **H39 — Ausencia de cambio de régimen**      | **CONFIRMADA (en el rango 300-2000)**  | Crecimiento ~lineal en el resultado filtrado (sublineal en el dataset; ms/fila de resultado decreciente o estable); sin discontinuidad ni tramo superlineal en ningún segmento.                                                                                                               |
| **H40 — Aislamiento**                        | **CONFIRMADA**                         | 0 mutaciones fuera de la sección activa en las 24 celdas (6 datasets × 2 escenarios × 2 apps).                                                                                                                                                                                                |

## 19. Conclusión

**Las actualizaciones incrementales son un régimen de coste distinto al montaje.** Mientras S1 (montar la vista completa) cruza 100 ms entre 300 y 600 tareas, los filtros S2/S4 permanecen muy por debajo incluso a 2000 (máx. 78,1 ms React en S4; p95 89,7). El coste del montaje es proporcional al **árbol completo** (decenas de miles de nodos); el de las actualizaciones incrementales es proporcional al **resultado filtrado** (React) o se **coalesce** (Angular).

La asimetría de estado de la Fase 7/9 se confirma y se cuantifica a escala: el trabajo síncrono de React crece con las filas (hasta ~78 ms en S4 a 2000) y **sí** se convierte en duración de commit, haciendo a React más lento que Angular en S4 desde 500 tareas (−10,6 a −21,8 ms). En S2 la dirección se invierte: el commit diferido de Angular hace su duración mayor (+5,6 a +10 ms), aunque su trabajo interno sigue siendo ~0,2 ms.

En ningún caso se alcanza una degradación perceptible (≥100 ms) dentro del rango práctico del navegador: el umbral de las actualizaciones incrementales está fuera del rango medido (interpolado ~2 650+ para el peor caso, S4 React), 4-6× después del umbral del montaje. El aislamiento (H40) permanece perfecto y no aparece ningún cambio de régimen.

## 20. Qué NO podemos afirmar

- Que "React es más lento" en general: lo es en S4 (duración de commit) desde 500, pero es más rápido en S2; y en ambos casos todo está por debajo de 100 ms.
- Que "Angular es más rápido": su ventaja es el commit diferido/coalescido en S4; en S2 su duración medida es mayor.
- El cruce exacto de 100 ms de S2/S4: no se alcanzó en el rango; la interpolación (~2 650 / ~4 000) es una inferencia.
- Que la diferencia de sync "siempre" se convierte en latencia: en S2 no se convierte en desventaja de React.
- Comportamiento más allá de 2000 tareas o en dispositivos/redes reales.

## 21. Siguiente experimento recomendado

1. **Escalar S4 hasta su cruce real** (2 500-4 000 tareas): localizar empíricamente el umbral de 100 ms de las actualizaciones combinadas y confirmar o corregir la interpolación — es la única cuestión cuantitativa pendiente de esta fase.
2. **Montaje + interacción combinados en una sesión** (S1 → S4 con el mismo dataset grande): el escenario real de "entrar a una lista grande y filtrarla", que acumula el coste de ambos regímenes (el montaje ya cruza el umbral a 600).
3. **Lighthouse user flows** sobre S2/S4 con datasets 1000-2000 para triangular estas métricas de laboratorio con métricas de campo (reutilizando el headless-shell desbloqueado).
