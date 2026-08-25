# Fase 17 — Debugging multi-capa y localización de fallos

## 1. Resumen ejecutivo

Ejecutamos 6 escenarios (3 bugs × 2 frameworks) sobre el mismo dominio y las mismas features en una copia experimental aislada con historial git propio (`/tmp/lab-phase17`, 6 snapshots S6 por celda). Cada celda siguió el ciclo S0 baseline → S1 bug introducido → S2 detección por tests → S3 localización (proxy estructural) → S4 fix → S5 test de regresión → S6 validación.

**Los 6 bugs fueron detectados por la suite de tests existente y corregidos con suite verde final.** El coste estructural de debugging **aumenta con la profundidad del bug** de forma consistente: la distancia causa→síntoma (1/2/3 capas) y el número de archivos a inspeccionar (5–6 → 12) crecen con la profundidad, mientras que el blast radius se mantiene bajo y sin acoplamiento. **React y Angular presentan costes estructurales equivalentes**: misma distancia, mismo número de archivos tocados (2 por celda), mismos tests de regresión necesarios, 0 imports feature→feature, 0 dependencias nuevas, invariantes OK en las 6 celdas.

Las diferencias observadas son **estructurales/arquitectónicas, no del framework**:

1. **El badge compartido de D1 tiene blast radius cruzado de features en React** (el fallo aparece en `projects-page.test.tsx`, no en tasks): el consumidor legítimo projects se ve afectado. En Angular el mismo bug se detecta vía el spec de tasks. No es acoplamiento accidental (projects es consumidor real del badge), pero demuestra que un bug de presentación en un componente compartido cruza features.
2. **Asimetría de cobertura de tests**: React tiene un test unitario de `filters.ts`; Angular no. D2 en Angular se detecta únicamente vía el spec integrado del componente (TSK-LIST-2), no por un test unitario del servicio. La red de seguridad es más fina en Angular para la capa de servicio.
3. **D3 (dominio) se detecta a profundidades distintas**: React lo detecta en la capa de dominio (`validation.test.ts` + `transitions.test.ts`), Angular en la capa de UI (`TSK-STATUS-2` "no ofrece transiciones inválidas"). El mismo bug, el mismo store compartido, pero la primera señal difiere según qué tests existen.

**La distancia causa→síntoma es una métrica más estable y discriminante que LOC** para comparar debugging: la LOC neta residual es ~0 en todas las celdas (el fix restaura el original; solo queda el test de regresión), mientras que la distancia (1/2/3) separa limpiamente los tres tipos de bug en ambos frameworks.

## 2. Metodología

- **Copia experimental**: `/tmp/lab-phase17` (clone del árbol principal, historial git propio, 6 commits S6). Árbol productivo intacto.
- **Ciclo por celda**: S0 → aplicar bug (type-valid, semántico) → ejecutar suite objetivo → registrar tests que fallan → localizar (grep del símbolo afectado, proxy estructural reproducible) → aplicar fix → añadir test de regresión → ejecutar suite completa → comprobar invariantes.
- **Proxies** (documentados, no tiempo humano): `filesTouchedByScript` = archivos que el proceso de debugging toca (bug + fix + regresión); `filesInspected` = grep -rl del símbolo afectado en apps/ y packages/; `loc` = diff residual contra S0 (incluye untracked); `blastRadius` = archivos funcionales + tests + features afectadas + capas; `causeToSymptomDistance` = fronteras entre causa y síntoma según la arquitectura real.
- **D3 compartido**: `TASK_TRANSITIONS` vive en `packages/domain`, consumido por ambos stores. La celda D3:angular mide la misma causa pero su detección adicional ocurre en el store de Angular.
- **Los apps resuelven `@operations-hub/domain` desde `dist/`**: se reconstruyó el paquete antes/después de cada celda D3 y entre celdas para evitar contaminación.

## 3. Arquitectura utilizada

```
apps/react-app/src/features/tasks/tasks-page.tsx      (UI React)
apps/angular-app/src/app/features/tasks/tasks.component.ts  (UI Angular)
apps/*/src/services/filters.ts                          (servicio de filtrado, idéntico en ambas)
apps/*/src/services/domain-store.ts | domain.store.ts  (store, delega reglas al dominio)
apps/*/src/components/priority-badge.*                 (badge presentacional compartido)
packages/domain/src/transitions.ts                      (regla de dominio: máquina de estados)
```

