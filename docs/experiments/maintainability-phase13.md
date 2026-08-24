# Fase 13 — Coste cognitivo y mantenibilidad (escenarios C1–C6)

> Estado: completada · Copia experimental: `/tmp/lab-phase13` (historial propio) ·
> Resultados crudos: `docs/experiments/results/maintainability-phase13.json` ·
> Métricas reproducibles: `pnpm maintainability:measure`

## 1. Resumen ejecutivo

Se ejecutaron 6 tareas heterogéneas de mantenimiento — feature nueva,
modificación, bug fix, refactor, cambio UI-only y eliminación — implementadas
**idénticamente** en React y Angular sobre el mismo dominio, en una copia
aislada con un commit por escenario (8 snapshots).

**Hallazgo principal: el coste estructural es comparable; la diferencia es de
forma, no de volumen.** Por LOC netas, React y Angular son prácticamente
iguales en todos los escenarios (C1 +253 vs +263, C2 +51 vs +46, C4 +11 vs +9,
C5 +30 vs +31). Por **número de archivos**, Angular requiere consistentemente
más (ts + html + spec vs tsx), especialmente al eliminar (C6: 6 vs 3 archivos,
−134 vs −66 LOC). El trabajo accidental clasificado como _framework_ (templates,
boilerplate de componente, integración de estado, shell) representa 0 %–84 %
de la LOC según el escenario, y la clasificación confirma el supuesto H82: la
estructura física adicional de Angular existe, pero se concentra en archivos
separados, no en más código.

**El bug fix (C3) fue simétrico**: mismo bug en el mismo servicio (filters.ts,
idéntico en ambas apps), mismo test de regresión rojo (1 por framework), misma
corrección de 1 línea, distancia causa→síntoma de 1 archivo y 1 capa en ambos.
**El refactor (C4) fue invisible**: 0 regresiones, 0 tests tocados, mismo
comportamiento. **La eliminación (C6) dejó 0 referencias funcionales
residuales** en ambas apps. **0 imports feature→feature, 0 reglas de dominio
duplicadas, 0 dependencias nuevas** en todo el experimento.

No hay evidencia de que un framework exija más trabajo _accidental_ en sentido
de LOC; hay evidencia de que Angular exige más _archivos_ por estructura
física. Eso no es un veredicto de calidad: es la medida.

## 2. Pregunta experimental

> Cuando un equipo implementa, modifica, depura y elimina funcionalidades
> reales dentro de esta arquitectura, ¿React y Angular presentan el mismo
> coste cognitivo y estructural, o uno de ellos exige más trabajo accidental?

Se responde con proxies estructurales reproducibles (tiempo humano: NO MEDIBLE).

## 3. Metodología

- **Copia aislada** `/tmp/lab-phase13` clonada del árbol principal (baseline =
  HEAD `1422b49`, dominio original sin migraciones de Fases 11–12), con
  historial git propio: 1 commit por escenario, cada uno validado con
  typecheck + tests + build antes del snapshot.
- **Escenarios acumulativos** (como Fases 11–12): cada uno parte del estado
  anterior; la feature Board (C1) permanece en estados posteriores.
- **Proxies reproducibles** para coste cognitivo: superficie de cambio
  (archivos/LOC), imports, tests, símbolos nuevos, blast radius (features
  tocadas), complejidad por ramas (proxy McCabe limitado) y la clasificación
  de trabajo accidental vs funcional (heurística documentada, ver §10).
- **Validación de recuperación** tras cada escenario: `format`, `lint`,
  `typecheck`, `test`, `build` — todo verde en los 8 estados.
- **C3** se diseñó con dos estados (BUG y FIX) para medir el ciclo de
  depuración: inyección del bug, test de regresión rojo, corrección, verde.

## 4. Hipótesis H76+

