# Fase 9 — Escalabilidad de rendimiento bajo carga (interacción)

> Estado: **completado** · Experimentos: 540 interacciones medidas (9 escenarios × 3 niveles × 2 frameworks × 10 iteraciones) + 6 sesiones de validación de dataset · Sin long tasks en ninguna medición.

## 1. Objetivo

Determinar si la equivalencia de rendimiento percibido observada en la **Fase 7** (React vs Angular, mismo contrato funcional, dataset de 30 tareas) se mantiene cuando:

1. el volumen de datos renderizados crece de forma controlada (30 → 100 → 300 tareas);
2. el número de features montadas simultáneamente aumenta (las 10 features de catálogo de la Fase 8 están montadas: 16 áreas de navegación en total);
3. el trabajo de actualización provocado por búsquedas, filtros y cambios combinados se intensifica.

La pregunta experimental: **"¿React y Angular escalan de forma similar en rendimiento de interacción cuando crece el dataset, o aparece una divergencia medible?"**

Esta fase NO busca declarar un ganador. Busca medir dónde y cuándo divergen los trade-offs ya conocidos (trabajo síncrono, coalescencia, construcción DOM incremental) bajo carga.

## 2. Hipótesis H27–H30

| ID      | Hipótesis                                                                                                                                               | Métrica principal                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **H27** | La latencia percibida seguirá siendo comparable entre React y Angular al aumentar el dataset, sin aparición de long tasks significativas.               | settle time (duration) por escenario; long tasks          |
| **H28** | La diferencia de trabajo síncrono observada en Fase 7 (React > Angular) **crecerá** con el tamaño del dataset.                                          | sync (trabajo síncrono del evento)                        |
| **H29** | Aunque aumente el número de features montadas, una interacción localizada seguirá sin producir actualizaciones observables en features no relacionadas. | mutaciones DOM fuera de la sección activa (outsideActive) |
| **H30** | Ningún framework mostrará una degradación desproporcionada o un umbral abrupto dentro del rango experimental (30–300).                                  | curvas de settle por nivel; inspección de umbrales        |

Todas las hipótesis se formularon **antes** de ejecutar la medición y podían quedar CONFIRMADA / REFUTADA / NO CONCLUYENTE.

## 3. Diseño experimental

**Escalera de datos** (misma aplicación, mismo build de producción, dataset controlado por URL):

| Nivel | Tareas | Fuente                                   |
| ----- | ------ | ---------------------------------------- |
| L0    | 30     | fixture canónico (idéntico al de Fase 7) |
| L1    | 100    | fixture + 70 generadas                   |
| L2    | 300    | fixture + 270 generadas                  |

**Dataset generado** (`packages/domain/src/scale-dataset.ts`, módulo experimental del dominio, regla determinista documentada): ids `task-031..task-330`, títulos `"Incident report N"` (contienen "incident", el término de búsqueda de Fase 7), status ciclando `todo/in-progress/completed/cancelled`, prioridad ciclando `medium/high/low`, asignado ciclando `user-001..008` + `null`, proyecto ciclando `project-001..005` (project-006 permanece sin tareas: estado vacío intacto), timestamps deterministas.

**Mismo dataset en ambos frameworks**: las dos apps consumen el mismo módulo de dominio y leen el mismo `?dataset=N` en sus adapters (React: `adapters/domain-adapter.ts`; Angular: `domain/domain-data.adapter.ts`). La validación previa (sección 5) confirma recuentos idénticos.

**Características del experimento**:

- Copia aislada `/tmp/lab-phase9` (clon APFS de la copia de Fase 8 con las 10 features de catálogo montadas, 16 áreas de navegación). El árbol principal NO se modifica.
- Builds de producción idénticos para ambos frameworks; un solo build por framework sirve los 3 niveles (el dataset se resuelve en runtime por query param).
- Mismo harness que Fase 7 (CDP sobre chrome-headless-shell), una sesión de navegador por (escenario, nivel, app).
- 2 warm-ups + 10 iteraciones medidas por celda; mediana + min/max/p90/p95 + desviación.