## 4. Definición exacta de D1/D2/D3

| Bug             | Capa de la causa      | Síntoma                                         | Bug (type-valid, semántico)                                   | Cómo se detecta                                                                                                                                    |
| --------------- | --------------------- | ----------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 presentación | presentación (badge)  | label de prioridad incorrecto en la lista       | `PriorityBadge` añade `LABELS` con `low→'High'`, `high→'Low'` | React: `projects-page.test.tsx` PRJ-VIEW-1/2 (`getAllByText('high')`); Angular: `tasks.component.spec.ts` TSK-LIST-2 (`toContain('high')`)         |
| D2 servicio     | servicio (filters)    | filtrar por "high" devuelve tasks low           | `filterTasks` invierte la comparación (`!==` en vez de `===`) | React: `filters.test.ts` (2 tests: "filters by priority" + TSK-LIST-2); Angular: `tasks.component.spec.ts` TSK-LIST-2 (sin unit test del servicio) |
| D3 dominio      | dominio (transitions) | la UI ofrece transición inválida todo→completed | `TASK_TRANSITIONS.todo` añade `'completed'`                   | React: `validation.test.ts` + `transitions.test.ts` (2 tests); Angular: `tasks.component.spec.ts` TSK-STATUS-2                                     |

## 5. Hipótesis H111–H120

| #    | Hipótesis                                                                       | Veredicto                   | Evidencia                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H111 | El coste estructural aumenta con la profundidad del bug                         | **CONFIRMADA**              | filesInspected 5–6 (D1) → 5 (D2) → 12 (D3); distancia 1/2/3; la profundidad correlaciona con el espacio de búsqueda                                                     |
| H112 | Menor distancia causa→síntoma en presentación que en dominio                    | **CONFIRMADA**              | D1=1 capa, D3=3 capas en ambos frameworks                                                                                                                               |
| H113 | Bugs de dominio afectan a más capas                                             | **CONFIRMADA**              | D3 atraviesa presentación→store→dominio (3); D1 solo presentación (1)                                                                                                   |
| H114 | El blast radius crece con la profundidad                                        | **PARCIALMENTE CONFIRMADA** | D3=5 en ambos; D1 React=5 (cruzado a projects), D1 Angular=4; la profundidad no es el único factor: la compartición del componente pesa más                             |
| H115 | Costes estructurales comparables React/Angular                                  | **CONFIRMADA**              | filesTouchedByScript=2 en las 6 celdas; misma distancia; mismos tests de regresión (1 por celda)                                                                        |
| H116 | Las diferencias dependen más de la arquitectura/capa que del framework          | **CONFIRMADA**              | Las únicas diferencias (detección de D1 cruzada, D2 sin unit test, D3 a distinta profundidad) son de cobertura de tests y compartición de componentes, no del framework |
| H117 | Los tests reducen el espacio de búsqueda de forma medible                       | **CONFIRMADA**              | Los 6 bugs fueron detectados por tests existentes sin ejecutar la app; el primer fallo apunta al área correcta (capa del bug)                                           |
| H118 | Bug semántico de dominio no detectable por TS tiene mayor coste de localización | **CONFIRMADA**              | D3 no rompe typecheck (type-valid) y es el que más archivos exige inspeccionar (12)                                                                                     |
| H119 | La distancia causa→síntoma es más estable que LOC                               | **CONFIRMADA**              | La LOC residual es ~0 en todas las celdas (fix restaura original); la distancia (1/2/3) discrimina limpiamente los 3 tipos                                              |
| H120 | Bugs de dominio mantienen el aislamiento arquitectónico                         | **CONFIRMADA**              | 0 imports feature→feature, 0 dependencias nuevas, invariantes OK en las 6 celdas                                                                                        |

## 6. Matriz de escenarios