| Hipótesis                                                    | Veredicto                                            |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| H76 — Coste de feature equivalente                           | **CONFIRMADA**                                       |
| H77 — Modificación localizada                                | **CONFIRMADA**                                       |
| H78 — Debugging localizado                                   | **CONFIRMADA**                                       |
| H79 — Refactor sin acoplamiento                              | **CONFIRMADA**                                       |
| H80 — UI: coste estructural podría diferir                   | **CONFIRMADA (diferencias de forma, no de volumen)** |
| H81 — Eliminación sin residuales                             | **CONFIRMADA**                                       |
| H82 — Complejidad accidental (Angular más estructura física) | **PARCIALMENTE CONFIRMADA**                          |

Justificaciones en §14–§15 y §23 del detalle por escenario.

## 5. Escenarios C1–C6

| Escenario | Tarea                                                                                                                                                                                                                         | Contrato equivalente | Features tocadas (prod)           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------- |
| C1        | Nueva feature completa **Board** (kanban-lite: 3 columnas por estado, quick-add validado con `createTask`/`validateTaskInput`, transiciones con `TASK_TRANSITIONS`, estado local del formulario, nombres de proyecto/dominio) | Sí                   | board (nueva)                     |
| C2        | Modificar **Tasks**: control de orden (priority/title) — estado derivado + UI                                                                                                                                                 | Sí                   | tasks                             |
| C3        | **Bug fix**: búsqueda de tareas case-sensitive en `filters.ts` (mismo bug, mismo test de regresión, mismo fix)                                                                                                                | Sí                   | tasks (síntoma), services (causa) |
| C4        | **Refactor sin cambio funcional**: KPIs del dashboard a array tipado + `map`/`@for`                                                                                                                                           | Sí                   | dashboard                         |
| C5        | **Cambio UI puro**: toggle de densidad (compact rows) en Tasks                                                                                                                                                                | Sí                   | tasks                             |
| C6        | **Eliminar** la feature Settings (ruta/nav/control, tests)                                                                                                                                                                    | Sí                   | settings (eliminada)              |

## 6. Métricas

Definidas antes de ejecutar: superficie (files_touched/created/deleted,
loc_added/removed/net), dependencias (imports_added/removed,
feature_to_feature_imports, domain_imports), complejidad (símbolos nuevos,
proxy de ramas), tests (add/modify/delete, failed_before/after_fix), blast
radius (features_touched, unrelated_features_touched, domain/app/test files),
mantenibilidad (distancia causa→síntoma, capas atravesadas, archivos a
inspeccionar, conceptos del framework), y la clasificación accidental vs
funcional. `time_to_implement` y "carga cognitiva" subjetiva: **NO MEDIBLES**,
declarados como limitación.

## 7. Resultados React

| Escenario   | Archivos | LOC netas |          Tests | Símbolos nuevos |
| ----------- | -------: | --------: | -------------: | --------------: |
| C1 Board    |        5 |      +253 |          +2 ~2 |   1 (BoardPage) |
| C2 sort     |        2 |       +51 |             ~2 |               0 |
| C3 fix      |        1 |        −2 | +1 (regresión) |               0 |
| C4 refactor |        1 |       +11 |              0 |               0 |
| C5 density  |        3 |       +30 |             ~2 |               0 |
| C6 eliminar |        3 |       −66 |          −0 ~2 |               0 |

React concentra la lógica y la UI en `.tsx` (1 archivo por feature + test);
la feature nueva añadió 1 componente, 1 test y 3 archivos de shell (App.tsx,
App.test.tsx, styles.css).

## 8. Resultados Angular

| Escenario   | Archivos | LOC netas |          Tests |    Símbolos nuevos |
| ----------- | -------: | --------: | -------------: | -----------------: |
| C1 Board    |        7 |      +263 |          +2 ~2 | 1 (BoardComponent) |
| C2 sort     |        3 |       +46 |             ~2 |                  0 |
| C3 fix      |        1 |        −2 | +1 (regresión) |                  0 |
| C4 refactor |        2 |        +9 |              0 |                  0 |
| C5 density  |        4 |       +31 |             ~2 |                  0 |
| C6 eliminar |        6 |      −134 |          −1 ~2 |                  0 |

