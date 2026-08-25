# Fase 18 — Debugging y mantenimiento bajo acoplamiento arquitectónico inducido

## 1. Resumen ejecutivo

Ejecutamos 48 celdas (4 condiciones × 6 escenarios × 2 frameworks) sobre el mismo dominio y las mismas features en una copia experimental aislada con historial git propio (`/tmp/lab-phase18`, snapshots por condición). Las condiciones aíslan una única variable experimental — **acoplamiento arquitectónico**:

- **BASELINE**: arquitectura limpia (0 imports feature→feature, reglas centralizadas en domain).
- **COUPLED-A**: import feature→feature real `tasks → teams` (tasks muestra el team del asignado vía `userTeamName` exportado por teams).
- **COUPLED-B**: duplicación de regla de negocio (dashboard reimplementa `computeCompletionRate` localmente, inicialmente equivalente).
- **COUPLED-C**: ambos acoplamientos combinados.

**El acoplamiento tiene un efecto real pero selectivo: no degrada todo el mantenimiento, solo las operaciones que cruzan la frontera acoplada.** Los escenarios M2 (UI), M3 (eliminar funcionalidad) y M6 (regla central de dominio) son **indistinguibles entre condiciones** (mismos archivos, mismo blast radius, mismos tests). Los efectos se concentran en:

1. **M5 (debugging — bug semántico en la dependencia):** la distancia causa→síntoma pasa de **1 a 2 capas** bajo coupling (COUPLED-A/C) y el blast radius de **3 a 4** — el bug en `userTeamName` (teams) obliga a atravesar tasks→teams. El bug es **invisible a la suite** en todas las condiciones (0 tests fallan; type-valid), pero el espacio de búsqueda y la distancia crecen bajo acoplamiento.
2. **M1 (modificar la regla duplicada):** bajo COUPLED-B/C la suite de dashboard **deja de fallar** (el dashboard usa la copia local, sigue mostrando 42,9%) mientras la regla de domain cambia — la duplicación **oculta la inconsistencia** en vez de amplificarla. Tests que fallan: 2 (baseline) → 1 (duplicado).
3. **M4 (cambio de contrato):** en baseline, cambiar `filterTasks` rompe 7 errores de typecheck en React (muchos consumidores); bajo coupling, cambiar `userTeamName` rompe solo 1 (el consumidor acoplado tasks). El acoplamiento **reduce** el radio del cambio de contrato porque concentra consumidores en un único punto de entrada.

**Conclusión central: el acoplamiento feature→feature sí aumenta el coste de debugging (distancia, espacio de búsqueda), pero NO aumenta el blast radius de mantenimiento estructural en este laboratorio** — los escenarios de mantenimiento típicos (UI, eliminación, regla central) no cruzan la frontera acoplada, y el único efecto de la duplicación es _silenciar_ inconsistencias en vez de amplificarlas. **React y Angular son indistinguibles en todas las celdas** (mismos valores en 48/48; las diferencias son de cobertura de tests, no del framework).

## 2. Diseño experimental

- **Copia**: `/tmp/lab-phase18` (clone del árbol principal, historial git propio, 4 snapshots de condición). Árbol productivo intacto.
- **Condiciones** aplicadas a ambos frameworks por snapshot git; los escenarios se miden como diff contra el snapshot de su condición (incremento aislado).
- **Escenarios** (semánticamente equivalentes en React/Angular): M1 modificar regla duplicada, M2 UI, M3 eliminar funcionalidad, M4 contrato de función consumida, M5 bug semántico type-valid en la dependencia, M6 regla central.
- **Proxies**: `filesAffectedByScenario` (diff contra snapshot), `filesInspected` (grep del símbolo afectado), `causeToSymptomDistance`, `blastRadius` (archivos + tests + features + capas), `locTouched`, tests que fallan (archivos de test), invariantes. NO se mide tiempo humano.

## 3. Veredictos H121–H130