## 4. Entorno

| Variable           | Valor                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Máquina            | local (macOS, `darwin-arm64`), CPU/memoria registrados en el JSON                                                                         |
| Node               | v25.3.0                                                                                                                                   |
| Navegador          | chrome-headless-shell (Chrome for Testing) `HeadlessChrome/151.0.7922.34` — el único headless funcional en este entorno (Fases 4.1/5.1/7) |
| Copia experimental | `/tmp/lab-phase9` (HEAD `cc11abf` = c6 de Fase 8; baseline `367f089`)                                                                     |
| Servidores         | estáticos Node http equivalentes (misma implementación para ambos frameworks), localhost sin red                                          |
| Viewport           | 1280×800, deviceScaleFactor 1                                                                                                             |

## 5. Datasets

Validación automática previa a la medición (una sesión por nivel y app): el recuento inicial de filas y los recuentos tras búsqueda/filtros deben coincidir con los valores esperados derivados de la regla de generación.

| Nivel | total | búsqueda "incident" | filtro in-progress | combinado | React = Angular |
| ----- | ----- | ------------------: | -----------------: | --------: | --------------: |
| L0    | 30    |                   4 |                  7 |         0 |     ✅ idéntico |
| L1    | 100   |                  74 |                 25 |         6 |     ✅ idéntico |
| L2    | 300   |                 274 |                 75 |        23 |     ✅ idéntico |

Los recuentos esperados se confirman exactamente en ambos frameworks (checks 10/10 en todas las celdas de medición). El dataset de L0 reproduce las condiciones de Fase 7.

## 6. Escenarios

Reutilización de la metodología Fase 7 (mismos ids/classes/labels del contrato → el mismo driver ejecuta en ambos frameworks). Checks dependientes del nivel (recuentos exactos) para los escenarios de filtro.

| ID             | Escenario                                                                            | Área del contrato       |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| S1-nav         | Navegación Projects → Tasks (monta la vista más pesada: renderiza la lista completa) | NAV-1                   |
| S2-search      | Búsqueda live "incident"                                                             | TSK-LIST search         |
| S3-status      | Filtro de estado in-progress                                                         | TSK-LIST filter         |
| S4-combined    | Búsqueda + estado + prioridad en un solo lote                                        | TSK-LIST combinado      |
| S5-settings    | Toggle "Show completed tasks"                                                        | SET-1..4                |
| S6-assign      | Reasignación de asignado (mutación de dominio)                                       | TSK-ASSIGN              |
| S7a/S7b        | Formulario de proyecto: input y submit inválido                                      | PRJ-CREATE              |
| S8-nav-catalog | Navegación a una feature de catálogo Fase 8 (Milestones)                             | NAV + features montadas |

**Prioridad**: S2 y S4 son los escenarios donde el tamaño del dataset afecta más (filtrado de 274/300 filas en L2); ambos se ejecutan completos.

## 7. Metodología

- Mismo protocolo de Fase 7: `evento → 2 rAF + macrotask → settle (duration)`; +80 ms de flush para PerformanceEventTiming; CDP `Performance.getMetrics` (solo `JSHeapUsedSize` y `Nodes` como informativas — `ScriptDuration`/`TaskDuration` no fiables en este headless-shell, verificado en Fase 7).
- `sync`: duración del dispatch síncrono (handler + scheduling). Verificado en Fase 7: ambos frameworks difieren el commit del DOM fuera del `click()`, así que `sync` tiene semántica comparable (no mide el render).
- Resets deterministas: en los escenarios de filtro, tras el reset se espera hasta que la lista vuelve al tamaño del dataset (poll + confirmación estable).
- **Sonda de aislamiento (H29)**: el MutationObserver clasifica cada registro según si su target está dentro de la sección activa (`main section[aria-label]`). Se captura una referencia de la sección al inicio de cada iteración medida para no clasificar mal los subárboles desmontados (p. ej. React intercambiando `<ul>` por el estado vacío); los targets desconectados se cuentan conservadoramente como "dentro" (sesgo hacia 0, documentado en limitaciones).
- Heurística de forma de crecimiento (documentada, no estadística formal): ratios r1 = L1/L0 y r2 = L2/L1 de medianas positivas; |r2−r1| ≤ 0,25 → lineal; r2 < r1−0,25 → sublineal; r2 > r1+0,25 → superlineal; si no → inconcluyente.