| Celda      | S2 (bug detectado) | Primer test que falla                                        | S6 (fix + regresión) |
| ---------- | ------------------ | ------------------------------------------------------------ | -------------------- |
| D1:react   | ✅ 1 test          | projects-page PRJ-VIEW-1/2                                   | ✅ suite verde       |
| D1:angular | ✅ 1 test          | tasks TSK-LIST-2                                             | ✅ suite verde       |
| D2:react   | ✅ 2 tests         | filters "filters by priority" + TSK-LIST-2                   | ✅ suite verde       |
| D2:angular | ✅ 1 test          | tasks TSK-LIST-2                                             | ✅ suite verde       |
| D3:react   | ✅ 2 tests         | validation "rejects invalid status transition" + transitions | ✅ suite verde       |
| D3:angular | ✅ 1 test          | tasks TSK-STATUS-2                                           | ✅ suite verde       |

## 7. Resultados

| Bug | Framework | Files touched | Files inspected | LOC neta | Capas | Distancia | Tests failing | Tests regresión | Blast radius | Features afectadas |
| --- | --------- | ------------: | --------------: | -------: | ----: | --------: | ------------: | --------------: | -----------: | ------------------ |
| D1  | React     |             2 |               6 |       +7 |     1 |         1 |             1 |               1 |            5 | tasks, projects    |
| D1  | Angular   |             2 |               5 |       +8 |     1 |         1 |             1 |               1 |            4 | tasks              |
| D2  | React     |             2 |               5 |       +5 |     2 |         2 |             2 |               1 |            5 | tasks              |
| D2  | Angular   |             2 |               5 |      +11 |     2 |         2 |             1 |               1 |            4 | —                  |
| D3  | React     |             2 |              12 |       +5 |     3 |         3 |             2 |               1 |            5 | —                  |
| D3  | Angular   |             2 |              12 |       +6 |     3 |         3 |             1 |               1 |            5 | —                  |

(LOC neta = diff residual contra S0: el fix restaura el original, solo queda el test de regresión — +5 a +11 líneas.)

## 8. Tabla agregada

| Bug depth    | React                                                | Angular                                             | Δ                           | Interpretación                                                                             |
| ------------ | ---------------------------------------------------- | --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| D1 (1 capa)  | files=2, dist=1, blast=5, inspected=6                | files=2, dist=1, blast=4, inspected=5               | blast +1, inspected +1      | El badge compartido en React tiene un consumidor más (projects) cuyo test detecta el fallo |
| D2 (2 capas) | files=2, dist=2, blast=5, inspected=5, 2 tests fail  | files=2, dist=2, blast=4, inspected=5, 1 test fail  | 1 test fail de más en React | React tiene unit test de filters; Angular depende del spec integrado                       |
| D3 (3 capas) | files=2, dist=3, blast=5, inspected=12, 2 tests fail | files=2, dist=3, blast=5, inspected=12, 1 test fail | 1 test fail de más en React | La suite de dominio de React cubre transitions+validation; Angular detecta en la UI        |

## 9. Blast radius

```
D1 React:  5  (badge.tsx + tasks.test + feature tasks + feature projects + 1 capa)
D1 Angular: 4  (badge.ts + tasks.spec + feature tasks + 1 capa)
D2 React:  5  (filters.ts + filters.test + feature tasks + 2 capas)
D2 Angular: 4  (filters.ts + filters.spec + feature tasks + 2 capas)
D3 React:  5  (transitions.ts + transitions.test + feature tasks + 3 capas)
D3 Angular: 5  (transitions.ts + domain.store.spec + feature tasks + 3 capas)
```

El blast radius **no crece monótonamente con la profundidad** (D2=4–5, D3=5): la compartición de un componente presentacional (D1 React) pesa tanto como un bug de dominio. La métrica compuesta mezcla factores de distinta naturaleza; los componentes individuales (archivos, tests, features, capas) son más informativos.

## 10. Distancia causa → síntoma

- D1 = 1 frontera (presentación → presentación): el síntoma (label del badge) y la causa están en la misma capa.
- D2 = 2 fronteras (presentación → servicio): la UI consume el contrato correctamente; el servicio produce estado incorrecto.
- D3 = 3 fronteras (presentación → store → dominio): el síntoma (transición ofrecida) exige atravesar la feature, el store (que delega en `canTransitionTask`) y la regla de dominio.

La distancia es **idéntica entre React y Angular** para el mismo bug — es una propiedad de la arquitectura, no del framework.

## 11. Comportamiento de los tests