Angular separa componente (`.ts`) + template (`.html`) + spec; la feature
nueva añadió 3 archivos (ts+html+spec) y 4 de shell (app.ts, app.html,
app.spec.ts, styles.css). La eliminación de Settings borró 3 archivos (ts+html+spec).

## 9. Comparación

| Escenario | Archivos R/A |     LOC R/A | Δ LOC | Δ archivos |
| --------- | -----------: | ----------: | ----: | ---------: |
| C1        |        5 / 7 | +253 / +263 |   +10 |         +2 |
| C2        |        2 / 3 |   +51 / +46 |    −5 |         +1 |
| C3 (fix)  |        1 / 1 |     −2 / −2 |     0 |          0 |
| C4        |        1 / 2 |    +11 / +9 |    −2 |         +1 |
| C5        |        3 / 4 |   +30 / +31 |    +1 |         +1 |
| C6        |        3 / 6 |  −66 / −134 |   −68 |         +3 |

- **LOC: empate prácticamente exacto** en 5 de 6 escenarios (Δ ≤ 10 LOC);
  la única diferencia material es C6 (−68), donde Angular elimina template +
  componente + spec.
- **Archivos: Angular consistentemente +1 a +3** por escenario, siempre por la
  separación física ts/html/spec. Es estructura, no volumen.

## 10. Trabajo accidental vs trabajo funcional

Metodología (heurística documentada, reproducible en el script): cada archivo
cambiado se clasifica como **domain** (`packages/domain`), **framework**
(archivos que existen solo por la estructura del framework: templates `.html`,
boilerplate de componente, integración de estado store/hook/adapter, shell de
la app, estilos, specs de componente) o **mixed** (lógica agnóstica
co-localizada con uso del framework: `.tsx`, `filters.ts`, tests de store).

LOC neta por clase (por escenario):

| Escenario | domain | framework | mixed | framework % |
| --------- | -----: | --------: | ----: | ----------: |
| C1        |      0 |      +302 |  +214 |        59 % |
| C2        |      0 |       +46 |   +51 |        47 % |
| C3-BUG    |      0 |       +10 |   +18 |        36 % |
| C3-FIX    |      0 |         0 |    −4 |         0 % |
| C4        |      0 |        +9 |   +11 |        45 % |
| C5        |      0 |       +36 |   +25 |        59 % |
| C6        |      0 |      −168 |   −32 |        84 % |

Interpretación (sin juicio de valor): el trabajo clasificado como _framework_
proviene mayoritariamente de la estructura Angular (template + componente) y
del shell de ambas apps; el clasificado como _mixed_ es la lógica de UI
co-localizada de React y los servicios compartidos. **0 % del trabajo fue
domain** en los 6 escenarios: ninguna tarea exigió tocar el dominio — todas se
resolvieron en la capa de presentación/integración, lo que refuerza la
separación de ADR-001. La diferencia "accidental" entre frameworks es de
**granularidad de archivo**, no de LOC: Angular reparte la misma lógica en más
archivos, React la concentra.

## 11. Blast radius

| Escenario | Features React | Features Angular | Unrelated | Domain | Tests |
| --------- | -------------- | ---------------: | --------: | -----: | ----: |
| C1        | board          |            board |         0 |      0 |     4 |
| C2        | tasks          |            tasks |         0 |      0 |     2 |
| C3        | tasks          |            tasks |         0 |      0 |     2 |
| C4        | dashboard      |        dashboard |         0 |      0 |     0 |
| C5        | tasks          |            tasks |         0 |      0 |     2 |
| C6        | settings       |         settings |         0 |      0 |     3 |