## 8. Métricas

Por celda (escenario × nivel × framework): `duration` (settle, ms), `sync` (ms), `mutations` (registros/nodos/atributos del MutationObserver), `isolation.outsideMain/outsideActive`, `longTaskCount/longTaskMs`, `heapDeltaKb` (informativa), `nodesDelta` (informativa), `checksPassed`. Estadísticos: n, mediana, min, max, p90, p95, desviación estándar, primera/segunda mitad (estabilidad).

## 9. Resultados crudos

Los resultados completos por iteración están en `docs/experiments/results/interaction-scalability-phase9.json`. Resumen por celda (mediana; min–max; p95 entre paréntesis):

### S1-nav — montar la vista más pesada (renderiza toda la lista)

| Nivel | settle React     |   settle Angular | Δ (A−R) | sync R/A |  muts R/A |    nodesΔ R/A |
| ----- | ---------------- | ---------------: | ------: | -------: | --------: | ------------: |
| L0    | 15,9 (14–17,8)   | 17,7 (12,8–22,2) |    +1,8 |  0,2/0,2 |  6 / 1170 |   2749 / 2798 |
| L1    | 35,5 (30,6–37,7) | 40,2 (34,4–42,2) |    +4,7 |  0,3/0,1 |  6 / 3868 |   8915 / 9066 |
| L2    | 67,0 (49,1–70,4) | 75,8 (63,9–86,7) |    +8,8 |  0,2/0,2 | 6 / 11568 | 26515 / 26966 |

### S2-search — búsqueda live

| Nivel | settle React | settle Angular | Δ | sync R/A | muts R/A | heap R/A (kB) |
|---|---|---:|---:|---:|---:|---:|---:|
| L0 | 8,1 | 7,0 | −1,1 | 2,4/0,2 | 34/27 | 99/25 |
| L1 | 8,6 | 10,3 | +1,7 | 4,1/0,2 | 34/27 | 263/38 |
| L2 | 17,4 (14,4–19,6) | 15,0 (12,5–16,7) | −2,4 | 9,3/0,2 | 34/27 | 738/86 |

### S3-status — filtro de estado

| Nivel | settle React | settle Angular | Δ | sync R/A | muts R/A |
|---|---|---:|---:|---:|---:|---:|
| L0 | 8,2 | 7,2 | −1,0 | 2,1/0,1 | 27/24 |
| L1 | 8,9 | 9,1 | +0,2 | 4,2/0,3 | 79/76 |
| L2 | 16,5 (12,4–17,5) | 14,6 (8,5–17,1) | −1,9 | 12,1/0,1 | 229/226 |

### S4-combined — búsqueda + estado + prioridad

| Nivel | settle React | settle Angular | Δ | sync R/A | muts R/A | heap R/A (kB) |
|---|---|---:|---:|---:|---:|---:|---:|
| L0 | 6,5 | 6,5 | 0,0 | 3,2/0,3 | 43/4 | 126/23 |
| L1 | 11,5 | 8,3 | −3,2 | 8,8/0,3 | 110/95 | 704/98 |
| L2 | 21,4 (9,6–23,2) | 14,2 (12,9–17,4) | −7,2 | 18,5/0,2 | 293/278 | 2361/291 |

