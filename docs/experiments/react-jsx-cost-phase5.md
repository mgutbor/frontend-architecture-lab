# Fase 5.6 — Aislamiento del coste de JSX en React

## 1. Objetivo

Repetir en React el diseño experimental de la Fase 5.5 (Angular) para cuantificar cuánto del incremento de bundle de React (+24 985 B frente a su baseline, de los que la práctica totalidad es app code según Fase 5.4) corresponde al **JSX compilado** y cuánto a la **lógica TypeScript/JavaScript**.

La finalidad **no** es demostrar que un framework sea mejor: es cerrar experimentalmente la comparación iniciada en Fases 5.2–5.5, respondiendo a:

> ¿Cuánto del coste incremental de app code en React procede del JSX y cómo se compara con el coste equivalente de templates AOT de Angular?

El experimento se ejecutó **exclusivamente** en un directorio temporal (`/tmp/lab-react-jsx`), fuera del árbol principal, con una copia exacta del React Monolith actual. El código funcional real no se ha modificado.

## 2. Pregunta experimental

> ¿Cuántos bytes del app code de React son atribuibles al JSX compilado, y es esa magnitud medible mediante una variante controlada del mismo componente?

Sub-pregunta para la comparación con Angular (Fase 5.5): ¿el coste de JSX de React es comparable, menor o mayor que el coste de templates AOT de Angular para las mismas dos áreas funcionales (Dashboard y Tasks)?

## 3. Evidencia previa

Revisada antes de medir (no se repitió ningún análisis ya resuelto):

| Fuente                                               | Evidencia clave                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 5.5 (`aot-template-cost-phase5.*`)              | Angular: 2 templates (136 LOC) → directo −5 267 B minificados, cascada −5 315 B, total −10 593 B; extrapolación 12 661–28 465 B del app code (34,6–77,8 % del incremento)           |
| Fase 5.4 (`baseline-attribution-phase5.*`)           | React: runtime y domain **constantes** (574 367 y 34 601 B originales idénticos) → delta +24 985 B = app code residual; VLQ del baseline sin segmentos de app (limitación del mapa) |
| Fase 5.3 (`bundle-attribution-phase5.*`)             | React monolith: runtime 214 561 B (91,9 %), app code 16 176 B VLQ (real estimado 16–26 kB); VLQ aproximada, tasks/other sin segmentos                                               |
| `react-vs-angular-phase5.md`                         | Diferencia de app code +11 586 B; bundle absoluto Angular menor                                                                                                                     |
| `analyze-bundle.mjs` / `analyze-bundle-baseline.mjs` | Mecanismo VLQ + corrección de fixture; limitaciones conocidas                                                                                                                       |

**Componentes Angular usados en Fase 5.5:** Dashboard (sencillo) y Tasks (complejo), por tener el JSX/template más y menos complejo y ser espejo funcional en React (dashboard-page 53 LOC, tasks-page 211 LOC).

## 4. Metodología

Tres variantes del **mismo** React Monolith en directorio temporal (`/tmp/lab-react-jsx/apps/react-app`, copia verificada idéntica con `diff -r`), construidas con `vite build --sourcemap` (flag CLI reversible):

| Variante            | Cambio respecto a la real                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — REAL**        | Ninguno. Reproduce el bundle oficial: 233 547 B (sin sourcemap) / 233 590 B (con `--sourcemap`, +43 B del comentario `sourceMappingURL`)                                                     |
| **B — JSX-MINIMAL** | JSX mínimo (`<div data-page="dashboard" />`, `<section aria-label="Tasks" data-page="tasks" />`) en dashboard-page y tasks-page; **misma lógica TS/JS, imports, estado, servicios, dominio** |
| **C — JSX-RICH**    | JSX artificialmente más rico para los 2 componentes (elementos, props, eventos, condiciones, listas, atributos ARIA, composición); misma lógica TS                                           |

