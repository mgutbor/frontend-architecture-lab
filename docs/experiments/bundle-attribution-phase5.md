# Bundle Attribution — Fase 5.3

- **Estado:** Completado (Fase 5.3 — atribución de bundle)
- **Evidencia cruda:** [results/bundle-attribution-phase5.json](./results/bundle-attribution-phase5.json)
- **Herramienta:** [scripts/analyze-bundle.mjs](../../scripts/analyze-bundle.mjs) (0 dependencias nuevas)
- **Documentos relacionados:** [angular-monolith-phase5](./angular-monolith-phase5.md) (H2 refutada), [react-monolith-phase4](./react-monolith-phase4.md), [react-vs-angular-phase5](../comparisons/react-vs-angular-phase5.md) (Fase 5.2), [metrics](./metrics.md)

## 1. Objetivo

Investigar de forma reproducible y objetiva la composición del bundle de React Monolith y Angular Monolith para explicar, hasta donde permitan las herramientas disponibles, la diferencia observada en el **incremento** de bundle:

- React incremental JS raw: **+24 985 B**
- Angular incremental JS raw: **+43 013 B**
- Diferencia incremental: **+18 028 B**

Esta fase **no optimiza, no modifica código funcional, no introduce code splitting ni dependencias nuevas**. Produce evidencia, no cambios.

## 2. Pregunta experimental

> ¿Qué componentes del bundle explican la diferencia de +18 028 B raw entre el incremento de Angular y React al implementar el mismo contrato funcional?

Sub-preguntas:

1. ¿Cuánto pesa el runtime del framework en cada monolith?
2. ¿Cuánto pesa el código propio de aplicación en cada monolith?
3. ¿Cuánto pesa el dominio compartido (incluido el fixture)?
4. ¿Cuánto pesan los templates compilados AOT en Angular?
5. ¿Qué parte del incremento (baseline → monolith) puede atribuirse a cada categoría?

## 3. Estado previo / H2

En Fase 5.1 se midió que el incremento JS raw de Angular (+43 013 B, +31.5%) supera al de React (+24 985 B, +12.0%), **refutando H2** (que esperaba un incremento menor o comparable por la compilación AOT de templates). En Fase 5.2 se concluyó que el _hecho_ estaba medido pero la _causa_ era desconocida: los datos no permitían atribuir los bytes a runtime, templates, componentes, CSS, código propio o tooling. **Esta fase ataca exactamente esa brecha.**

## 4. Entorno

| Variable     | Valor                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| SO           | macOS (darwin-arm64)                                                                                                          |
| CPU / RAM    | Apple M1 (8 cores) / 16 GiB                                                                                                   |
| Node.js      | v25.3.0                                                                                                                       |
| pnpm         | 10.34.5                                                                                                                       |
| React / Vite | 19.2.8 / 8.2.2 (rolldown)                                                                                                     |
| Angular      | 21.2.x (@angular/build:application)                                                                                           |
| Dataset      | `operations-hub-v1.json` (v1, congelado)                                                                                      |
| Builds       | Producción; React con `vite build --sourcemap`, Angular con `ng build --stats-json` (flags CLI reversibles, sin tocar config) |

Versiones verificadas idénticas entre baseline y monolith (`git show 8e77738:<pkg>/package.json` == actual) y fixture congelado (md5 idéntico).

## 5. Herramientas utilizadas