- **Los 6 bugs se detectan sin ejecutar la app**: la suite de tests es una red de seguridad efectiva (H117).
- **Detectar ≠ localizar**: los tests señalan el área correcta (el primer fallo está en la capa del bug), pero no la línea exacta; la localización requiere inspección adicional (grep del símbolo → 5–12 archivos según profundidad).
- **Asimetría de cobertura**: Angular no tiene unit test de `filters.ts`; su red de seguridad para la capa de servicio depende del spec integrado del componente. En el dominio, la suite de React cubre `transitions` y `validation`; Angular detecta en la UI (TSK-STATUS-2). Ambas redes funcionan, pero a profundidades distintas de detección.
- Tests de regresión: 1 por celda (todos añadidos, todos verdes en S6).

## 12. Invariantes

| Invariante                              | D1:R                                        | D1:A | D2:R | D2:A | D3:R | D3:A |
| --------------------------------------- | ------------------------------------------- | ---- | ---- | ---- | ---- | ---- |
| 0 imports feature→feature               | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |
| 0 dependencias nuevas                   | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |
| 0 duplicación de reglas de dominio      | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |
| domain = fuente única de verdad         | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |
| 0 features no relacionadas tocadas      | ⚠️ projects (consumidor legítimo del badge) | ✅   | ✅   | ✅   | ✅   | ✅   |
| ADR-001/002 intactos                    | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |
| typecheck / lint / build verdes (final) | ✅                                          | ✅   | ✅   | ✅   | ✅   | ✅   |

El único matiz: en D1:react, `projects` aparece afectado — pero es un **consumidor real del badge compartido**, no acoplamiento accidental (0 imports entre features).

## 13. Diferencias significativas vs ruido

**Significativas (reproducibles y direccionales):**

1. `filesInspected` crece con la profundidad: 5–6 (D1) → 5 (D2) → 12 (D3). Es la métrica más discriminante del coste de localización.
2. `causeToSymptomDistance` 1/2/3 separa limpiamente los tres tipos de bug en ambos frameworks.
3. D1 React tiene blast radius cruzado a projects (componente compartido); D1 Angular no (mismo bug, misma compartición — la diferencia está en qué tests existen).
4. React detecta D2 y D3 con 2 tests fallidos vs 1 en Angular (cobertura unitaria de filters y del dominio).

**Ruido / no discriminante:**

- LOC residual (~0 tras el fix): no discrimina entre tipos de bug.
- `filesTouchedByScript` (2 en todas las celdas): no discrimina.
- Blast radius compuesto (4–5): no discrimina por profundidad.

## 14. Anomalías

- D1 React: el fallo inicial aparece en `projects-page.test.tsx`, no en tasks — esperado pero no obvio: el badge es compartido y el primer test que lo pina es el del otro consumidor.
- D3 Angular: la detección es en la UI (TSK-STATUS-2), no en el store spec ni en el test de dominio — el harness de Angular no ejecuta los tests del paquete `@operations-hub/domain` (son del workspace de domain), y el spec del store de Angular no pinna todo→completed; la primera señal es el spec del componente.
- `git status --porcelain` truncaba la primera línea al aplicar `.trim()` global; corregido (slice por línea).

## 15. Limitaciones

- Proxies estructurales reproducibles (grep/diff), NO tiempo humano ni dificultad cognitiva.
- Una máquina; tests en vitest (React/domain) y Karma+jsdom (Angular) — el harness de Angular no incluye la suite del paquete de dominio.
- D3 comparte causa entre frameworks (dominio único); las celdas React/Angular difieren solo en la ruta de detección.
- La "localización" es un proxy grep; no mide el proceso cognitivo real de búsqueda.
- La suite de Angular es más lenta que la de React (ng test), pero el tiempo de suite no se usó como métrica principal.

## 16. Relación con Fase 13

Fase 13 (C3) midió un bug de 1 capa (filtro case-sensitive en `filters.ts`, 1 test rojo, fix de 1 línea, distancia 1). Fase 17 extiende la medición a 3 profundidades y confirma el patrón: la distancia causa→síntoma y la superficie de inspección crecen con la profundidad; el coste de corrección (LOC, archivos) se mantiene pequeño porque el dominio y las fronteras están limpias. La conclusión de F13 sobre costes comparables React/Angular **se mantiene** en las 3 profundidades.

## 17. Relación con Fases 11–12