**Punto crítico de diseño (diferencia frente a Angular):** en React, el minificador **elimina la lógica local no referenciada** al vaciar el JSX (a diferencia de Angular, donde los miembros de clase sobreviven al quedar la template vacía). Si no se controlara, el delta A→B mezclaría JSX y lógica. Por eso la variante B incluye una línea de **instrumentación "keeper"** por componente (`DashboardPage.__keepAlive`, `TasksPage.__keepAlive`) que referencia toda la lógica (estado, derivados, handlers) para mantenerla viva.

**Verificación empírica del keeper (validez):** los strings distintivos de los handlers (`Task moved to`, `Assignee updated.`, `Task updated.`, `created.`) están presentes en el bundle de B → la lógica sobrevivió al minificado. La cascada se confirmó: `No tasks match` (empty-state, solo usado por tasks) **ausente** en B.

**Atribución:** mismo mecanismo que Fase 5.3/5.4 (source map + VLQ) para categorías y dashboard; `sourcesContent` (bytes originales, **exactos**) para la atribución por componente, porque la VLQ falla para tasks-page (0 segmentos — limitación del mapa, documentada).

## 5. Componentes seleccionados

Espejo de Fase 5.5: un componente sencillo y uno complejo, los dos con el mismo rol funcional que en Angular.

| Componente               | Archivo                                 | LOC TS/JS | JSX LOC (bloque return) | Elementos aprox.                   | Condiciones/listas/eventos       | Bytes orig en A |
| ------------------------ | --------------------------------------- | --------- | ----------------------- | ---------------------------------- | -------------------------------- | --------------- |
| **Dashboard** (sencillo) | `features/dashboard/dashboard-page.tsx` | 53        | 28 (líneas 25–52)       | ~20 (6 KpiCard + listas)           | 1 condición ternaria, 1 lista    | 2 100 B         |
| **Tasks** (complejo)     | `features/tasks/tasks-page.tsx`         | 211       | 121 (líneas 90–210)     | ~70 (form, toolbar, list, selects) | 2 ternarias, 2 listas, 5 eventos | 7 676 B         |

Juntos suman 149 líneas JSX de return (36,6 % de las ~407 líneas de tag JSX de toda la app, contadas con la heurística documentada en la sección 16).

## 6. Variantes A/B/C

| Métrica           |      A (real) | B (minimal) |  C (rich) |      Δ A→B |      Δ A→C |
| ----------------- | ------------: | ----------: | --------: | ---------: | ---------: |
| JS raw            | **233 590 B** |   227 042 B | 236 143 B | **−6 548** | **+2 553** |
| JS gzip           |      68 610 B |    67 844 B |  69 029 B |       −766 |       +419 |
| JS brotli         |      59 002 B |    58 380 B |  59 427 B |       −622 |       +425 |
| CSS raw           |       3 666 B |     3 666 B |   3 666 B |          0 |          0 |
| Módulos (fuentes) |            40 |          38 |        40 |         −2 |          0 |

La variante A reproduce el bundle oficial (233 547 B sin sourcemap; 233 590 B con el comentario `sourceMappingURL` — mismo hash `index-CD8mnuHw.js` que el build oficial). Criterio de parada del enunciado cumplido: no hubo discrepancia.

## 7. Control experimental

Constantes en las tres variantes: misma copia de `apps/react-app` (diff idéntico), mismo `node_modules` (React 19.2.8, Vite 8.2.2/rolldown 1.2.5, TS 5.9.x), misma configuración de build (producción, minificación), mismo flag `--sourcemap`, mismo dominio, fixture, servicios, estado, CSS, assets y rutas. **Única variable manipulada:** la cantidad/complejidad del JSX de los 2 componentes seleccionados (más la línea de keeper en B).

## 8. Resultados

**Por componente (bytes originales — `sourcesContent`, exactos):**