### S5-settings · S6-assign · S7a/b · S8 (independientes del dataset)

| Escenario       | settle L0 R/A | settle L2 R/A | Δ L0→L2 R/A | sync R/A en L2 |
| --------------- | ------------- | ------------: | ----------: | -------------: |
| S5-settings     | 12,8/12,7     |     12,5/12,5 |   −0,3/−0,2 |        0,7/0,2 |
| S6-assign       | 12,2/12,3     |     13,2/12,9 |   +1,0/+0,6 |        7,9/0,2 |
| S7a-form-input  | 9,8/8,6       |      9,6/10,5 |   −0,2/+1,9 |        0,2/0,1 |
| S7b-form-submit | 9,3/8,8       |      8,9/10,0 |   −0,4/+1,2 |        0,2/0,2 |
| S8-nav-catalog  | 12,9/13,1     |     11,9/13,2 |   −1,0/+0,1 |        0,3/0,2 |

**Long tasks**: **0** en las 540 interacciones medidas (y en las sesiones de validación).

## 10. Resultados agregados

Media de medianas por nivel (informativa; enmascara la direccionalidad por escenario):

| Métrica     |      L0 R/A |      L1 R/A |          L2 R/A |
| ----------- | ----------: | ----------: | --------------: |
| settle (ms) | 10,2 / 11,0 | 13,5 / 13,8 | **19,8 / 19,9** |
| sync (ms)   |  1,3 / 0,23 |  2,6 / 0,22 |  **5,5 / 0,18** |
| long tasks  |       0 / 0 |       0 / 0 |           0 / 0 |

La **latencia percibida agregada es prácticamente idéntica** en los tres niveles (diferencia ≤ 0,8 ms). El **trabajo síncrono** crece ~4× en React (1,3 → 5,5 ms) mientras Angular permanece plano (~0,2 ms) → en L2 React hace ~30× más trabajo síncrono agregado.

## 11. Curvas de escalabilidad

Formas (heurística documentada; ver §7) sobre medianas de settle:

| Escenario   | React (Δ L0→L2)      | Angular (Δ L0→L2)    |
| ----------- | -------------------- | -------------------- |
| S1-nav      | sublineal (+51,1 ms) | sublineal (+58,1 ms) |
| S2-search   | superlineal (+9,3)   | lineal (+8,0)        |
| S3-status   | superlineal (+8,3)   | superlineal (+7,4)   |
| S4-combined | lineal (+14,9)       | superlineal (+7,7)   |
| S5/S6/S7/S8 | lineal (≈0 a +1)     | lineal (≈0 a +1,9)   |

Observaciones:

- **S1 es el único escenario con crecimiento material** (~4× de L0 a L2 en ambos) porque monta la vista completa (renderiza la lista entera). Su pendiente es la mayor; a 300 tareas llega a 67/76 ms de mediana (p95 70/87), todavía por debajo del umbral perceptible de 100 ms.
- Los filtros (S2/S3/S4) crecen ~2–3× de L0 a L2; la clasificación lineal/superlineal es sensible al ruido entre ejecuciones (ver §15) — la señal robusta es "crece de forma aproximadamente proporcional al número de filas resultantes, sin umbral abrupto".
- S5/S6/S7/S8 son planos: el coste de estas interacciones no depende del dataset (S6: el settle no crece aunque el `sync` de React sí, porque el commit se difiere).

## 12. Comparación React vs Angular

**Latencia percibida (settle)** — equivalente en L0/L1 (Δ ≤ 3 ms en todos los escenarios). En L2 aparece direccionalidad por tipo de escenario:

- **Angular más lento**: S1-nav (−8,8 ms en L2, único caso que supera ~20 ms).
- **React más lento**: S2-search (+2,4), S3-status (+1,9), S4-combined (+7,2) — los escenarios de filtrado con muchas filas resultantes.
- **Empate**: S5, S6, S7a/b, S8 (Δ ≤ 2 ms).