- **`unrelated_features_touched = 0` en los 6 escenarios.**
- **0 archivos de domain tocados** (H77: modificación localizada; el dominio
  permanece intacto en todo el experimento).
- La feature Board (C1) añadió 1 archivo al shell de cada app (import +
  sección), sin tocar otras features.

## 12. Tests

- **C3 (bug fix):** 1 test de regresión por framework (React en
  `filters.test.ts`, Angular en `tasks.component.spec.ts`); **ambos fallaron
  con el bug (1 rojo por framework) y ambos pasaron tras el fix**. La suite
  existente NO detectaba el bug (el caso de búsqueda usaba minúsculas) — se
  necesitó 1 test nuevo por framework para capturarlo.
- **C4 (refactor):** 0 tests modificados, 0 rotos — comportamiento idéntico
  verificado por la suite existente.
- **C6 (eliminación):** 1 spec de componente eliminado (Angular) y los specs
  del shell actualizados (6 áreas, preferencia sin control).
- Evolución de la suite: React 84 → 90 (C6, tras −2 de Settings) ; Angular
  61 → 66. Nunca roja salvo el estado C3-BUG deliberado.

## 13. Complejidad

- **Símbolos nuevos:** 1 por framework en C1 (BoardPage / BoardComponent); 0
  en el resto. Las modificaciones y el refactor no introdujeron API nueva.
- **Proxy de ramas** (if/ternario/&&/|| por archivo, aproximación McCabe
  limitada): registrado por escenario en el JSON; los máximos aparecen en los
  archivos de feature (tasks-page/board), no en el shell. No se observa una
  diferencia sistemática entre frameworks en el proxy.

## 14. Invariantes arquitectónicas

Verificadas en el estado final (C6):

- **0 imports feature→feature** (escaneo automático).
- **0 reglas de dominio duplicadas** (escaneo de nombres de reglas del
  dominio en las apps).
- **0 dependencias nuevas** (diff de package.json vacío entre BASELINE y C6).
- **Domain sin imports de apps/frameworks.**
- ADR-001 / ADR-002 intactos; las decisiones de estado (ADR-002) no se
  tocaron: React siguió con `useSyncExternalStore` y Angular con Signals.

## 15. Diferencias significativas vs ruido

**Significativas (reproducibles en dirección):**

1. **Archivos por escenario:** Angular +1 a +3 vs React en los 6 escenarios —
   consistente, explicado por la estructura física (ts + html + spec). Es la
   diferencia más robusta del experimento.
2. **LOC eliminadas en C6:** Angular −134 vs React −66 — Angular borra más
   porque elimina dos artefactos por componente.
3. **LOC por escenario: equivalente** (Δ ≤ 10) — el hallazgo contrario, igual
   de robusto.

**Ruido / no concluyente:**

- El proxy de ramas y los símbolos nuevos (0 en 5 de 6 escenarios) no
  distinguen frameworks.
- La clasificación framework/mixed es sensible a la granularidad de archivo:
  mover una condición de un `.html` a un `.ts` cambiaría el reparto sin
  cambiar el trabajo real.

## 16. Correlación con F8/F11/F12

- **F8 (escalabilidad):** confirma que el coste por feature es estable y
  equivalente; C1 (feature nueva) reproduce el patrón con LOC casi idénticas
  y el mismo aislamiento (0 unrelated).
- **F11 (evolución del dominio):** F11 mostró que el breaking change recae en
  consumidores; F13 muestra que las tareas de _presentación_ (6 de 6) no
  tocan el dominio en absoluto — consistente y complementario.
- **F12 (migración gradual):** F12 mostró que solo los puntos de integración
  (adapter+store) construyen el contrato; F13 confirma que la mayoría del
  trabajo de mantenimiento se queda en la capa de UI/features, agnóstica al
  contrato.
- **F9.x/F10 (rendimiento):** sin contradicción — los proxies estructurales
  de F13 no miden rendimiento; no hay solapamiento de métricas.