| Componente         | JSX LOC |     A |     B |     C |        Δ A→B |        Δ A→C |
| ------------------ | ------: | ----: | ----: | ----: | -----------: | -----------: |
| dashboard-page.tsx |      28 | 2 100 | 1 075 | 3 796 | **−1 025 B** |     +1 696 B |
| tasks-page.tsx     |     121 | 7 676 | 3 692 | 9 258 | **−3 984 B** |     +1 582 B |
| **Total**          | **149** |       |       |       | **−5 009 B** | **+3 278 B** |

**Por componente (bytes minificados aproximados — VLQ):** dashboard 3 710 → 2 589 (**−1 121 B**, aproximado); tasks **NO MEDIBLE** en minificado (0 segmentos en el source map de las tres variantes — artefacto de cobertura de rolldown, igual que en el baseline de Fase 5.4).

**Cascada (tree-shaking al vaciar el JSX, orig A vs B):**

| Módulo hijo                                          |    A orig |   B orig | Estado                                            |
| ---------------------------------------------------- | --------: | -------: | ------------------------------------------------- |
| features/tasks/task-form.tsx                         |   5 703 B |        0 | **eliminado** (solo lo usaba el JSX de tasks)     |
| components/kpi-card.tsx                              |     303 B |        0 | **eliminado** (solo lo usaba el JSX de dashboard) |
| empty-state / feedback / badges / transition-buttons | 406–702 B | idéntico | retenidos (también los usan otras features)       |

**Totales:** A→B −6 548 B minificados (exacto, nivel bundle); A→C +2 553 B.

## 9. Atribución directa

- **MEDIDO (minificado, exacto a nivel bundle):** quitar el JSX de los 2 componentes reduce el bundle **−6 548 B**; enriquecerlo lo aumenta **+2 553 B** (confirmación de la dirección causal JSX → bytes).
- **MEDIDO (fuente, exacto por componente):** JSX fuente de los 2 componentes = **5 009 B** (dashboard 1 025 + tasks 3 984).
- **MEDIDO (minificado, por componente, aproximado):** solo dashboard = **1 121 B** (VLQ). **Tasks NO MEDIBLE en minificado** (0 segmentos).
- El único punto de conversión fuente→minificado disponible (dashboard): ratio ≈ **1,1×** (1 121 minificado / 1 025 fuente), lo que sugiere que el JSX compilado minifica a un tamaño similar a su fuente — pero es un solo punto de datos y no se extrapola como hecho.

**No se llama "coste de JSX" a lo que desaparece por cascada**: el coste directo (5 009 B fuente) y la cascada (6 006 B fuente de los hijos eliminados) se reportan por separado.

## 10. Cascada / tree-shaking

Al vaciar el JSX de tasks, `task-form` (5 703 B fuente) desaparece del bundle; al vaciar el de dashboard, `kpi-card` (303 B) desaparece. Total cascada fuente = **−6 006 B**. Los demás componentes compartidos (badges, empty-state, feedback, transition-buttons) se conservan porque otras features (projects, teams, reports) también los usan. La cascada contiene **JSX + lógica** de los hijos: no es atribuible solo a JSX.

El runtime de React (react/react-dom/scheduler) **no** se ve afectado por las variantes (el runtime es 91,9 % del bundle y es constante; la variación de ~1,6 kB en la categoría "runtime" de la VLQ entre A y B es un artefacto de cobertura del source map, no crecimiento real — mismo patrón que en Fase 5.4).

## 11. H10

> **H10 — Coste de JSX.** "Una parte medible del incremento de app code de React es atribuible al JSX compilado, y su magnitud puede estimarse mediante una variante controlada del mismo componente."

- **Definición**: coste de JSX = reducción de bundle al sustituir el JSX de un componente por JSX mínimo, manteniendo idéntica su lógica TS/JS.
- **Criterio de confirmación**: la variante controlada permite medir una reducción atribuible al JSX (con lógica verificada como viva).
- **Criterio de refutación**: eliminar el JSX no produce reducción, o la reducción no puede separarse de la lógica.
- **Limitaciones**: conversión fuente→minificado por componente solo disponible para dashboard; tasks en minificado NO MEDIBLE; extrapolación aproximada.