| Herramienta                  | Disponibilidad                                                | Uso                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ng build --stats-json`      | Flag CLI de Angular 21 (sin dependencia nueva)                | Genera un **metafile esbuild** (`stats.json`) con `outputs[].inputs[].bytesInOutput`: bytes minificados exactos por módulo de entrada.         |
| `vite build --sourcemap`     | Flag CLI de Vite 8 (sin dependencia nueva)                    | Genera el source map de producción con `sources` + `sourcesContent`.                                                                           |
| Decodificador VLQ propio     | Implementado en `scripts/analyze-bundle.mjs` (Node built-ins) | Aproxima la contribución minificada por fuente desde los `mappings` del source map (heurística de span por línea, estilo source-map-explorer). |
| Medición de span del fixture | Implementada en el script                                     | El VLQ infra-cuenta los literales de datos (objeto JSON embebido sin segmentos por campo); se mide el span real en el bundle y se corrige.     |
| `zlib` de Node               | Built-in                                                      | gzip/brotli con nivel por defecto (misma metodología que `metrics.md`).                                                                        |

**Lo que NO estaba disponible (comprobado):** Vite 8 usa rolldown, que **no expone metafile** (grep de `metafile` en los tipos de rolldown: 0 resultados). No existe `source-map` en node_modules. **No se instaló ninguna dependencia.**

## 6. Metodología

**Clasificación de categorías** (explícita y consistente entre frameworks donde es posible):

| Categoría                   | Definición                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework/runtime           | React: `react` + `react-dom` + `scheduler`. Angular: `@angular/core` + `@angular/common` + `@angular/platform-browser`.                                                                                                                             |
| Código propio de aplicación | `src/` de cada app (features, componentes, stores, services, adapters, app shell).                                                                                                                                                                  |
| Dominio compartido          | Módulos de `packages/domain/dist` (rules, validation, transitions, reports, fixture loader) **+ el fixture JSON embebido**.                                                                                                                         |
| Dependencias externas       | `rxjs` (Angular); `tslib` (si apareciera).                                                                                                                                                                                                          |
| CSS                         | Hojas de estilo de producción (separadas del JS).                                                                                                                                                                                                   |
| Generado/compilado          | Angular: los templates AOT se compilan **dentro** de los módulos `.component.ts` (no existe módulo separado); React: JSX se compila a llamadas `jsx()` del runtime. Se mide lo que el metafile/source map permite; el resto se marca NO ATRIBUIBLE. |
| No atribuible               | Código sin fuente en el mapa (preámbulos Vite, header esbuild, código generado sin segmento).                                                                                                                                                       |

**Dos métodos, dos precisiones (documentadas):**

- **Angular (exacto):** el metafile esbuild (`stats.json`) da `bytesInOutput` por módulo de entrada — atribución exacta del JS minificado. Suma atribuida: 179 191 de 179 634 B (443 B de header esbuild no atribuibles a un módulo).
- **React (aproximado):** el source map de producción no da bytes por módulo; se decodifican los `mappings` VLQ y se atribuye el span de cada segmento hasta el siguiente de su línea. Es la heurística clásica (source-map-explorer): determinista y reproducible, pero **sobre-atribuye al runtime** (código generado sin segmento se pega a la última fuente) e **infra-atribuye literales de datos**. El fixture JSON (objeto literal embebido, 9 335 B medidos por span) se corrige explícitamente dentro de `@operations-hub/domain`.

**Comparación incremental:** se usa el supuesto, verificado por versiones idénticas, de que el **runtime del framework es esencialmente constante** entre baseline y monolith (mismas versiones de React/Angular y de bundler). Por tanto, el incremento (baseline → monolith) ≈ crecimiento de app code + dominio + CSS, con margen de crecimiento de runtime por APIs nuevas (no cuantificable sin metafile del baseline). **La composición del baseline no es medible**: en Fase 2 no se generaron metafiles ni source maps, y los `dist` del baseline fueron sobrescritos. Reconstruirla exigiría revertir el árbol de trabajo (prohibido). Se marca explícitamente.

## 7. React

**Bundle:** `index-CD8mnuHw.js` = **233 590 B raw** / 68 610 B gzip / 59 002 B brotli (1 chunk) · CSS 3 666 B raw.

> Nota de consistencia: la medición oficial de Fase 5.1 fue 233 547 B raw (build sin sourcemap). El comentario `//# sourceMappingURL=` añade 43 B al build de análisis. Las proporciones son idénticas; los totales oficiales se usan para los deltas.

| Categoría                                           | Minificado (VLQ, aprox.) |  % JS | Original (sourcesContent) |
| --------------------------------------------------- | -----------------------: | ----: | ------------------------: |
| react runtime (react+react-dom+scheduler)           |                214 561 B | 91.9% |                 574 367 B |
| @operations-hub/domain (código + fixture corregido) |                 11 322 B |  4.8% |                  34 601 B |
| app code (`src/`)                                   |                 16 176 B |  6.9% |                  61 215 B |
| No atribuible                                       |                    866 B |  0.4% |                         — |
| **Total**                                           |            **233 590 B** |  100% |                         — |

**Observaciones:**

- El **runtime de React domina el bundle** (≈92%): react-dom-client es la pieza dominante. El código propio de la app es una fracción pequeña del total.
- El fixture JSON embebido (9 335 B medidos por span) está contado dentro del dominio.
- El VLQ es una **aproximación**: el app code real probablemente esté entre 16 kB (VLQ, infra) y ~26 kB (consistente con el delta incremental suponiendo runtime constante). Se reporta el valor VLQ con su límite; el rango se discute en §10.

**Módulos principales** (fuentes del mapa): `react-dom-client.production.js` (536 kB originales), `react.production.js`, `scheduler.production.js`; app code: `tasks-page.tsx` (7.7 kB), `project-form.tsx` (6.4 kB), `projects-page.tsx` (5.7 kB), `task-form.tsx` (5.7 kB), `domain-store.ts` (8.3 kB), `teams-page.tsx` (5.6 kB).

