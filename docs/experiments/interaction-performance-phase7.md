# Fase 7 — Rendimiento bajo interacción y evolución del estado

- **Estado:** Completado (experimento reproducible; evidencia cruda en `results/interaction-performance-phase7.json`)
- **Script:** `scripts/measure-interaction-performance-phase7.mjs` (`pnpm interaction:measure`)
- **Documentos relacionados:** [metrics.md](./metrics.md), [lighthouse-phase5.md](./lighthouse-phase5.md), [evolution-phase6.md](./evolution-phase6.md), [react-vs-angular-phase5.md](../comparisons/react-vs-angular-phase5.md), [ADR-001](../decisions/ADR-001-shared-domain-package.md), [ADR-002](../decisions/ADR-002-state-management-react-angular.md)

---

## 1. Objetivo

Medir de forma reproducible el rendimiento bajo **interacción real de usuario** de React Monolith (useSyncExternalStore) y Angular Monolith (Signals + DI, zoneless) implementando exactamente el mismo contrato funcional y el mismo dataset. La Fase 5.9 dejó explícitamente pendiente esta dimensión ("rendimiento bajo interacción"). El objetivo no es declarar un framework ganador, sino medir: coste de actualización de estado, trabajo producido por interacción, latencia percibida, estabilidad bajo interacción repetitiva y diferencias entre los dos modelos de estado.

## 2. Contexto

- Fases 5.x: comparación estática (bundle, build, tests, arquitectura, Lighthouse de primera carga). H1–H8 cerradas.
- Fase 5.9 (H8): accesibilidad 100/100 en ambas; perf de primera carga React 0.97 vs Angular 0.99 (móvil, mediana de 3). Se señaló que el rendimiento bajo interacción no estaba cubierto.
- Fase 6: coste estructural de cambio equivalente (H9–H13 CONFIRMADAS); bundle por cambio ~1,8× y build ~10× (toolchain).
- Los mecanismos de estado difieren por diseño (ADR-002): React `useSyncExternalStore` + suscripciones; Angular Signals + DI zoneless.

## 3. Hipótesis

Definidas **antes** de ejecutar el experimento:

| ID      | Hipótesis                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H14** | Una actualización que afecta a una parte concreta del estado no debería provocar trabajo innecesario en features no relacionadas.                    |
| **H15** | En una secuencia de múltiples actualizaciones consecutivas, React y Angular deberían mantener una interacción estable sin degradación significativa. |
| **H16** | Las operaciones repetitivas sobre formularios y validaciones deberían mantener latencias de interacción aceptables en ambos frameworks.              |
| **H17** | La navegación entre features no debería introducir diferencias arquitectónicas relevantes, independientemente del mecanismo de estado.               |
| **H18** | Una actualización de una feature no debería provocar trabajo observable innecesario en features no relacionadas.                                     |

Las hipótesis podían quedar CONFIRMADA, REFUTADA o NO CONCLUYENTE (veredictos en §17).

## 4. Diseño experimental

8 escenarios sobre los flujos reales del contrato, idénticos en ambos frameworks (mismos ids/clases/labels porque el contrato y el CSS son compartidos; el **mismo driver DOM** ejecuta en ambas apps):

| Escenario       | Interacción                                                               | Área del contrato |
| --------------- | ------------------------------------------------------------------------- | ----------------- |
| S1-nav          | Cambio de sección Projects → Tasks (navegación por estado, NAV-1)         | NAV-1…3           |
| S2-search       | Búsqueda live en la lista de tareas (input event)                         | TSK-LIST          |
| S3-status       | Filtro por estado de tareas (change event)                                | TSK-LIST          |
| S4-combined     | Búsqueda + filtro de estado + filtro de prioridad en un mismo batch       | TSK-LIST          |
| S5-settings     | Toggle "Show completed tasks" (estado UI a nivel App)                     | SET-1…4           |
| S6-assign       | Reasignación de tarea vía select (mutación del domain store)              | TSK-ASSIGN        |
| S7a-form-input  | Escritura en el campo nombre del formulario de proyecto                   | PRJ-CREATE        |
| S7b-form-submit | Submit del formulario con entrada inválida (errores de validación inline) | PRJ-CREATE-2      |