**Veredicto: H10 CONFIRMADA.**

La variante controlada (B) mide −6 548 B minificados totales (exactos) y −5 009 B de fuente JSX para 2 componentes, con la lógica verificada viva (keeper + strings de handlers presentes). La magnitud es medible y estimable. No se fuerza precisión donde no la hay: el detalle minificado por componente es parcial.

## 12. Comparación con Angular Fase 5.5

|                             | Angular Fase 5.5                                                | React Fase 5.6                                                                       |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Componentes (mismas áreas)  | dashboard + tasks (136 LOC template)                            | dashboard + tasks (149 líneas JSX)                                                   |
| **Coste directo observado** | −5 267 B **minificados** (metafile exacto)                      | −5 009 B **fuente** (orig); −1 121 B minificado solo dashboard (VLQ)                 |
| **Efecto cascada**          | −5 315 B minificados (task-form 4 629 + kpi-card 686 + core 51) | −6 006 B fuente (task-form 5 703 + kpi-card 303); minificado no medible por separado |
| **Coste total observado**   | **−10 593 B minificados**                                       | **−6 548 B minificados** (exacto)                                                    |
| Método de atribución        | Metafile esbuild (minificado exacto por módulo)                 | Source map + VLQ (aproximado) + sourcesContent (fuente exacta)                       |
| Precisión                   | Alta (100 % atribuido, minificado)                              | Media: total minificado exacto; por componente solo fuente (tasks VLQ = 0)           |
| Limitaciones                | Cascada contiene template+lógica de hijos; sin desglose ɵɵ*     | Cascada contiene JSX+lógica de hijos; orig ≠ minificado; VLQ tasks falla             |

**Asimetría metodológica explícita:** las cifras "directo/cascada" NO son directamente comparables entre fases — Angular se mide en minificado exacto y React en fuente (orig) más total minificado. Lo único directamente comparable es el **total observado minificado a nivel de bundle**: −10 593 B (Angular) frente a −6 548 B (React) para las mismas dos áreas funcionales. Es un hecho descriptivo del experimento, no una afirmación de superioridad.

## 13. Impacto sobre la explicación del +18 028 B

Referencia (Fases 5.4/5.5, no alteradas): incrementos +43 013 B (Angular) y +24 985 B (React); diferencia +18 028 B; diferencia de app code +11 586 B; templates AOT de Angular estimadas en 12 661–28 465 B del app code (34,6–77,8 % del incremento).

**Qué aporta esta fase (HECHO MEDIDO):** para las mismas dos áreas (Dashboard + Tasks), el coste total de template+cascada en Angular es −10 593 B minificados y el de JSX+cascada en React es −6 548 B: **4 045 B más barato en React para esas dos features** (medido, nivel bundle).

**Qué NO permite concluir (NO SABEMOS):**

- No atribuye automáticamente los +11 586 B de diferencia de app code a "templates vs JSX": la diferencia observada cubre solo 2 de 17 componentes (React) / 9 features (Angular) y los métodos de atribución son asimétricos.
- La extrapolación a toda la app (13 514–21 623 B fuente JSX) no es convertible a minificado con fiabilidad (un solo punto de conversión: dashboard, ratio ~1,1×).
- La lógica TS/JS de los componentes (hooks, handlers, estado) contribuye al app code de React de forma no separada en este experimento (el keeper la conserva, pero no se midió su tamaño por sí sola).

**Lectura consistente (INFERENCIA, no demostración):** las templates AOT de Angular (Fase 5.5) y el JSX de React (Fase 5.6) son ambos partes significativas de su app code; para las mismas dos features el coste de template+cascada de Angular supera al de JSX+cascada de React en ~4 kB minificados, en la dirección de la diferencia de app code (+11 586 B) pero sin demostrarla por completo.