## 8. Angular

**Bundle:** `main-4QCSDYDC.js` = **179 634 B raw** / 53 485 B gzip / 47 348 B brotli (1 chunk) · CSS 3 438 B raw.

| Categoría                                 | Minificado (metafile, exacto) |  % JS |
| ----------------------------------------- | ----------------------------: | ----: |
| @angular/core                             |                      98 324 B | 54.7% |
| app code (`src/app/`)                     |                      44 142 B | 24.6% |
| @operations-hub/domain (código + fixture) |                      16 438 B |  9.2% |
| @angular/platform-browser                 |                      11 321 B |  6.3% |
| rxjs                                      |                       8 634 B |  4.8% |
| @angular/common                           |                         298 B |  0.2% |
| entry (main.ts)                           |                          34 B |  0.0% |
| header esbuild (no atribuible a módulo)   |                         443 B |  0.2% |
| **Total**                                 |                 **179 634 B** |  100% |

**Desglose del app code (exacto, 44 142 B):**

| Subcategoría                                        |    Bytes | % app code |
| --------------------------------------------------- | -------: | ---------: |
| Componentes con templates AOT compilados            | 37 150 B |  **84.2%** |
| Otros `.ts` (app shell, forms fuera de componentes) |  3 564 B |       8.1% |
| Domain store                                        |  3 277 B |       7.4% |
| Adapter                                             |    151 B |       0.3% |

**Módulos principales** (bytesInOutput): `tasks.component.ts` 5 806 B, `projects.component.ts` 4 958 B, `project-form.component.ts` 4 856 B, `task-form.component.ts` 4 629 B, `reports.component.ts` 4 456 B, `teams.component.ts` 4 112 B, `domain.store.ts` 3 277 B, `app.ts` 3 003 B.

**Observaciones:**

- El **runtime Angular** (@angular/core + platform-browser + common) = **109 943 B** (61.2%): casi la mitad del peso relativo del runtime React en su bundle.
- El **app code** (44 142 B) es la segunda categoría y está **dominado por los componentes con templates AOT compilados (84.2%)**: cada componente empaqueta lógica TS + template compilado a instrucciones `ɵɵ*`.
- El dominio (16 438 B) incluye el fixture JSON (9 259 B en el metafile).
- La atribución es **exacta** (metafile esbuild): 99.8% del bundle atribuido a módulos.

## 9. Comparación incremental

**Supuesto verificado:** runtime del framework constante entre baseline y monolith (mismas versiones; §4). La composición del baseline NO es medible (sin artefactos de Fase 2; §6).

| Categoría                  | React baseline |  React monolith |       Δ React | Angular baseline |   Angular monolith |     Δ Angular |          Δ Angular−React |
| -------------------------- | -------------: | --------------: | ------------: | ---------------: | -----------------: | ------------: | -----------------------: |
| Framework/runtime          |    no medible* | 214 561 B (VLQ) |             — |      no medible* | 109 943 B (exacto) |             — |    −104 618 B (monolith) |
| Código propio (app)        |    no medible* |  16 176 B (VLQ) |             — |      no medible* |  44 142 B (exacto) |             — | **+27 966 B** (monolith) |
| Dominio (código + fixture) |    no medible* |        11 322 B |             — |      no medible* |           16 438 B |             — |      +5 116 B (monolith) |
| Dependencias (rxjs)        |              — |               — |             — |      no medible* |            8 634 B |             — |                 +8 634 B |
| CSS                        |          119 B |         3 666 B |      +3 547 B |            119 B |            3 438 B |      +3 319 B |                   −228 B |
| **Total JS**               |  **208 562 B** |   **233 547 B** | **+24 985 B** |    **136 621 B** |      **179 634 B** | **+43 013 B** |            **+18 028 B** |

\* No medible: no se generaron metafiles/source maps en Fase 2 y los `dist` del baseline fueron sobrescritos; reconstruirlos exigiría modificar el árbol de trabajo.

**Lectura del monolith (lo medible):**

- En el monolith, el **app code de Angular es 2.7× el de React** (44 142 vs 16 176 B, y aun tomando el límite superior plausible de React ~26 kB, Angular es ~1.7×). Con LOC casi idénticos (2 331 vs 2 198), Angular produce **más bytes de JS minificado por LOC de feature**.
- El **84% del app code de Angular son componentes con templates AOT compilados** (37 150 B): la separación HTML/TS no reduce el JS emitido — el template se compila a instrucciones dentro del componente.
- El **runtime de Angular es ~105 kB menor** que el de React en el monolith (109 943 vs 214 561 B VLQ): React paga el peso en el runtime base (ya incluido en el baseline), Angular lo reparte entre runtime menor y más código compilado por feature.
- El dominio difiere en ~5 kB (Angular 16 438 vs React 11 322 B), con el fixture (≈9.3 kB) presente en ambos.