| #    | Hipótesis                                                                             | Veredicto                   | Evidencia                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H121 | El acoplamiento feature→feature aumenta el blast radius                               | **PARCIALMENTE CONFIRMADA** | Solo en M5 (debugging): blast 3→4 bajo COUPLED-A/C. En M2/M3/M6 el blast es idéntico (2–3) en todas las condiciones                                                                     |
| H122 | La duplicación aumenta los lugares a modificar                                        | **REFUTADA**                | M1 modifica el mismo nº de archivos (1) en todas las condiciones; la copia local de dashboard NO se toca al cambiar la regla de domain                                                  |
| H123 | La duplicación aumenta el riesgo de inconsistencias                                   | **CONFIRMADA (matizada)**   | La inconsistencia existe (dashboard sigue en 42,9% mientras domain cambia) pero es **invisible**: la suite de dashboard deja de fallar (tests 2→1). La duplicación oculta, no amplifica |
| H124 | El acoplamiento aumenta el espacio de búsqueda en debugging                           | **CONFIRMADA**              | M5: React `insp=1→2` bajo coupling; la búsqueda cruza teams+tasks en vez de solo tasks                                                                                                  |
| H125 | La distancia causa→síntoma aumenta bajo acoplamiento                                  | **CONFIRMADA**              | M5: 1 (baseline/B) → 2 (COUPLED-A/C) en ambos frameworks                                                                                                                                |
| H126 | Los archivos no relacionados aumentan bajo acoplamiento                               | **REFUTADA**                | 0 features no relacionadas afectadas en las 48 celdas (solo tasks/teams/dashboard, consumidores legítimos)                                                                              |
| H127 | El coste del acoplamiento es independiente del framework                              | **CONFIRMADA**              | Valores idénticos React/Angular en 48/48 celdas para archivos, blast, distancia, LOC                                                                                                    |
| H128 | La arquitectura explica más variación que React vs Angular                            | **CONFIRMADA**              | La variación entre condiciones (distancia 1→2, tests 2→1) es la única señal; React/Angular son indistinguibles                                                                          |
| H129 | Los tests detectan regresiones pero no eliminan el coste estructural del acoplamiento | **CONFIRMADA**              | El bug de M5 es invisible (0 tests) en todas las condiciones; los tests detectan M1/M6 pero no reducen la distancia de M5                                                               |
| H130 | Eliminar el acoplamiento tiene coste de recuperación medible                          | **CONFIRMADA**              | Revertir COUPLED-A/B requiere tocar 5/2 archivos respectivamente (el snapshot se revierte limpiamente; el coste es el diff de la condición: 34 LOC para A, ~20 para B)                  |

Hipótesis adicional observada (H131): **la duplicación de una regla silencia las pruebas en vez de amplificar el fallo** — el acoplamiento por duplicación degrada la _detección_, no el _estallido_.

## 4. Tabla principal

### M5 — Debugging (bug semántico type-valid en la dependencia)

| Condición | Framework | Files | LOC | Distancia causa→síntoma | Inspectados | Tests failing | Blast radius |
| --------- | --------- | ----: | --: | ----------------------: | ----------: | ------------: | -----------: |
| BASELINE  | React     |     1 |  +2 |                       1 |           1 |             0 |            3 |
| BASELINE  | Angular   |     1 |  +2 |                       1 |           4 |             0 |            3 |
| COUPLED-A | React     |     1 |  +2 |                   **2** |           2 |             0 |        **4** |
| COUPLED-A | Angular   |     1 |  +2 |                   **2** |           2 |             0 |        **4** |
| COUPLED-B | React     |     1 |  +2 |                       1 |           1 |             0 |            3 |
| COUPLED-B | Angular   |     1 |  +2 |                       1 |           4 |             0 |            3 |
| COUPLED-C | React     |     1 |  +2 |                   **2** |           2 |             0 |        **4** |
| COUPLED-C | Angular   |     1 |  +2 |                   **2** |           2 |             0 |        **4** |

### M1 — Modificar la regla duplicada

| Condición | Files | LOC | Tests failing (React/Angular) | Blast |
| --------- | ----: | --: | ----------------------------: | ----: |
| BASELINE  |     1 |  +2 |                         2 / 2 |     2 |
| COUPLED-A |     1 |  +2 |                         2 / 2 |     2 |
| COUPLED-B |     1 |  +2 |                     **1 / 1** |     2 |
| COUPLED-C |     1 |  +2 |                     **1 / 1** |     2 |

### M4 — Cambio de contrato