## 14. Limitaciones

1. **Atribución minificada por componente incompleta**: tasks-page tiene 0 segmentos de source map (artefacto de cobertura de rolldown); su coste minificado no es medible. Solo dashboard es medible en minificado (VLQ, aproximado).
2. **Orig ≠ minificado**: la atribución por componente usa bytes fuente (exactos pero sin minificar); el único número minificado exacto es el total del bundle. Mezclar unidades (p. ej. % del app code minificado) sería un error — se evita.
3. **El keeper añade bytes a B** (decenas): el delta A→B infra-estima el JSX en ese margen.
4. **La cascada contiene JSX + lógica de los hijos** (task-form, kpi-card): no es atribuible solo a JSX.
5. **Categorías VLQ inestables entre variantes** (cobertura del mapa): los deltas de categoría (runtime/domain/app) no son fiables; solo se reporta el total minificado.
6. **Extrapolación con heurística** (líneas de tag JSX = 402; factor ×1,6 para líneas return): aproximada, rango amplio, solo en bytes fuente.
7. **Entorno**: macOS arm64, Node v25.3.0, pnpm 10.34.5. Determinista (variante A = mismo hash que el oficial).
8. Las variantes viven en `/tmp/lab-react-jsx` (fuera del repo); reconstruibles según el anexo.

## 15. Amenazas a la validez

1. **Confusión JSX/lógica por DCE del minificador** (la mayor amenaza): mitigada con el keeper y **verificada empíricamente** (strings de handlers presentes en B). Sin el keeper, el delta habría incluido lógica eliminada.
2. **Confusión JSX/lógica de hijos en la cascada**: separada y documentada (no se llama "JSX" a la cascada).
3. **Representatividad**: 2 de 19 archivos con JSX; selección justificada (el más complejo y el más sencillo, espejo de Fase 5.5).
4. **Heurística de LOC JSX**: el conteo de líneas depende de la definición (bloque return vs tags); se reportan ambas y se documenta la heurística.
5. **VLQ de dashboard como punto de conversión único**: ratio ~1,1× con un solo componente; no se extrapola como hecho.
6. **Determinismo**: verificado (mismo hash al reconstruir A). Sin componente temporal → sin necesidad de múltiples ejecuciones.

## 16. Reproducibilidad

```bash
# 1. Copia del monolith actual (fuera del repo)
rm -rf /tmp/lab-react-jsx && mkdir -p /tmp/lab-react-jsx/apps
rsync -a --exclude dist --exclude node_modules \
  apps/react-app/ /tmp/lab-react-jsx/apps/react-app/
ln -s /Users/plopez7/Dev/frontend-architecture-lab/apps/react-app/node_modules \
  /tmp/lab-react-jsx/apps/react-app/node_modules
cp /Users/plopez7/Dev/frontend-architecture-lab/tsconfig.base.json /tmp/lab-react-jsx/
# (verificar: diff -r --exclude dist --exclude node_modules = idéntico)

# 2. Variante A (real) — verificar 233 547 B sin sourcemap y 233 590 B con sourcemap
cd /tmp/lab-react-jsx/apps/react-app && ./node_modules/.bin/vite build          # 233 547 B
./node_modules/.bin/vite build --sourcemap                                      # 233 590 B
mkdir -p /tmp/lab-react-jsx/artifacts-A/dist/assets
cp dist/assets/index-*.js /tmp/lab-react-jsx/artifacts-A/dist/assets/main.js
cp dist/assets/index-*.map /tmp/lab-react-jsx/artifacts-A/dist/assets/main.js.map

# 3. Variante B (JSX mínimo + keeper en dashboard-page y tasks-page)
#    build --sourcemap → guardar en artifacts-B igual que A
# 4. Variante C (JSX rico, misma lógica)
#    build --sourcemap → guardar en artifacts-C igual que A

# 5. Análisis (genera el JSON)
node scripts/analyze-react-jsx-cost.mjs
```