**No hay contradicciones con ninguna fase anterior.**

## 17. Qué aprendemos

1. El coste de mantenimiento **por volumen (LOC) es equivalente**; la
   diferencia estructural es la **granularidad de archivos** de Angular.
2. El **ciclo de depuración fue simétrico** (C3): mismo bug, misma distancia
   causa→síntoma (1 capa), mismo test de regresión, mismo fix de 1 línea.
3. El **refactor sin cambio funcional es invisible** en ambos (C4): 0 tests
   tocados, 0 regresiones, y el refactor de datos + un único punto de render
   es igual de natural en `map` (React) que en `@for` (Angular).
4. **Eliminar una feature es limpio en ambos** (C6): 0 referencias residuales
   funcionales; solo quedan menciones documentales en comentarios/tests.
5. La capa de presentación es donde vive el coste de mantenimiento; el
   dominio no se tocó en ningún escenario.

## 18. Qué NO puede concluir este experimento

- No mide productividad humana real (`time_to_implement` NO MEDIBLE).
- No mide aprendizaje del framework ni experiencia subjetiva del desarrollador.
- No mide calidad de código subjetiva.
- No generaliza a otros proyectos/equipos/monorepos: es un laboratorio con una
  sola implementación por framework.
- No demuestra superioridad global de ningún framework.
- No convierte "más archivos" en "peor": la separación física de Angular puede
  ser una ventaja de organización; el experimento solo la mide.

## 19. Limitaciones

- Una máquina, un par de implementaciones, un estilo de código; los deltas
  dependen del estilo del experimento.
- La clasificación accidental vs funcional es heurística (por archivo), no
  análisis semántico; los `.tsx` mezclan lógica y JSX y se marcan `mixed`.
- El proxy de complejidad es una aproximación McCabe limitada.
- Escenarios acumulativos: C1 añade Board y no se elimina; el orden puede
  influir en el estado final (no en los deltas por transición).
- C3 midió el ciclo con un bug deliberadamente equivalente; la localización
  real por un humano con contexto no está medida.

## 20. Artefactos

- `scripts/measure-maintainability-phase13.mjs` (node + git, 0 dependencias)
- `docs/experiments/results/maintainability-phase13.json` (evidencia cruda)
- `docs/experiments/maintainability-phase13.md` (este informe)
- `docs/experiments/README.md` (índice) · `package.json` (`maintainability:measure`)
- Copia experimental `/tmp/lab-phase13`: `1422b49 → 7dcbc07 (C1) → 71bf655 (C2)
→ 3f4b527 (C3-BUG) → 924bd64 (C3-FIX) → 51ec350 (C4) → a029bd9 (C5) →
36ce86f (C6)`

## 21. Validaciones

`pnpm format` ✅ · `pnpm format:check` ✅ (solo el warn pre-existente del JSON
de Fase 11, no tocado) · `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅
(React 90, Angular 66, Domain 103) · `pnpm build` ✅ · `pnpm maintainability:measure` ✅

Árbol principal: solo los 5 artefactos del experimento; apps/domain/ADRs/
contratos/bundles oficiales intactos (React 233 547 B / Angular 179 634 B).
Sin commit.

## 22. Siguiente experimento recomendado

1. **Mantenimiento con instrumentación de rendimiento** (repetir C2/C5 sobre
   datasets grandes midiendo settle/INP): unir coste estructural (F13) con
   coste de runtime (F9/F10) para ver si la granularidad de archivos de
   Angular o la co-localización de React tienen correlato en rendimiento.
2. **Tareas de depuración múltiples** (3 bugs de distinta profundidad: UI,
   servicio, dominio): medir la distancia causa→síntoma media cuando el bug
   está en el dominio y no en la presentación.
3. **Migración de una feature entre frameworks** (Board de React a Angular y
   viceversa): el coste de portar una feature existente es la dimensión de
   mantenibilidad que este diseño (implementaciones paralelas) no mide.