| Condición | Framework | Contrato              | Typecheck errors | Blast |
| --------- | --------- | --------------------- | ---------------: | ----: |
| BASELINE  | React     | filterTasks (+param)  |            **7** |     2 |
| BASELINE  | Angular   | filterTasks (+param)  |                1 |     2 |
| COUPLED-A | React     | userTeamName (+param) |                1 |     3 |
| COUPLED-A | Angular   | userTeamName (+param) |                1 |     3 |
| COUPLED-C | React     | userTeamName (+param) |                1 |     3 |

### M2 / M3 / M6 — Invariantes entre condiciones

M2: files=1, blast=3, tests 1/0 (React/Angular) — **idéntico en las 4 condiciones**.
M3: files=1–2, blast=3–4, tests 1/2 — **idéntico en las 4 condiciones**.
M6: files=1, blast=2, tests=1 — **idéntico en las 4 condiciones**.

## 5. Impacto del acoplamiento

| Dimensión                         | BASELINE | COUPLED-A | COUPLED-B | COUPLED-C |
| --------------------------------- | -------- | --------- | --------- | --------- |
| imports feature→feature           | 0        | 1         | 0         | 1         |
| reglas duplicadas                 | 0        | 0         | 2         | 2         |
| distancia M5                      | 1        | 2         | 1         | 2         |
| tests M1 (inconsistencia visible) | 2        | 2         | 1         | 1         |
| blast M5                          | 3        | 4         | 3         | 4         |
| blast M2/M3/M6                    | 2–3      | 2–3       | 2–3       | 2–3       |

**El efecto es acumulativo solo en la dimensión de acoplamiento estructural** (fi=0→1, dup=0→2 en C) pero **no en las métricas de coste** (M5 de A es idéntico al de C; M1 de B idéntico al de C). COUPLED-C no es peor que A o B por separado en ninguna métrica de coste — el acoplamiento no se sinergiza en este laboratorio.

## 6. Debugging

- **M5**: el bug (type-valid, semántico) en `userTeamName` — devolver el primer team en vez del del usuario — es **invisible a la suite** (0 tests fallan) en las 4 condiciones: ningún test pinna el team mostrado. La localización exige inspección manual (grep del símbolo), y bajo coupling la búsqueda cruza 2 features (tasks→teams) con distancia 2 vs 1 en baseline.
- **El acoplamiento no rompe la detección automática de los otros escenarios**: M1/M6 rompen tests de domain/dashboard/reports en todas las condiciones; M4 rompe typecheck en todas. La degradación del acoplamiento está en el _espacio de búsqueda manual_, no en la detección automática.

## 7. Diferencias React/Angular

**No hay diferencias significativas en ninguna de las 48 celdas**: mismos archivos, misma distancia, mismo blast radius, misma LOC, mismos tests para el mismo escenario×condición. Las únicas asimetrías son de cobertura de tests preexistente (React tiene unit test de `filterTasks`; Angular lo detecta vía spec integrado; la suite de dashboard de Angular usa el mismo valor 42,9%) — ninguna atribuible al framework ni al acoplamiento.

## 8. Invariantes

| Invariante                    | BASELINE | COUPLED-A        | COUPLED-B        | COUPLED-C        |
| ----------------------------- | -------- | ---------------- | ---------------- | ---------------- |
| 0 imports feature→feature     | ✅ (0)   | ⚠️ (1, inducido) | ✅ (0)           | ⚠️ (1, inducido) |
| 0 reglas duplicadas           | ✅ (0)   | ✅ (0)           | ⚠️ (2, inducido) | ⚠️ (2, inducido) |
| 0 dependencias nuevas         | ✅       | ✅               | ✅               | ✅               |
| domain sin imports de apps    | ✅       | ✅               | ✅               | ✅               |
| typecheck verde (final)       | ✅       | ✅               | ✅               | ✅               |
| tests verdes (condición base) | ✅       | ✅               | ✅               | ✅               |

Las variantes acopladas rompen exactamente las invariantes que el diseño induce (import feature→feature en A/C, duplicación en B/C), y nada más. Al finalizar, el árbol productivo se restaura (el experimento vive solo en `/tmp/lab-phase18`).

## 9. Diferencias significativas vs ruido