El script `scripts/analyze-react-jsx-cost.mjs` lee `artifacts-{A,B,C}/dist/assets/{main.js, main.js.map}` (ruta configurable con `JSX_ARTIFACTS_DIR`) y genera `docs/experiments/results/react-jsx-cost-phase5.json` reutilizando `analyzeReact` y `prettierJson` de `analyze-bundle.mjs`. El JSX LOC por componente (28 y 121 líneas de return) se documenta en el informe; las líneas de tag JSX de toda la app (402) se miden con una heurística (`<\w`, `</\w`, `/>`).

**Heurística de JSX LOC (documentada):** "línea con JSX" = línea que contiene al menos un tag JSX (`<\w`, `</\w`, `/>`). Subestima el JSX real (no cuenta props multilínea ni interpolaciones en líneas propias); las cifras por componente usan las líneas del bloque `return` (exactas para los 2 seleccionados).

## 17. Conclusión

**HECHO MEDIDO**

- Quitar el JSX de 2 componentes (dashboard + tasks, mismas áreas que en Fase 5.5) reduce el bundle **−6 548 B minificados** (exacto); enriquecerlo lo aumenta +2 553 B. gzip −766 / +419; brotli −622 / +425.
- Fuente JSX de los 2 componentes: **5 009 B** (dashboard 1 025 + tasks 3 984, exactos). Cascada: task-form y kpi-card eliminados (−6 006 B fuente).
- Dashboard minificado por VLQ: −1 121 B (aproximado); tasks **NO MEDIBLE** en minificado.
- La lógica TS sobrevive intacta en B (keeper + verificación de strings) → el delta mide JSX, no lógica.

**INFERENCIA**

- Ratio fuente→minificado ≈ 1,1× (un solo punto, dashboard): el JSX compilado minifica a un tamaño similar a su fuente.
- Extrapolación a toda la app: ~13,5–21,6 kB de JSX fuente (402 líneas de tag; rango amplio, solo fuente).
- Para las mismas dos features, template+cascada de Angular (−10 593 B) > JSX+cascada de React (−6 548 B) en ~4 kB minificados — consistente con, pero no demostrativo de, la diferencia de app code.

**HIPÓTESIS**

- H10: **CONFIRMADA** — el coste de JSX es medible con la variante controlada y constituye una parte significativa del app code de React.

**NO SABEMOS**

- El coste minificado exacto del JSX de tasks (VLQ falla); la conversión minificada de la extrapolación; la separación JSX/lógica por componente en React al mismo nivel de precisión que Angular; si los +11 586 B de diferencia de app code se explican por templates vs JSX (solo hay evidencia parcial de 2 features).

**No existe conclusión del tipo** "React es mejor", "Angular es peor", "JSX es más eficiente" o "AOT es peor": la única comparación soportada es la del coste observado de template+cascada vs JSX+cascada para las mismas dos features, con métodos asimétricos y documentados.

## 18. Siguiente experimento

1. **Conversión minificada de la extrapolación**: medir el coste minificado del JSX de un componente adicional con VLQ funcional (p. ej. projects-page o reports-page) para tener ≥2 puntos de conversión fuente→minificado y acotar la estimación del JSX total de React en minificado.
2. **Comparación simétrica de la diferencia de app code (+11 586 B)**: medir el coste de JSX de TODOS los componentes React (mismo diseño B/C aplicado a las 9 features) frente al coste de templates de TODOS los componentes Angular (extensión de Fase 5.5) para convertir la inferencia de 2 features en una descomposición completa del +11 586 B — o demostrar que la asimetría de herramientas (metafile vs source map) lo impide.
3. **Lighthouse en CI/Chromium** (H8, pendiente e independiente).