**Trabajo síncrono (sync)** — la brecha de Fase 7 **crece con el dataset** (H28): en S4-L2, React 18,5 ms vs Angular 0,2 ms (~90×). En S2/S3/S6 el `sync` de React escala con el dataset (2→9, 2→12, 2→8 ms) mientras Angular permanece ≤ 0,4 ms. Esta brecha NO se traduce 1:1 en latencia percibida porque el commit se difiere en ambos frameworks, pero en S4-L2 sí se refleja parcialmente (−7,2 ms).

**Trabajo de DOM (mutations)** — similar en S2/S3/S4-L1/L2 (React 229/293 vs Angular 226/278 registros). En S4-L0 Angular coalesce los 3 cambios en 1 pase de CD (4 registros vs 43 de React); a L1/L2 el pase único toca tantos nodos como los ~3 renders de React (95/278 vs 110/293). En S1, Angular genera 1170→11568 registros (construcción DOM incremental) vs 6 de React (inserción por subárbol) — artefacto de estrategia de inserción ya documentado en Fase 7, sin impacto proporcional en settle.

**Heap por interacción** — React crece ~2–8× más que Angular en los escenarios de lista (S2-L2: 738 vs 86 kB; S4-L2: 2361 vs 291 kB). Informativo; sin impacto en latencia percibida.

## 13. Análisis de long tasks

**0 long tasks** en las 540 interacciones medidas (PerformanceObserver `longtask`, umbral 50 ms). Incluso el caso más caro (S1-L2, settle 67/76 ms) no produce una long task: el trabajo se reparte en tareas < 50 ms. La hipótesis de "degradación perceptible" (bloqueos de hilo principal > 50 ms) no se observa en el rango 30–300.

## 14. Análisis de aislamiento (H29)

Métricas de la sonda (mutaciones con target fuera de la sección activa):

| Escenario                            | outsideActive L0 R/A |    L1 R/A |    L2 R/A |
| ------------------------------------ | -------------------: | --------: | --------: |
| S2–S7 (actualizaciones de contenido) |            **0 / 0** | **0 / 0** | **0 / 0** |
| S1-nav / S8-nav                      |             6 / 1170 |  6 / 3868 | 6 / 11568 |

- En los escenarios de **actualización localizada** (búsqueda, filtros, toggle, asignación, formularios), **cero mutaciones fuera de la sección activa en ambos frameworks y en los tres niveles**: ninguna interacción toca el DOM de features no relacionadas (que ni siquiera están montadas — navegación por estado, NAV-1).
- En la **navegación** (S1/S8), la sección activa se reemplaza por diseño: las mutaciones "fuera" de la sección anterior son el trabajo legítimo de construir la nueva sección (React 6 registros: aria-current + inserción del subárbol; Angular creciente: construcción incremental). No son actualizaciones en features no relacionadas.
- Aislamiento estático: 0 imports entre features en los 16 áreas (verificado en Fase 8); sin dependencias nuevas; ADR-001/ADR-002 intactos.

## 15. Amenazas a la validez