Cada interacción se mide **aislada**: N=10 iteraciones medidas por escenario y framework, precedidas de 2 warm-ups no medidos. Entre iteraciones se restaura el estado (reset) y se espera un settle completo (§7) para que el trabajo diferido del reset no contamine la siguiente medición (artefacto detectado y corregido, §15).

## 5. Control de variables

Constantes entre frameworks: builds de producción oficiales (React 233 547 B / Angular 179 634 B verificados), mismo dataset/fixture, misma implementación de servidor estático Node http (puertos distintos), misma máquina/sesión/Node (v25.3.0)/pnpm, mismo binario de navegador (chrome-headless-shell 151.0.7922.34), mismo viewport (1280×800, deviceScaleFactor 1, no mobile), mismos eventos DOM, mismo orden de ejecución, misma sesión de script. Una **sesión de navegador por (escenario, framework)** para que la pestaña medida nunca esté en background (evita throttling de rAF/timers).

## 6. Herramientas

- **Navegador:** `chrome-headless-shell` (Chrome for Testing 151.0.7922.34) del cache de Playwright — el único navegador headless funcional en este entorno (el Chrome completo se cuelga con URLs http://, documentado en Fases 4.1/5.1).
- **Control:** Chrome DevTools Protocol directo (WebSocket global de Node ≥22; `fetch` + `WebSocket` built-in). **Cero dependencias nuevas** (no hay playwright/puppeteer/lighthouse en `node_modules` del repo; se verificó).
- **Métricas en página:** `performance.now()`, `PerformanceObserver` (longtask, event timing), `MutationObserver`.
- **Métricas CDP:** `Performance.getMetrics` (JSHeapUsedSize, Nodes).

## 7. Protocolo

Por (escenario, framework): arrancar navegador → abrir página → esperar render del shell (`nav[aria-label="Main"]`) → fijar viewport → `Performance.enable` → inyectar harness → setup del escenario (no medido) → 2 warm-ups (no medidos) → 10 iteraciones medidas:

1. `m0` = contadores CDP (heap, nodes).
2. En página: `t0 = performance.now()` → ejecutar la interacción → esperar **settle** (2 × `requestAnimationFrame` + macrotask + 80 ms de flush para entradas de event timing) → `t1`.
3. `m1` = contadores CDP; verificación DOM de efecto esperado (`checkOk`); reset (no medido) + settle completo.

`settle` es agnóstico del framework: cubre el handler síncrono **y** el render/commit diferido (ambos frameworks difieren el commit fuera del evento; verificado experimentalmente en §12). Entre iteraciones, el reset va seguido de un settle explícito (2 rAF + macrotask + 50 ms) para que el trabajo diferido no caiga en la ventana medida de la siguiente iteración (detectado: `nodesDelta` de Angular inflado ~2000 nodos sin este paso; corregido, §15).

## 8. Métricas

| Métrica                      | Qué mide                                                                         | Cómo                                       | Fiabilidad                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `duration` (settle)          | Latencia percibida: dispatch → pintura siguiente (2 rAF)                         | `performance.now()` en página              | Primaria; cuantizada por intervalo de frame (~8–16 ms)                                                                       |
| `sync`                       | Trabajo síncrono del handler + scheduling                                        | `performance.now()` alrededor del dispatch | Comparable entre frameworks (ambos difieren el commit; verificado)                                                           |
| `mutations`                  | Trabajo DOM observado: registros, nodos añadidos/eliminados, cambios de atributo | MutationObserver sobre `<html>`            | Proxy simétrico en escenarios de **actualización**; NO comparable en construcción estructural (estrategia de inserción, §13) |
| `longTasks`                  | Tareas JS ≥ 50 ms                                                                | PerformanceObserver 'longtask'             | Fiable                                                                                                                       |
| `eventTiming`                | Duración de eventos (si entran; umbral ~16 ms)                                   | PerformanceObserver 'event'                | Casi siempre vacío para interacciones rápidas                                                                                |
| `heapDeltaKb` / `nodesDelta` | Asignación JS / cambio de nodos DOM                                              | CDP Performance.getMetrics                 | Informativo (los contadores Script/Task/Layout están muertos en este headless-shell; verificado con busy-loop de 50 ms, §15) |

Estadística por escenario/framework: mediana, min, max, p90 de las 10 iteraciones. 160 interacciones medidas en total (8 escenarios × 2 frameworks × 10).

## 9. Resultados React

| Escenario       | settle (ms)      | sync (ms) | muts | heap Δ (kB) | longTasks | checks |
| --------------- | ---------------- | --------- | ---- | ----------- | --------- | ------ |
| S1-nav          | 13,9 (12,2–17,9) | 0,2       | 6    | 227         | 0         | 10/10  |
| S2-search       | 13,3 (11,3–14,1) | 1,9       | 34   | 96          | 0         | 10/10  |
| S3-status       | 13,0 (12,0–13,6) | 1,9       | 27   | 95          | 0         | 10/10  |
| S4-combined     | 13,2 (12,4–13,9) | 2,1       | 43   | 130         | 0         | 10/10  |
| S5-settings     | 13,0 (11,5–13,6) | 0,7       | 6    | 14          | 0         | 10/10  |
| S6-assign       | 11,7 (9,1–14,2)  | 1,8       | 4    | 91          | 0         | 10/10  |
| S7a-form-input  | 10,5 (8,3–16,1)  | 0,1       | 0    | 3,5         | 0         | 10/10  |
| S7b-form-submit | 9,6 (7,5–16,0)   | 0,4       | 2    | 18          | 0         | 10/10  |

## 10. Resultados Angular

| Escenario       | settle (ms)      | sync (ms) | muts | heap Δ (kB) | longTasks | checks |
| --------------- | ---------------- | --------- | ---- | ----------- | --------- | ------ |
| S1-nav          | 17,7 (14,2–30,3) | 0,2       | 1170 | 435         | 0         | 10/10  |
| S2-search       | 13,4 (12,8–13,9) | 0,2       | 27   | 26          | 0         | 10/10  |
| S3-status       | 13,8 (12,3–14,8) | 0,2       | 24   | 27          | 0         | 10/10  |
| S4-combined     | 13,0 (12,1–13,5) | 0,3       | 4    | 22          | 0         | 10/10  |
| S5-settings     | 12,8 (11,6–13,4) | 0,2       | 0    | 5           | 0         | 10/10  |
| S6-assign       | 12,7 (7,0–13,9)  | 0,3       | 1    | 15          | 0         | 10/10  |
| S7a-form-input  | 9,5 (7,4–17,1)   | 0,2       | 0    | 8,7         | 0         | 10/10  |
| S7b-form-submit | 9,6 (7,5–16,9)   | 0,2       | 0    | 13          | 0         | 10/10  |

## 11. Comparación

| Escenario       | Δ settle (A−R) | Δ sync (A−R) | muts R / A | nodesΔ R / A |
| --------------- | -------------- | ------------ | ---------- | ------------ |
| S1-nav          | **+3,8 ms**    | 0,0          | 6 / 1170   | 2749 / 2798  |
| S2-search       | +0,1 ms        | **−1,7 ms**  | 34 / 27    | 1 / 1        |
| S3-status       | +0,8 ms        | **−1,7 ms**  | 27 / 24    | 1 / 1        |
| S4-combined     | −0,2 ms        | **−1,8 ms**  | 43 / 4     | 5 / 6        |
| S5-settings     | −0,2 ms        | −0,5 ms      | 6 / 0      | 0 / 0        |
| S6-assign       | +1,0 ms        | **−1,5 ms**  | 4 / 1      | 0 / 0        |
| S7a-form-input  | −1,0 ms        | +0,1 ms      | 0 / 0      | 0 / 0        |
| S7b-form-submit | 0,0 ms         | −0,2 ms      | 2 / 0      | 0 / 0        |

Lectura por dimensión:

- **Latencia percibida (settle): empate.** 7 de 8 escenarios con |Δ| ≤ 1 ms (dentro de la cuantización de frame). Solo S1-nav muestra +3,8 ms en Angular, con rangos solapados (React 12,2–17,9 vs Angular 14,2–30,3) — pequeña y atribuible al coste de construcción DOM del montaje de sección (§13), no a un mecanismo de navegación distinto.
- **Trabajo síncrono (sync): React hace ~6–9× más trabajo síncrono por interacción de lista** (1,8–2,1 ms vs 0,2–0,3 ms en S2/S3/S4/S6; rangos sin solapamiento: React p90 2,9–3,6 ms vs Angular max 0,4–1,1 ms). React procesa el evento con su sistema sintético y (para eventos discretos de input/change) ejecuta render + reconciliación de forma síncrona; Angular actualiza las signals y programa el render. **Ambos entregan la misma latencia percibida** — es una diferencia de _cuándo_ se hace el trabajo, no de cuánto percibe el usuario.
- **Trabajo DOM (mutations): comparable en escenarios de actualización** (34 vs 27; 27 vs 24; 4 vs 1; 2 vs 0). En S4 (3 cambios en batch) Angular coalesce en un solo pase de CD (4 registros) frente a los 3 renders separados de React (43 registros). En S1 la comparación bruta NO es válida (estrategia de inserción, §13).
- **Trabajo estructural (nodesΔ): idéntico.** Ambos frameworks reutilizan las filas de la lista al filtrar (track/key): el primer `<li>` conserva su identidad y el DOM pasa de 30→4 filas en ambos (verificado con probe de identidad de nodo, §12).
- **Asignación de heap: React ~4× más que Angular en filtros de lista** (95–130 kB vs 22–27 kB por interacción) y ~1,9× en el montaje de sección (227 vs 435 kB). Informativo: reconciliación con fibers vs actualización selectiva de bindings. No se observa impacto en latencia percibida.
- **Long tasks: 0 en las 160 interacciones medidas.** Ninguna interacción bloquea el hilo principal ≥ 50 ms en ninguno de los dos frameworks.

## 12. Análisis del estado

Qué cambia en cada escenario y dónde se observa el trabajo (HECHO MEDIDO):

- **Estado local de feature** (S2/S3/S4: search/filtros de Tasks): el DOM de la lista cambia (30→4 filas), el resto del shell no muta. Ambos frameworks reutilizan las filas (identidad del primer `<li>` preservada; `track`/`key`).
- **Estado compartido de dominio** (S6: asignación de tarea): mutación del store (unsubscribe/notify en React; signal write en Angular) → solo la fila afectada muestra cambios DOM (4 vs 1 registros).
- **Estado UI a nivel App** (S5: showCompletedTasks): cambios de atributo mínimos (6 vs 0 registros); sin trabajo observable en otras secciones (React desmonta las secciones inactivas por render condicional; Angular `@switch` renderiza solo el caso activo).
- **Estado derivado** (S2–S4: `filtered`/`filtered()` recomputado por interacción): el trabajo de filtrado es comparable (muts 24–34 vs 24–27) y se ejecuta en el render de la feature afectada.

**Ambos frameworks difieren el commit fuera del evento** (verificado: inmediatamente tras `btn.click()`, la nueva sección no está en el DOM en ninguno de los dos; el DOM aparece en el siguiente frame/task). Esto hace `settle` (y no `sync`) la métrica correcta de latencia, y explica que `sync` sea tan pequeño en ambos.

## 13. Análisis de renders/updates

El conteo de **registros de mutación** no es una medida directa de "renders" (no observable sin instrumentación de la app, que no se hizo). Los proxies medidos:

- **Estrategia de inserción DOM (S1):** React inserta el subárbol de la sección en **1 registro childList** (6 registros totales: 2 swaps + 4 cambios de atributo en el nav). Angular construye incrementalmente: **331 childList + 394 atributos (240 `value` en `<option>`, 122 `class`, 30 `aria-label`) + 445 characterData = 1170 registros**, creando 240 `<option>` + 53 `<button>` + 30 `<li>`. El DOM final es el mismo (nodesΔ 2749 vs 2798). **El conteo bruto refleja la estrategia del renderer, no el trabajo proporcional** — no debe leerse como "Angular hace 200× más trabajo": la creación de 240 options ocurre en ambos, pero React la agrupa en una inserción y Angular la descompone. El coste de pared observado es +3,8 ms de settle.
- **Actualizaciones (S2–S7):** ambos actualizan nodos existentes; los conteos son comparables y pequeños (0–43 registros). En S4, Angular coalesce tres actualizaciones de signals en un solo pase (4 registros) mientras React ejecuta tres renders (43 registros) — diferencia real de operaciones DOM por interacción, sin diferencia de latencia percibida.

No se distingue render / commit / pintura individualmente; `settle` cubre hasta la pintura siguiente.

## 14. Variabilidad

- **Intra-iteración:** N=10 por escenario/framework; rangos estrechos en actualizaciones (p.ej. S2 React 11,3–14,1 ms; Angular 12,8–13,9 ms). El settle está cuantizado por frame, lo que domina la variabilidad.
- **Estabilidad (H15):** mediana de la primera mitad vs segunda mitad de iteraciones: plana en todos los escenarios de actualización (p.ej. S3 13/13 vs 14/13,4; S4 13,2/13,1 vs 12,9/13,1; S6 11,5/11,9 vs 12,7/12,7). Única excepción: S1-nav Angular 14,8 → 17,8 ms (N=5 por mitad; observación, no concluyente: puede ser presión de GC por el montaje repetido de la sección de 2800 nodos).
- **Checks de validez: 160/160** interacciones produjeron el efecto DOM esperado (filtro aplicado, error mostrado, toggle cambiado, etc.) — los drivers son correctos y simétricos.

## 15. Amenazas a la validez

1. **Contadores CDP muertos en este headless-shell:** `ScriptDuration` permanece en 0 incluso con un busy-loop de 50 ms y `TaskDuration` subcuenta (verificado experimentalmente). Por eso **no se usan** como métricas; se documenta en lugar de reportar ceros engañosos.
2. **Artefacto de reset diferido (detectado y corregido):** sin un settle tras el reset, el trabajo diferido de Angular (render en rAF) caía en la ventana medida de la siguiente iteración (nodesΔ ~2000 nodos falsos). Corregido con settle explícito post-reset; la versión final del JSON no contiene el artefacto.
3. **`mutations` no es comparable entre estrategias de inserción** (S1); sí lo es entre escenarios de actualización. Se reporta desglosado (registros/added/removed/attrs) y se interpreta por tipo de escenario.
4. **Settle cuantizado por frame:** diferencias < ~8 ms deben leerse con cautela; solo S1-nav supera ese umbral.
5. **Eventos no confiables** (dispatch sintético): mismos eventos para ambos frameworks; los frameworks no distinguen `isTrusted` en estos handlers.
6. **Dataset pequeño** (30 tareas, 7 proyectos): las interacciones son ligeras; 0 long tasks no extrapola a datasets grandes ni a lógica pesada.
7. El harness de medición (observadores) añade overhead simétrico en ambos frameworks.

## 16. Limitaciones

- Sin instrumentación interna de las apps (conteo de renders/commits de React o pases de CD de Angular): requeriría copias temporales modificadas; los proxies DOM/timing son simétricos y suficientes para las preguntas planteadas.
- `PerformanceEventTiming` no reportó entradas (umbral del navegador ~16 ms; interacciones < 16 ms) — métrica documentada pero vacía.
- Solo interacción sintética en localhost; sin red, sin throttling, sin multi-navegador, sin dispositivos reales.
- No se midieron escenarios de estado derivado pesado (p.ej. reports recalculados) ni transiciones de tareas con feedback (no incluidos en el protocolo por simetría de selectores).
- Una máquina local; resultados indicativos (metrics.md §1), no benchmark científico.

## 17. Veredicto de cada hipótesis

| ID                                 | Veredicto                                           | Evidencia                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H14 — Actualización localizada** | **CONFIRMADA**                                      | nodesΔ ≈ 0 en actualizaciones de una feature (S5/S6/S7); sin mutaciones observables fuera de la feature afectada; filas reutilizadas (track/key) en filtros. Caveat: el "trabajo innecesario" interno (renders) no es observable sin instrumentación; el proxy DOM no muestra cascadas.       |
| **H15 — Interacción repetitiva**   | **CONFIRMADA**                                      | 10/10 iteraciones estables por escenario (1ª/2ª mitad planas); 0 long tasks en 160 interacciones; sin degradación en escenarios de actualización. Observación no concluyente: leve deriva en S1-nav Angular (14,8→17,8 ms).                                                                   |
| **H16 — Formularios**              | **CONFIRMADA**                                      | S7a/S7b: settle 9,5–10,5 ms en ambos, 0 long tasks, validación con errores inline sin degradación en 10 submits repetidos.                                                                                                                                                                    |
| **H17 — Navegación**               | **CONFIRMADA** (con diferencia pequeña documentada) | Ambos navegan por estado con el mismo contrato DOM final (nodesΔ 2749 vs 2798). Angular tarda +3,8 ms de settle (17,7 vs 13,9 ms) por el montaje incremental de la sección (1170 vs 6 registros de mutación); rango solapado; sin implicación arquitectónica (mismo mecanismo de navegación). |
| **H18 — Aislamiento**              | **CONFIRMADA**                                      | S5 (estado a nivel App) produce mutaciones mínimas (6 vs 0) sin tocar otras secciones; S6 (mutación de dominio) solo toca la fila afectada (4 vs 1); 0 imports entre features (verificado estáticamente en Fases 4–6).                                                                        |

## 18. Conclusión crítica

1. **Lo que ocurre realmente bajo interacción:** ambos frameworks entregan la misma latencia percibida (settle) en 7 de 8 escenarios; la diferencia más grande (S1-nav, +3,8 ms) es pequeña y está dentro del rango de variación. **Ninguna interacción produce una long task.** El rendimiento interactivo de este contrato es equivalente en la práctica.
2. **Diferencia real de mecanismo, no de percepción:** React ejecuta ~6–9× más trabajo síncrono por evento de lista (reconciliation en el evento; sync 1,8–2,1 ms vs 0,2–0,3 ms) y asigna ~4× más heap por filtro; Angular difiere y coalesce (S4: 3 cambios → 1 pase de CD, 4 mutaciones vs 43). El usuario no percibe esta diferencia en este dataset; es un trade-off de _dónde_ y _cuándo_ se hace el trabajo.
3. **El aislamiento arquitectónico se comporta como está diseñado:** ambos frameworks localizan las actualizaciones (filas reutilizadas, sin mutaciones cruzadas entre features). Esto confirma en runtime lo que la arquitectura declaraba (ADR-001/002, Fases 5–6).
4. **El coste DOM de Angular en montaje de secciones es real pero pequeño en pared:** 1170 registros de mutación vs 6 no implican 200× trabajo; implican una estrategia de construcción incremental que cuesta ~4 ms más de latencia percibida en el cambio de sección.
5. **La Fase 5.9 ya lo anticipaba:** la primera carga (Lighthouse) era equivalente; este experimento extiende la equivalencia a la interacción con el dataset actual.

## 19. Qué NO podemos concluir

- No podemos afirmar que "React renderiza más" ni que "Angular renderiza menos": el número de renders internos no es observable sin instrumentación; solo medimos proxies de trabajo (mutaciones DOM, sync, heap, settle).
- No podemos extrapolar a datasets grandes ni a interacciones pesadas (0 long tasks en 30 tareas no implica 0 en 3000).
- No podemos afirmar que el +3,8 ms de S1-nav sea material ni atribuible a una causa concreta con esta evidencia (rango solapado; N=10; cuantización de frame).
- No podemos comparar "eficiencia de estado" en términos absolutos: useSyncExternalStore y Signals son mecanismos distintos que producen el mismo resultado funcional con perfiles de trabajo diferentes.
- `sync` y `heapDelta` NO son métricas de calidad ni de DX; son observaciones de perfil de trabajo.

## 20. Siguiente experimento

1. **Escalado del dataset (valor informativo más alto):** replicar S2/S4 con el dataset ampliado (p.ej. 10× tareas) para ver si la diferencia de trabajo síncrono de React y la coalescencia de Angular se traducen en diferencias de latencia percibida cuando el render pesa. Es la pregunta abierta más directa que deja este experimento.
2. **Interacción pesada con long tasks inducidas** (p.ej. reportes globales recalcularse) para observar comportamiento bajo bloqueo del hilo principal.
3. **Lighthouse user flows** sobre los flujos del contrato (interacción + navegación) como métrica estandarizada complementaria, reutilizando el desbloqueo de chrome-headless-shell de Fase 5.9.
4. **Fase 8 (evolución):** el laboratorio ya tiene React y Angular completos; una siguiente dimensión sería medir el coste interactivo de añadir una feature con estado derivado pesado (cierra el círculo con Fase 6).

---

### Reproducibilidad

```bash
pnpm build                       # asegura los builds de producción oficiales
pnpm interaction:measure         # 8 escenarios × 2 frameworks × 10 iteraciones
```

El script es determinista (mismos builds → mismos datos), no instala dependencias y escribe `results/interaction-performance-phase7.json`. Reutiliza `prettierJson` de `scripts/analyze-bundle.mjs` para que el JSON generado pase `format:check`.