## 10. Atribución de los +18 028 B

### Respuesta directa: ¿podemos explicar los +18 028 B?

**PARCIALMENTE EXPLICADA.**

**Lo que la evidencia permite afirmar:**

1. **La diferencia incremental se concentra en el código de aplicación, no en el runtime ni en las dependencias.** En el monolith, Angular tiene +27 966 B de app code que React (44 142 vs 16 176), mientras que su runtime es −104 618 B. Como el runtime del framework es una base constante (mismas versiones en baseline y monolith), el **incremento** (baseline → monolith) de cada app está dominado por el app code nuevo + dominio + CSS — y ahí Angular pesa más.
2. **Dentro del app code de Angular, el 84.2% (37 150 B) está en componentes con templates AOT compilados.** Esto es consistente con la hipótesis de que el coste incremental de Angular por feature incluye el peso de los templates compilados a instrucciones `ɵɵ*`, frente al JSX de React que se compila a llamadas `jsx()` del runtime ya presente. **Es una correlación medible (metafile exacto), no una causalidad demostrada** (ver §12).
3. **La contribución del dominio a la diferencia es menor** (~5 kB en el monolith; el fixture ≈9.3 kB está en ambos y no explica el incremento).
4. **El runtime no explica el incremento**: React ya lo tenía en el baseline (bundle base 208 562 B dominado por react-dom); Angular lo tiene más pequeño. La diferencia de +18 028 B incremental no se debe a que Angular pague más runtime — de hecho paga mucho menos.

**Lo que NO se puede afirmar con los datos disponibles:**

- **Cuántos bytes exactos de los +18 028 B son templates compilados vs lógica TS vs crecimiento de runtime por APIs nuevas.** El metafile de Angular es por módulo de entrada (`.component.ts` = lógica + template juntos); no existe desglose template/lógica dentro del módulo. Sin metafile del baseline, el reparto incremental exacto por categoría es NO MEDIBLE.
- El valor VLQ de React es aproximado (sesgo de sobre-atribución al runtime / infra al app code); el app code real de React está entre ~16 y ~26 kB.

**Cálculo de consistencia (no atribución):** si el runtime es constante y el fixture estaba ya en el baseline (Fase 2 cargaba `loadFixture()`), el delta JS de React (+24 985 B) ≈ app code nuevo + dominio nuevo; el de Angular (+43 013 B) ≈ app code nuevo + dominio nuevo + posible runtime extra por APIs nuevas (input/output/model/signal — no cuantificable). La **diferencia entre deltas (+18 028 B) es coherente con la diferencia de app code del monolith (+27 966 B)** una vez compensada por el menor runtime de Angular y el dominio: el mayor peso de app code de Angular explica la mayor parte del incremento, y el runtime menor de Angular lo compensa parcialmente en el bundle absoluto (179.6 vs 233.5 kB).

## 11. Resultado de H2

**H2 sigue REFUTADA (el hecho medido no cambia), y ahora está PARCIALMENTE EXPLICADA.**

- El hecho (Angular +43 013 B vs React +24 985 B incremental) se mantiene.
- La explicación parcial: el incremento de Angular está dominado por un **app code ~2.7× mayor** que el de React (44 142 vs 16 176 B en el monolith), concentrado al 84% en **componentes con templates AOT compilados**; el runtime de Angular es ~105 kB menor y no es la causa del incremento.
- La expectativa original de H2 («la AOT reducirá el incremento») no se sostiene: la AOT no elimina el coste de los templates, lo **compila dentro de los componentes**; y como cada feature Angular genera más JS por LOC de feature que React, el incremento por feature es mayor.
- **NO CONCLUYENTE** en la cuantificación exacta: el reparto template vs lógica vs runtime dentro del incremento requiere un metafile del baseline o un desglose del compilador AOT (ver §15).

## 12. Limitaciones