1. **Mediciones en localhost sin throttling**: no representan condiciones de campo (CPU lenta, red, competencia).
2. **Cuantización por frame**: `duration` se mide hasta la siguiente pintura (2 rAF) y está cuantizado por el frame del headless-shell; medianas de 6–20 ms pueden saltar un frame entre ejecuciones. Por eso se reportan mediana + rango + p95, y las diferencias < ~3 ms se tratan como ruido.
3. **Variabilidad entre ejecuciones**: el settle de los escenarios de contenido (S2–S4) varió entre la ejecución rápida y las dos completas (p. ej. S2-L2 React 13,9–17,8 ms); las direcciones (React ≥ Angular en L2 para filtros; React < Angular en S1) fueron estables en las 3 ejecuciones.
4. **`sync` no mide el render**: verificado en Fase 7 que ambos frameworks difieren el commit; `sync` captura handler + scheduling.
5. **MutationObserver añade overhead** simétrico y cuenta atributos/caracteres, no solo nodos.
6. **CDP `Performance.getMetrics` poco fiable** en este headless-shell (`ScriptDuration` en 0); solo `JSHeapUsedSize`/`Nodes` como informativas.
7. **Heurística de forma de crecimiento**: clasificación lineal/sublineal/superlineal sobre 3 puntos, sensible a ruido; no es un ajuste estadístico.
8. **Sonda de aislamiento**: proxy de mutaciones DOM; no detecta renders internos sin mutación; los targets desconectados se cuentan conservadoramente como dentro (sesgo hacia 0).
9. **Comparación entre fases no válida**: los valores absolutos de Fase 7 difieren de L0 de esta fase (estado de máquina, frame); solo las comparaciones dentro de esta fase (L0→L1→L2) y sus direcciones son señal.
10. **Una máquina local**: resultados indicativos, no benchmark científico (metrics.md §1).

## 16. Resultados inesperados

1. **El caso más caro es la navegación, no el filtrado**: S1 (montar Tasks con la lista completa) escala ~4× (15,9→67,0 ms React; 17,7→75,8 Angular) mientras los filtros quedan ≤ 21 ms. La construcción inicial del árbol domina el coste de interacción.
2. **La brecha de `sync` de React no se traduce proporcionalmente en latencia**: en S3-L2 React hace 12,1 ms de trabajo síncrono pero el settle es 16,5 ms (solo ~4 ms más que Angular), porque el render se difiere fuera del evento.
3. **La coalescencia de Angular se diluye con el dataset**: en S4-L0 Angular hace 4 registros de mutación (3 cambios → 1 pase de CD) vs 43 de React; en L2 los registros convergen (278 vs 293) porque el pase único toca tantos nodos como las ~3 reconciliaciones de React.
4. **El heap de React crece ~8× más que el de Angular en filtros** (S4-L2: 2361 vs 291 kB) sin impacto medible en latencia — el coste es de asignación, no de bloqueo.
5. **`sync` de S6 crece con el dataset aunque el settle no**: reasignar un asignado re-renderiza la lista completa en React (sync 2,2→7,9 ms), pero el commit diferido mantiene el settle plano (~13 ms).

## 17. Veredictos

| Hipótesis                                    | Veredicto                           | Evidencia                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H27 — Latencia bajo carga**                | **CONFIRMADA (matizada)**           | 0 long tasks en 540 interacciones; settle agregado L2: 19,8 vs 19,9 ms (Δ 0,1). Deltas por escenario en L2 ≤ ~9 ms y direccionales: Angular +8,8 ms en S1; React +2,4/+1,9/+7,2 ms en S2/S3/S4. Ningún cruce del umbral perceptible (~100 ms) salvo S1-L2 (67/76 ms, aún por debajo). |
| **H28 — Escalabilidad del trabajo síncrono** | **CONFIRMADA**                      | La brecha crece con el dataset: sync agregado React 1,3→2,6→5,5 ms vs Angular 0,23→0,22→0,18 ms. En S4-L2: 18,5 vs 0,2 ms (~90×). React escala con las filas; Angular es plano.                                                                                                       |
| **H29 — Actualización localizada**           | **CONFIRMADA**                      | 0 mutaciones fuera de la sección activa en S2–S7, los 3 niveles, ambos frameworks. Las únicas mutaciones "fuera" ocurren en navegación (S1/S8), que reemplaza la sección por diseño (React 6 registros; Angular creciente por construcción incremental). 0 imports entre features.    |
| **H30 — Degradación**                        | **CONFIRMADA (en el rango 30–300)** | Crecimiento suave sin umbral abrupto en ningún escenario; el mayor salto relativo es S1 (~4×) con p95 máx. 86,7 ms. **NO CONCLUYENTE más allá de 300 elementos** (la pendiente de S1 sugiere que ~1000+ tareas cruzaría 100 ms).                                                      |

