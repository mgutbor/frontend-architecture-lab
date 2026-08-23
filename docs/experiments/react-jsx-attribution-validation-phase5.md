# Fase 5.7 — Validación de la estimación del coste de JSX en React

## 1. Objetivo

Resolver la principal limitación de la Fase 5.6: conseguir **al menos un segundo punto independiente y fiable de conversión fuente → minificado** para el coste de JSX, y comprobar si la extrapolación de Fase 5.6 (13 514–21 623 B de JSX) es razonable.

No se amplía el experimento a todas las features. No se modifica código funcional del repositorio. No se crean conclusiones anticipadas: si el segundo punto no fuera medible de forma fiable, se documentaría y se detendría.

## 2. Evidencia previa

| Fuente                                              | Hallazgo relevante                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-jsx-cost-phase5.md` / `.json`                | Dashboard: único componente con VLQ utilizable (870 segmentos; −1 121 B minificados / −1 025 B fuente, ratio 1,09). Tasks: 0 segmentos VLQ. Extrapolación 13 514–21 623 B (solo fuente). |
| `aot-template-cost-phase5.md`                       | Angular: templates medibles en minificado exacto (metafile), ratio por LOC estable (36–40 B/LOC).                                                                                        |
| `baseline-attribution-phase5.md`                    | El source map de rolldown del baseline tenía 0 segmentos de app; la VLQ es aproximada y con cobertura parcial.                                                                           |
| `analyze-react-jsx-cost.mjs` / `analyze-bundle.mjs` | Mecanismo VLQ + `sourcesContent`; keeper experimental para mantener la lógica viva.                                                                                                      |
| `react-vs-angular-phase5.md`                        | Diferencia de app code +11 586 B; no atribuida automáticamente.                                                                                                                          |

## 3. Limitación que intenta resolver

- Solo **dashboard** tenía atribución minificada (VLQ): un único punto de conversión fuente→minificado.
- **Tasks** no tenía segmentos VLQ utilizables.
- La estimación global (13,5–21,6 kB) se basaba principalmente en LOC y en un solo ratio de conversión (~1,1×).

**Hallazgo previo a la selección (comprobado):** el source map de rolldown solo tiene segmentos VLQ para **dashboard-page entre las páginas de feature**; teams-page, projects-page, reports-page, settings-page, project-detail, project-form, task-form y App.tsx tienen **0 segmentos**. Los únicos componentes con JSX y segmentos son compartidos y diminutos (kpi-card 616 segmentos, feedback 263, empty-state 85, status-badge 62, priority-badge 29).

Consecuencia: **ninguna feature adicional puede proporcionar un punto VLQ**. El segundo punto debe usar otro mecanismo.

## 4. Componente seleccionado

**teams-page.tsx** — complejidad intermedia.

| Atributo                               | Valor                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOC TS/JS total                        | 156                                                                                                                                                |
| JSX LOC (bloque return, líneas 66–156) | **91**                                                                                                                                             |
| Lógica                                 | 5 `useMemo` (selected, members, teamProjects, addableUsers, otherTeams), 2 handlers (handleAddMember, handleMoveMember) + teamCounts, 2 `useState` |
| Condiciones                            | 1 ternaria (`selected ? detalle : estado vacío`)                                                                                                   |
| Listas                                 | 5 (`teams`, `members`, `otherTeams`, `teamProjects`, `addableUsers`)                                                                               |
| Eventos                                | `onClick` (selección) + 3 `onChange` (mover, añadir)                                                                                               |
| Hijos                                  | **solo `Feedback`** (compartido con otras features)                                                                                                |
| Tamaño del módulo en A (fuente)        | 5 568 B                                                                                                                                            |

**Por qué es un buen segundo punto:** importa únicamente un componente compartido → al reducir su JSX **no hay cascada** (no se elimina ningún módulo) → el delta de bundle A→B es **exacto** y mide exclusivamente el JSX de teams-page. Es más fiable que la VLQ (que es aproximada), aunque no permite la columna VLQ (0 segmentos). Cumple "no es Dashboard ni Tasks" y tiene complejidad intermedia con lógica separable.

## 5. Metodología

Experimento A/B en directorio temporal (`/tmp/lab-react-jsx-v`, copia verificada idéntica con `diff -r`):

- **A — REAL**: React Monolith sin cambios. Reproduce 233 590 B con `--sourcemap` (233 547 B oficial; mismo hash `index-CD8mnuHw.js`).
- **B — JSX-MINIMAL**: teams-page con JSX mínimo (`<section aria-label="Teams" data-page="teams" />`), **misma lógica TS/JS** (los 5 `useMemo`, 2 handlers, teamCounts, 2 `useState`, imports intactos), más el **keeper** `TeamsPage.__keepAlive` (misma técnica que Fase 5.6: referencia los 10 valores/handlers para que el minificador no elimine lógica — en React, a diferencia de Angular, la lógica no referenciada sí se elimina).

**Verificación empírica (validez):** los strings de los handlers (`added to `, `moved to `) están presentes en B → la lógica sobrevivió; el string JSX (`Select a team to see`) está ausente en B → el JSX se eliminó. `feedback`, `dashboard-page` y `tasks-page` sin cambios (orig idéntico) → sin cascada ni efectos colaterales.

**Atribución:** por componente, `sourcesContent` (fuente exacta); minificado, **delta de bundle exacto** (sin cascada). VLQ no aplicable (0 segmentos). gzip/brotli con Node zlib.

## 6. Variantes

| Métrica   |  A (real) | B (minimal) |           Δ A→B |
| --------- | --------: | ----------: | --------------: |
| JS raw    | 233 590 B |   231 860 B |    **−1 730 B** |
| JS gzip   |  68 610 B |    68 362 B |          −248 B |
| JS brotli |  59 002 B |    58 772 B |          −230 B |
| Módulos   |        40 |          40 | 0 (sin cascada) |

## 7. Resultados

- **Δ bundle A→B: −1 730 B minificados (exacto).**
- **teams-page fuente: 5 568 → 2 728 = −2 840 B** (orig, exacto).
- **Sin cascada**: `feedback` (391 B), `dashboard-page` (2 100 B) y `tasks-page` (7 676 B) idénticos en A y B.
- Overhead del keeper: decenas de bytes en B (documentado; infra-estima el delta JSX en ese margen).

## 8. Atribución

| Componente               | JSX LOC | Δ fuente |          Δ minificado | Ratio min/source | VLQ                        |
| ------------------------ | ------: | -------: | --------------------: | ---------------: | -------------------------- |
| **Dashboard** (Fase 5.6) |      28 | −1 025 B |              −1 121 B |         **1,09** | 870 segmentos (aproximado) |
| **Teams** (Fase 5.7)     |      91 | −2 840 B | **−1 730 B** (exacto) |         **0,61** | 0 segmentos (bundle-delta) |

**Hallazgo principal:** los dos puntos de conversión fuente→minificado **divergen** (1,09 vs 0,61; 40 vs 19 B/LOC minificado). La conversión **no es estable entre componentes**. Posibles causas (no demostradas): densidad de JSX distinta (dashboard concentra props/componentes por línea; teams tiene más DOM con texto), el keeper (más referencias en teams), y la propia imprecisión de la VLQ de dashboard.

## 9. Comparación con Fase 5.6

La tabla anterior actualiza la comparación pedida. **Tasks se mantiene fuera de cualquier cálculo cuantitativo que requiera VLQ** (0 segmentos), como en Fase 5.6. El punto de teams es **más fiable** que el de dashboard (método exacto sin VLQ), lo que refuerza la validez del segundo punto, pero revela que la relación "JSX eliminado → bytes fuente → bytes minificados" **no es lineal ni estable** entre componentes.

## 10. Reevaluación de H10

Criterios explícitos (propuesta del enunciado):

| #   | Criterio                                                                | Estado | Evidencia                                                                                                                        |
| --- | ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ≥2 componentes independientes con reducción al eliminar JSX             | ✅     | Dashboard (−1 121 B VLQ) y Teams (−1 730 B exacto); tasks dentro del experimento 5.6                                             |
| 2   | Lógica funcional relevante viva                                         | ✅     | Keepers en ambos experimentos; strings de handlers presentes en B (`added to`, `moved to`, `Task moved to`, `Assignee updated.`) |
| 3   | Reducción reproducible                                                  | ✅     | Builds deterministas: variante A = mismo hash en 5.6, 5.7 y oficial                                                              |
| 4   | Atribución no depende exclusivamente de LOC                             | ✅     | Dashboard: VLQ; Teams: delta de bundle exacto (ninguna usa LOC para atribuir)                                                    |
| 5   | Sin señales de reducción por lógica eliminada o tree-shaking accidental | ✅     | Lógica verificada viva; teams sin cascada; cascada de dashboard documentada aparte                                               |

**H10: CONFIRMADA** (se cumplen los 5 criterios). Nota: la magnitud es medible por componente, pero el **ratio de conversión es inestable** (0,61–1,09) — esto limita la extrapolación global, no la confirmación cualitativa de que el JSX es un coste real y medible.

## 11. Reevaluación de la estimación global

La Fase 5.6 estimó **13 514–21 623 B fuente** de JSX en toda la app.

Con dos puntos de conversión la estimación **no puede mejorarse**:

- El ratio fuente→minificado varía entre 0,61 (teams, exacto) y 1,09 (dashboard, VLQ).
- La tasa minificada por LOC JSX varía entre 19,0 y 40,0 B/LOC.
- Aplicar un ratio u otro a los 13,5–21,6 kB fuente produce un rango de **~8,2 a ~23,5 kB minificados** — un rango tan amplio que no constituye una estimación.

**Conclusión: "no tenemos evidencia suficiente para extrapolar la conversión a minificado".** La estimación de Fase 5.6 (en bytes fuente) se mantiene como referencia de orden de magnitud, pero **no se actualiza** y no se convierte a minificado. Dos puntos son demasiado pocos, y además divergentes.

## 12. Impacto sobre el +11 586 B

- **HECHO MEDIDO:** teams (91 líneas JSX) = −1 730 B minificados exactos / −2 840 B fuente; dashboard (28 líneas) = −1 121 B minificados (VLQ) / −1 025 B fuente.
- **INFERENCIA:** el JSX es un coste real, medible y reproducible por componente; la conversión fuente→minificado no es estable (0,61 vs 1,09).
- **HIPÓTESIS:** el +11 586 B de diferencia de app code podría explicarse en parte por el coste de templates AOT (Angular) frente a JSX (React), pero **los datos de 2 puntos no permiten cuantificarlo**.
- **NO SABEMOS:** el total de JSX minificado de la app de React; qué ratio generaliza; la contribución de la lógica TS/JS y de las demás features.

No se asume "Angular templates > React JSX" como explicación automática de los +11 586 B.

## 13. Limitaciones

1. **El segundo punto usa bundle-delta, no VLQ**: fiable solo porque teams no tiene cascada; el método no es aplicable a features con hijos exclusivos (projects-page, task-form, etc.).
2. **Dos puntos divergentes** (0,61 vs 1,09): insuficientes para extrapolar; el rango minificado resultante (~8–24 kB) no es una estimación defendible.
3. **El keeper añade bytes a B** (decenas; más referencias en teams que en dashboard): infra-estima el delta JSX.
4. **La tasa por LOC depende de la definición de JSX LOC** (bloque return); no se asume linealidad.
5. La VLQ de dashboard es aproximada (span-attribution); su ratio (1,09) tiene su propia incertidumbre.
6. Solo 3 componentes medidos en total (dashboard, tasks, teams) de 19 archivos con JSX.

## 14. Amenazas a la validez

1. **Inestabilidad del ratio como efecto real vs metodológico**: la divergencia (0,61 vs 1,09) podría deberse a densidad de JSX, overhead del keeper, o imprecisión de VLQ — no separable con 2 puntos. Se documenta, no se adjudica.
2. **Confusión JSX/lógica**: mitigada con keepers verificados empíricamente (strings de handlers vivos, strings JSX ausentes).
3. **Cascada cero asumida en teams**: verificada (solo Feedback, compartido; orig de feedback/dashboard/tasks idéntico A↔B).
4. **Representatividad**: teams es una feature intermedia; su densidad de JSX puede no representar a projects/reports (más complejas).

## 15. Conclusión

**Se obtuvo el segundo punto** (teams, −1 730 B minificados exactos), cumpliendo el objetivo principal de la fase. El punto es independiente y fiable (método exacto, sin cascada, lógica verificada viva).

**Sin embargo, el experimento muestra que la conversión fuente→minificado no es estable** (0,61 vs 1,09) y que **dos puntos son insuficientes para extrapolar**. La estimación de Fase 5.6 no se mantiene ni se actualiza: se reporta como "no extrapolable a minificado con la evidencia disponible".

En los componentes evaluados se observa que **el JSX es un coste real, medible y reproducible por componente** — no "demostrado que JSX cuesta X kB en React", porque la conversión a toda la app no es defendible.

**H10: CONFIRMADA** (criterios 1–5 cumplidos), con la limitación cuantitativa documentada.

## 16. Siguiente experimento

1. **Comparación completa por features** (extensión de Fase 5.5/5.6 a todas las features de ambos frameworks): es la única vía para convertir la inferencia del +11 586 B en una descomposición cuantificada — o para demostrar que la asimetría de herramientas (metafile vs source map/VLQ) lo impide. Para React, el método bundle-delta solo funciona en features sin cascada; para las demás habría que separar la cascada explícitamente.
2. **Lighthouse en CI/Chromium** (H8, pendiente e independiente): puede ejecutarse sin esperar al cierre de la atribución de bundle.
3. Alternativa para acotar el ratio: medir un componente adicional con cascada nula y VLQ utilizable (no existe entre las features — solo dashboard; los mapeados restantes son compartidos diminutos), lo que confirma que **la VLQ no puede proporcionar más puntos** y refuerza la recomendación 1.