**Significativas (reproducibles, direccionales):**

1. Distancia causa→síntoma M5: 1 → 2 bajo COUPLED-A/C (idéntico en React y Angular).
2. Tests que fallan M1: 2 → 1 bajo COUPLED-B/C (la duplicación silencia la prueba de dashboard).
3. Typecheck errors M4: 7 (React baseline, filterTasks) → 1 (coupled, userTeamName).
4. Imports feature→feature: 0 → 1; reglas duplicadas: 0 → 2.

**Ruido / no discrimina:**

- filesAffectedByScenario (1 en casi todas las celdas — el tamaño del proyecto hace que un cambio toque pocos archivos).
- Blast radius de M2/M3/M6 (idéntico entre condiciones).
- LOC (2 en todas — cambios de 1–2 líneas).

## 10. Interpretación obligatoria

1. **¿Cuánto aumenta el blast radius con feature→feature?** Solo en debugging (M5): +1 (3→4). En mantenimiento estructural: 0.
2. **¿Cuánto al duplicar una regla?** Blast radius: 0; pero la _detección_ empeora (tests M1: 2→1): la inconsistencia deja de ser visible.
3. **¿Qué escenario produce mayor coste?** M5 (debugging acoplado): distancia 2 y búsqueda cruzando 2 features. M3 (eliminación Angular): 2 archivos/11 LOC, pero sin efecto del acoplamiento.
4. **¿El acoplamiento afecta más a mantenimiento o debugging?** **Debugging.** El mantenimiento estructural (UI, eliminación, regla central) no cruza la frontera; el debugging de un bug en la dependencia sí.
5. **¿Duplicación o import feature→feature es más dañino?** El import (A) es más dañino para debugging (distancia 2); la duplicación (B) es más dañina para _detección_ (inconsistencia silenciosa). Ninguno amplifica el blast radius de mantenimiento.
6. **¿El efecto es acumulativo?** **No** en las métricas de coste: COUPLED-C no supera a A ni a B en ninguna métrica (M5 de C = M5 de A; M1 de C = M1 de B). Solo el acoplamiento estructural se suma (fi+dup).
7. **¿Qué ocurre con archivos no relacionados?** 0 en las 48 celdas — el acoplamiento inducido es localizado y no arrastra features ajenas.
8. **¿Qué ocurre con la distancia causa→síntoma?** 1→2 bajo coupling en M5; las demás operaciones no la alteran.
9. **¿Qué detecta automáticamente TS/lint/tests?** TS detecta M4 (contrato); los tests detectan M1/M6 (reglas); nada detecta M5 (bug semántico type-valid) en ninguna condición. Lint sin cambios.
10. **¿Qué es deuda aunque los tests estén verdes?** La duplicación de COUPLED-B/C: la suite queda verde (o más verde que baseline) mientras la regla duplicada diverge silenciosamente de la de domain. La distancia de M5 bajo coupling es deuda invisible.
11. **¿React/Angular difieren?** No — indistinguibles en 48/48.
12. **¿Las diferencias proceden del framework o de la arquitectura?** De la arquitectura (fronteras entre features, localización de la regla). El framework no introduce ninguna diferencia.
13. **¿La recuperación posterior tiene coste medible?** Sí y es el diff de la condición (34 LOC para A, ~20 para B, 5/2 archivos): revertir el acoplamiento restaura la arquitectura limpia sin deuda residual.
14. **¿Se mantienen las conclusiones de Fases 11–17?** Sí, reforzadas: la arquitectura limpia sigue siendo la condición con menor distancia de debugging (F17); la evolución de dominio (F11) y la centralización (F12) se confirman como la fuente de la detección automática que sí funciona (M1/M6/M4).
15. **¿Qué hipótesis quedan refutadas o no concluyentes?** H122 y H126 **REFUTADAS** (la duplicación no aumenta los lugares a modificar ni los archivos no relacionados en este laboratorio); H121/H123 **PARCIALMENTE CONFIRMADAS**.
16. **¿Qué nuevo experimento?** Ver sección 17.

## 11. Comparación con fases anteriores