## 18. Conclusiones

1. **La equivalencia de latencia percibida de Fase 7 se mantiene hasta 300 tareas con 16 features montadas**: el settle agregado es 19,8 vs 19,9 ms en L2 y no aparece ninguna long task. La carga de datos NO convierte la diferencia de trabajo síncrono en degradación perceptible en este rango.
2. **La única divergencia que crece es el trabajo síncrono de React** (H28), que escala con las filas procesadas (búsquedas, filtros, reasignación) mientras Angular permanece plano por su diferimiento/coalescencia. Es la métrica donde la Fase 9 encuentra un crecimiento real y cuantificado de la brecha conocida de Fase 7.
3. **La direccionalidad de la latencia depende del tipo de escenario**: React es más rápido montando la vista grande (S1: −8,8 ms en L2); Angular es más rápido en filtros combinados (S4: +7,2 ms a favor). Ninguna dirección es global.
4. **La construcción DOM incremental de Angular (1170→11568 registros en S1) no se traduce en un coste proporcional de latencia** (Δ ≤ 8,8 ms): la estrategia de inserción difiere, el resultado percibido casi no.
5. **El aislamiento se mantiene perfecto bajo crecimiento**: 0 mutaciones fuera de la sección en actualizaciones localizadas; las features no relacionadas no se ven afectadas por ninguna interacción.
6. **El cuello de botella de interacción del laboratorio es la construcción inicial de la vista más grande** (S1), no las actualizaciones incrementales — y es común a ambos frameworks.

## 19. Qué NO podemos afirmar

- Que "React degrada antes que Angular" o viceversa como afirmación global: la direccionalidad depende del escenario (S1 vs S2–S4) y las diferencias están dentro de ~1–2 frames.
- Que la brecha de trabajo síncrono de React implique necesariamente peor UX: en este rango no produce long tasks ni cruza el umbral perceptible.
- Que los resultados se mantengan más allá de 300 tareas: la pendiente de S1 sugiere que el cruce del umbral de 100 ms ocurriría antes en Angular (75,8 vs 67,0 ms en L2) y en ambos con datasets ~10× mayores, pero no se ha medido.
- Que estas métricas representen condiciones de campo (CPU real, red, throttling, dispositivos móviles).
- Que "más mutaciones DOM" o "más heap" sean equivalentes a peor rendimiento: son proxies de trabajo, no de latencia.

## 20. Siguiente experimento recomendado

1. **Escalado del dataset en la interacción más pesada (S1)**: repetir el montaje de la vista completa con 1000–3000 tareas para localizar empíricamente el umbral de 100 ms y confirmar si la brecha S1 crece linealmente (React) vs superlinealmente (Angular). Es el único escenario con pendiente material.
2. **Lighthouse user flows sobre los escenarios S2/S4** reutilizando el desbloqueo de chrome-headless-shell (Fase 5.9), para triangular latencia percibida con métricas de campo.
3. **Fase 8 × Fase 9 cruzadas**: una feature de catálogo con dataset escalado (p. ej. Milestones con 300 ítems) para medir si el patrón de feature repetible de Fase 8 escala igual que el core de Tasks.

---

**Reproducibilidad**: `node scripts/measure-interaction-scalability-phase9.mjs /tmp/lab-phase9` (builds de producción + 54 sesiones de medición + 6 de validación; `--quick` para una pasada de 2 escenarios × 3 iteraciones). La copia experimental `/tmp/lab-phase9` se reconstruye con `cp -cR /tmp/lab-phase8 /tmp/lab-phase9` + módulo `scale-dataset.ts` + hook en los adapters (documentado en el JSON: commits `367f089` baseline / `cc11abf` HEAD).