- **Asimetría metodológica:** Angular usa metafile esbuild (exacto); React usa source-map VLQ (aproximado). No existe metafile para Vite 8/rolldown (comprobado). Las categorías React tienen error de ±5-10 kB en el app code.
- **Composición del baseline no medible:** no se generaron artefactos de composición en Fase 2; los `dist` fueron sobrescritos. La tabla incremental de §9 solo tiene totales de baseline y composición de monolith.
- **Template vs lógica TS en Angular:** el metafile es por módulo; los templates AOT se compilan dentro de los `.component.ts`. No se puede aislar el peso del template sin compilar una variante sin template (experimento futuro).
- **El fixture JSON** (≈9.3 kB) está embebido en ambos bundles y contado dentro del dominio; no explica la diferencia incremental.
- **El header esbuild** (443 B) y los 866 B no atribuidos de React son ruido de metodología, no composición.
- **Los 43 B extra** del build React con sourcemap frente a la medición oficial no alteran las proporciones.
- **La correlación templates ↔ mayor app code es medible pero no es causalidad demostrada** (§10): no se ha aislado el template del resto del componente.
- gzip/brotli con `zlib` de Node (nivel por defecto), consistente con `metrics.md`.

## 13. Qué NO podemos concluir

- ~~«Los templates explican los +18 028 B»~~ — son la mayor categoría correlacionada (84% del app code Angular), pero no hay desglose template/lógica; la cuantificación exacta es NO MEDIBLE con las herramientas disponibles.
- ~~«Angular tiene peor tree-shaking»~~ — no hay evidencia de ello; la diferencia está en app code por feature, no en runtime no usado incluido.
- ~~«React tiene mejor bundle»~~ — React gana en incremento pero pierde en absoluto (233.5 vs 179.6 kB); el bundle no determina superioridad arquitectónica.
- ~~«Más bytes implican peor arquitectura»~~ — sin relación causal; la arquitectura de ambos cumple ADR-002 (Fase 5.2).
- ~~«La AOT elimina el coste de los templates»~~ — refutado: la AOT compila los templates dentro de los componentes, no los elimina.
- ~~«El incremento de Angular se debe a su runtime»~~ — falso: el runtime de Angular es ~105 kB menor que el de React.

## 14. Conclusión

1. **H2 refutada y parcialmente explicada.** El incremento de bundle de Angular supera al de React porque **el código de aplicación de Angular pesa ~2.7× el de React** (con LOC casi idénticos), y ese app code está **dominado (84%) por componentes con templates AOT compilados**. El runtime de Angular es mucho menor y no explica el incremento.
2. **La causa estructural identificada:** la distribución del peso es distinta — React concentra el peso en el runtime base (ya pagado en el baseline), Angular reparte más peso en el código compilado por feature. Eso explica que el _incremento_ de Angular sea mayor mientras su _absoluto_ es menor.
3. **Nivel de resultado: PARCIALMENTE EXPLICADA.** Se identifica la categoría dominante (app code / templates AOT) con evidencia exacta (metafile) y consistencia con el delta; la cuantificación fina (bytes exactos de templates vs lógica, reparto incremental del baseline) queda **NO ATRIBUIBLE con las herramientas disponibles** y se documenta.
4. **Sin cambios funcionales:** 0 modificaciones en apps, domain, fixture, contratos, ADRs, métricas históricas o hipótesis. Solo se añadieron el script de análisis, el JSON de evidencia y este documento.

## 15. Próximo experimento

1. **Desglose template vs lógica (Angular):** compilar una variante de los componentes con templates vacíos (en un worktree separado, sin tocar el árbol) y medir la diferencia de bytesInOutput por componente. Aislaría los bytes exactos de los templates AOT.
2. **Metafile del baseline:** regenerar la composición del baseline en un worktree del commit `8e77738` (o `abd78e3`) con `ng build --stats-json` y `vite build --sourcemap`, para convertir la tabla incremental de §9 en atribución incremental completa. Esto responde cuánto creció cada categoría exactamente.
3. **Runtime puro vs incremental:** medir el runtime Angular con solo `bootstrapApplication` sin features, para separar el crecimiento de runtime por APIs nuevas del app code.
4. **Lighthouse en CI/Chromium** (heredado de H8): sigue pendiente y es independiente del bundle.

## Anexo — Reproducibilidad

```bash
# 1. Rebuild de análisis (flags CLI reversibles, sin tocar config)
pnpm --dir apps/angular-app exec ng build --stats-json   # genera dist/angular-app/stats.json
pnpm --dir apps/react-app exec vite build --sourcemap      # genera dist/assets/*.js.map

# 2. Análisis (0 dependencias nuevas)
node scripts/analyze-bundle.mjs
# → docs/experiments/results/bundle-attribution-phase5.json
```

El script es determinista (misma entrada → misma salida). Verificado: `git status` sin cambios en dist (ignorado), sin dependencias nuevas, sin modificaciones de configuración persistente.