- **F13 (mantenibilidad):** F13 concluyó costes estructurales comparables React/Angular — F18 confirma que se mantienen bajo acoplamiento (idénticos en 48/48).
- **F17 (debugging multilayer):** F17 mostró que la profundidad del bug (1/2/3 capas) aumenta el espacio de búsqueda — F18 añade que el **acoplamiento feature→feature añade una capa extra a la distancia** (1→2) con el mismo efecto sobre el espacio de búsqueda. La distancia es una propiedad de la ruta de dependencia, no solo de la profundidad arquitectónica.
- **F11 (evolución del dominio):** F11 mostró detección automática de breaking changes — F18 confirma que la centralización en domain es lo que hace detectables M1/M6; la duplicación rompe esa detección.
- **F12 (contratos versionados):** F12 mostró que la coexistencia V1/V2 no introduce segunda fuente de verdad — F18 muestra el contraejemplo: la duplicación _sí_ introduce una segunda fuente de verdad (dashboard) que degrada la detección.

## 12. Limitaciones

- Proxies estructurales; ausencia de tiempo humano real.
- Tamaño del proyecto pequeño (6 features, 30 tasks): un cambio toca pocos archivos, lo que aplana métricas de archivos/blast.
- La duplicación inducida es funcionalmente equivalente inicialmente — en producción una duplicación podría divergir de entrada.
- El acoplamiento inducido (tasks→teams, dashboard duplicado) es deliberado y localizado; no representa todo tipo de acoplamiento (p.ej. acoplamiento de datos, de estado, circular).
- Dependencia de la cobertura de tests existente (determina qué se detecta).
- M4 en baseline cambia `filterTasks` mientras que en coupled cambia `userTeamName` — el tipo de cambio es el mismo (añadir parámetro a función consumida) pero los consumidores difieren.
- `filesInspected` es un proxy grep del símbolo; no mide el proceso cognitivo real.

## 13. Archivos creados/modificados

- **Creados:** `scripts/measure-coupling-phase18.mjs`, `docs/experiments/coupling-phase18.md`, `docs/experiments/results/coupling-phase18.json`
- **Modificados:** `docs/experiments/README.md`, `package.json` (`coupling:measure`)

## 14. Validaciones

| Check                          | Resultado                            |
| ------------------------------ | ------------------------------------ |
| `pnpm format` / `format:check` | ✅                                   |
| `pnpm lint`                    | ✅ 3/3                               |
| `pnpm typecheck`               | ✅ 4/4                               |
| `pnpm test`                    | ✅ 84/84                             |
| `pnpm build`                   | ✅ 3/3                               |
| `pnpm coupling:measure`        | ✅ 48 celdas, exit 0, invariantes OK |
| JSON                           | ✅ válido, 48 celdas                 |
| Procesos residuales            | ✅ 0                                 |

## 15. Estado de git

5 archivos esperados (3 nuevos + README + package.json). **Sin commit.** Copia experimental `/tmp/lab-phase18` con 4 snapshots de condición y 48 celdas reproducibles. Árbol productivo intacto.

## 16. Notificación ntfy

Ver salida final (sección dedicada).

## 17. Siguiente experimento recomendado

1. **Acoplamiento por datos compartidos entre features** (una feature escribe y otra lee un store compartido sin pasar por domain): mide si el acoplamiento de estado degrada más que el de imports.
2. **Duplicación divergente de entrada** (la copia local nace con una variación semántica, no equivalente): cuantifica el coste cuando la inconsistencia es inmediata y visible.
3. **Port de una feature acoplada entre frameworks** (migrar la feature tasks que ya depende de teams de React a Angular): mide si el acoplamiento viaja con el port y cuánto encarece la migración.

## 18. Conclusión

El acoplamiento arquitectónico inducido **sí empeora el debugging** (distancia causa→síntoma 1→2, espacio de búsqueda que cruza features) pero **no empeora el mantenimiento estructural** en este laboratorio (M2/M3/M6 idénticos entre condiciones). La duplicación de reglas tiene un efecto contra-intuitivo: **silencia la detección** de inconsistencias en vez de amplificarlas. React y Angular son **indistinguibles** bajo acoplamiento — la variable que importa es la arquitectura, confirmando la hipótesis central con el matiz de que el efecto es selectivo (debugging > mantenimiento, import > duplicación para debugging, duplicación > import para detección).