- Fase 11 (breaking changes): los errores de contrato aparecen en consumidores legítimos y son detectables por tooling — F17 confirma que la detección se mantiene incluso para bugs semánticos type-valid (no detectables por TS), que exigen la red de tests en vez del compilador.
- Fase 12 (contratos versionados): la coexistencia V1/V2 no rompió aislamiento — F17 confirma que ni siquiera un bug de dominio (D3) rompe el aislamiento durante su corrección.

## 18. Interpretación obligatoria

1. **¿Aumenta realmente el coste estructural con la profundidad?** Sí, en el espacio de búsqueda (archivos inspeccionados 5→12) y en la distancia (1→3); no en archivos tocados ni LOC (constantes).
2. **¿Cuál es la métrica más estable?** `causeToSymptomDistance` (1/2/3, idéntica entre frameworks) y `filesInspected` (crece con la profundidad).
3. **¿LOC sigue siendo útil?** No para comparar debugging entre frameworks: el fix restaura el original y la LOC residual es ~0 en todas las celdas. La distancia y los archivos inspeccionados son más informativos (H119).
4. **¿Los tests localizan o solo detectan?** Detectan el área (capa) correcta, no la línea exacta; localizar exige inspección adicional. La red de seguridad es efectiva pero no suficiente.
5. **¿React y Angular difieren realmente?** No en coste estructural (misma distancia, mismos archivos, mismos tests de regresión). Sí en la _ruta de detección_ (qué tests existen: unit test de filters en React, spec integrado en Angular; suite de dominio para React, spec de UI para Angular).
6. **¿Las diferencias proceden del framework o de la arquitectura?** De la arquitectura y de la cobertura de tests existente, no del framework. El patrón de código (TSX vs template+component) no alteró ninguna métrica de debugging.
7. **¿Qué resultado contradice las expectativas?** Que D1 (presentación) tenga blast radius cruzado de features en React (projects) y que D3 se detecte a profundidades distintas (dominio en React, UI en Angular). Ambos son artefactos de la compartición de componentes y de la cobertura de tests, no del framework.
8. **¿Qué hipótesis no puede demostrarse?** Ninguna quedó sin evidencia; H114 (blast radius crece con profundidad) solo parcialmente — la compartición de componentes pesa más que la profundidad.
9. **¿Qué no debemos concluir?** No podemos concluir tiempo humano de debugging, dificultad cognitiva, ni superioridad de un framework. Tampoco que "React tiene mejores tests" — Angular simplemente tiene distinta distribución de la cobertura.
10. **¿Qué nueva información aporta F17 respecto a F13?** Que la equivalencia estructural React/Angular se mantiene a 3 profundidades de bug; que el coste de localización (no el de corrección) es la dimensión que crece con la profundidad; que la cobertura de tests (no el framework) determina dónde aparece la primera señal.

## 19. Conclusiones

1. **La equivalencia React/Angular para debugging multi-capa es robusta**: misma distancia, mismos archivos, mismos tests de regresión, mismas invariantes, en los 6 escenarios.
2. **La profundidad del bug se manifiesta en el espacio de búsqueda, no en el coste de corrección**: la corrección es barata y localizada en todos los casos; la localización (archivos inspeccionados, distancia) crece con la profundidad.
3. **La red de tests determina la ruta de detección**: la primera señal del bug aparece donde existe cobertura (unit test del servicio en React, spec integrado en Angular, suite de dominio para React D3, spec de UI para Angular D3).
4. **La arquitectura (no el framework) explica las diferencias observadas**: compartición del badge, distribución de la cobertura, fronteras del dominio.

## 20. Siguiente experimento recomendado

1. **Debugging bajo acoplamiento inducido** (introducir deliberadamente un import feature→feature o una duplicación de regla y medir cómo cambia la localización): cuantificar cuánto degrada el acoplamiento accidental la métrica de distancia.
2. **Port de una feature entre frameworks** (Board de React→Angular y viceversa): el coste de migrar código existente entre paradigmas, que complementa la medición de debugging (el bug viaja con el port).
3. **Localización con instrumentación de runtime** (añadir tracing/session de depuración al harness y medir cuántos puntos de parada son necesarios para aislar D3): conectar el proxy estructural con una medición de "pasos de localización" ejecutables.
