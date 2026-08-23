# Fase 5.8 — Descomposición del diferencial de app code por features

## 1. Objetivo

Determinar, con la máxima precisión que permitan las herramientas, qué explica la diferencia entre los app codes incrementales de React y Angular:

| Métrica                           |   React | Angular |  Diferencia |
| --------------------------------- | ------: | ------: | ----------: |
| App code incremental (minificado) | +24 985 | +36 571 | **+11 586** |
| Incremento total de bundle        | +24 985 | +43 013 | **+18 028** |

La pregunta experimental es:

> ¿La diferencia de +11 586 B entre el app code incremental de Angular y React puede descomponerse por features y por tipo de coste, o la asimetría de las herramientas impide obtener una atribución fiable?

Esta fase **no** asume que la diferencia proceda de JSX vs templates, ni que Angular genere más código, ni que React sea más eficiente: mide. Es el último experimento de bundle de la Fase 5 (no se añaden más microexperimentos aislados).

## 2. Evidencia previa

Revisada antes de medir (no se repitió ningún análisis ya resuelto):

| Fuente                                               | Evidencia clave                                                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 5.4 (`baseline-attribution-phase5.*`)           | React: runtime y domain constantes (verificado) → +24 985 B = app code residual. Angular: app code +36 571, runtime +4 102, domain +2 322, rxjs +18 = +43 013. ΔΔ app code = +11 586 B |
| Fase 5.5 (`aot-template-cost-phase5.*`)              | Angular: coste directo de 2 templates −5 267 B minificados; cascada −5 315 B; extrapolación app 12 661–28 465 B                                                                        |
| Fase 5.6 (`react-jsx-cost-phase5.*`)                 | React: JSX de 2 componentes −5 009 B fuente / −6 548 B minificados con cascada; dashboard VLQ −1 121 B; tasks NO MEDIBLE en minificado                                                 |
| Fase 5.7 (`react-jsx-attribution-validation-*`)      | Segundo punto: teams −2 840 B fuente / −1 730 B minificados exactos (bundle-delta sin cascada). Ratios fuente→minificado inestables (0,61 vs 1,09) → extrapolación global NO mejorable |
| `react-vs-angular-phase5.md`                         | Contexto H2 refutada; bundle absoluto Angular menor (179,6 kB vs 233,5 kB)                                                                                                             |
| `analyze-bundle.mjs` / `analyze-bundle-baseline.mjs` | Mecanismo VLQ + metafile esbuild; limitaciones conocidas (0 segmentos VLQ para features React)                                                                                         |

**Conclusión de la revisión:** los monoliths oficiales ya están medidos (179 634 B Angular / 233 547 B React). Lo que falta para la descomposición por features es agrupar los módulos del metafile (Angular) y del source map (React) por feature, y comprobar si los totales por feature reconcilian con los incrementos oficiales.

## 3. Features equivalentes

Correspondencia 1:1 de las 6 áreas del contrato (NAV-1…3 + Dashboard, Projects, Tasks, Teams, Reports, Settings), verificada contra la implementación real:

| Feature   | React (archivos)                                                      | Angular (archivos)                                                        |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Dashboard | `features/dashboard/dashboard-page.tsx`                               | `features/dashboard/dashboard.component.ts`                               |
| Projects  | `features/projects/{projects-page, project-detail, project-form}.tsx` | `features/projects/{projects, project-detail, project-form}.component.ts` |
| Tasks     | `features/tasks/{tasks-page, task-form}.tsx`                          | `features/tasks/{tasks, task-form}.component.ts`                          |
| Teams     | `features/teams/teams-page.tsx`                                       | `features/teams/teams.component.ts`                                       |
| Reports   | `features/reports/reports-page.tsx`                                   | `features/reports/reports.component.ts`                                   |
| Settings  | `features/settings/settings-page.tsx`                                 | `features/settings/settings.component.ts`                                 |

**Infraestructura (no 1:1, se documenta por separado):**

| Categoría         | React                                                                                                        | Angular                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Shared components | `components/*` (7: kpi-card, empty-state, feedback, field, status-badge, priority-badge, transition-buttons) | `components/*` (7 equivalentes) |
| Services          | `services/*` (domain-store, filters, ids)                                                                    | `services/*` (filters, ids)     |
| Adapters          | `adapters/domain-adapter.ts`                                                                                 | `domain/domain-data.adapter.ts` |
| Hooks             | `hooks/use-domain-store.ts`                                                                                  | — (DI en Angular)               |
| Domain store      | dentro de `services/domain-store.ts`                                                                         | `domain/domain.store.ts`        |
| App shell         | `app/App.tsx`, `app/error-boundary.tsx`, `main.tsx`                                                          | `app.ts`, `main.ts`             |

Nota: la distribución interna difiere (Angular separa store/adapter en `domain/`; React los agrupa en `services/` y `adapters/`). Las 6 features son 1:1; la infraestructura se compara por bloques homogéneos, sin forzar equivalencias artificiales.

## 4. Metodología

**Angular** — fuente primaria de verdad: esbuild metafile (`ng build --stats-json`), que da **bytesInOutput exactos por módulo** (minificado). Se agrupan los 21 módulos `src/app/` del monolith (44 142 B) y los 6 del baseline (7 571 B) por feature. Atribución **EXACTA** al 100 %.

**React** — source map + `sourcesContent` (bytes fuente **exactos** por módulo) + VLQ minificado **solo donde el mapa tiene segmentos** (dashboard y componentes compartidos; las páginas de feature tienen 0 segmentos — limitación documentada de rolldown en Fases 5.6/5.7). Orden de preferencia: 1) VLQ directo; 2) bundle-delta controlado (Fase 5.7, teams); 3) atribución por módulo inequívoca (fuente exacta); 4) residual.

**Control de cascadas:** los módulos compartidos (7 componentes) y el runtime/domain se contabilizan en categorías separadas. El coste de una feature NO incluye bytes de módulos compartidos: solo sus módulos propios (`features/<feature>/*`).

**Artefactos:**

| Framework | Baseline (Fase 5.4)                                             | Monolith (reconstruido, esta fase)                         |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Angular   | `/tmp/lab-baseline-angular/.../stats.json` (136 621 B)          | `/tmp/lab-angular-f58/.../stats.json` (179 634 B)          |
| React     | `/tmp/lab-baseline-react/.../index-BIMreHIZ.js.map` (208 605 B) | `/tmp/lab-react-f58/.../index-CD8mnuHw.js.map` (233 590 B) |

Los monoliths se reconstruyeron con flags CLI reversibles (`--stats-json`, `--sourcemap`) en copias idénticas (`diff -r` verificado) sin tocar el árbol principal. Los builds reproducen los tamaños oficiales exactos (179 634 B y 233 547 B, +43 B del comentario `sourceMappingURL` en React).

## 5. Angular — descomposición por feature (minificado EXACTO)

Metafile esbuild, `bytesInOutput` exactos por módulo:

| Feature              |  Baseline |   Monolith |         Δ B | Notas                                               |
| -------------------- | --------: | ---------: | ----------: | --------------------------------------------------- |
| Dashboard            |     2 247 |      1 680 |        −567 | Refactor del baseline (template más pequeña)        |
| Projects             |     2 426 |     12 053 |      +9 627 | Añade project-detail (2 239) y project-form (4 856) |
| Tasks                |         0 |     10 435 |     +10 435 | Nueva: tasks (5 806) + task-form (4 629)            |
| Teams                |         0 |      4 112 |      +4 112 | Nueva                                               |
| Reports              |         0 |      4 456 |      +4 456 | Nueva                                               |
| Settings             |         0 |        930 |        +930 | Nueva                                               |
| Shared components    |       691 |      3 484 |      +2 793 | 6 componentes nuevos + kpi-card                     |
| Services             |         0 |        561 |        +561 | filters (398) + ids (163)                           |
| Domain store/adapter |       654 |      3 428 |      +2 774 | store 503→3 277; adapter constante 151              |
| App shell            |     1 553 |      3 003 |      +1 450 | app.ts (nav + routing por estado)                   |
| **TOTAL**            | **7 571** | **44 142** | **+36 571** | ✅ reconcilia exacto con Fase 5.4                   |

La suma por feature = 44 142 B = app code del monolith. **Reconciliación: SÍ, exacta** (36 571 B oficial).

## 6. React — descomposición por feature (fuente EXACTA; minificado parcial)

Source map: `sourcesContent` exacto por módulo; VLQ minificado solo donde hay segmentos:

| Feature           | Baseline fuente | Monolith fuente |    Δ fuente | VLQ mono (minificado) | Confianza                            |
| ----------------- | --------------: | --------------: | ----------: | --------------------: | ------------------------------------ |
| Dashboard         |           2 539 |           2 100 |        −439 |                 3 710 | Fuente exacta + VLQ (aprox.)         |
| Projects          |           2 543 |          14 603 |     +12 060 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Tasks             |               0 |          13 379 |     +13 379 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Teams             |               0 |           5 568 |      +5 568 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Reports           |               0 |           4 893 |      +4 893 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Settings          |               0 |           1 097 |      +1 097 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Shared components |             827 |           3 221 |      +2 394 |                 5 000 | Fuente exacta + VLQ                  |
| Services          |           1 340 |          10 595 |      +9 255 |                 4 181 | Fuente exacta + VLQ                  |
| Adapters          |             368 |             368 |           0 |                   280 | Fuente exacta + VLQ                  |
| Hooks             |             503 |           1 246 |        +743 |                 3 005 | Fuente exacta + VLQ                  |
| App shell         |           1 479 |           3 886 |      +2 407 |                     — | Fuente exacta; minificado NO MEDIBLE |
| Entry (main.tsx)  |             162 |             259 |         +97 |                     — | Fuente exacta                        |
| **TOTAL**         |       **9 761** |      **61 215** | **+51 454** |            **16 176** |                                      |

Notas:

- La suma fuente (61 215 B monolith) reconcilia exacta con `categoriesOriginal` de Fases 5.3/5.4. La suma VLQ (16 176 B) coincide con el app code VLQ de Fase 5.3/5.4.
- El incremento **minificado** oficial de React es **+24 985 B** (Fase 5.4, runtime+domain constantes verificados). El incremento **fuente** es +51 454 B. **No se puede convertir uno en otro** con un ratio único (Fase 5.7: ratios 0,61 vs 1,09 entre componentes → la conversión es inestable).
- Por tanto, el minificado por feature de React es **NO MEDIBLE** para projects/tasks/teams/reports/settings/app-shell: el source map de rolldown tiene 0 segmentos VLQ para esas fuentes (artefacto de cobertura, no del código).

## 7. Cascadas / shared

| Categoría         |                       React (fuente) | Angular (minificado) | Nota                                                                                      |
| ----------------- | -----------------------------------: | -------------------: | ----------------------------------------------------------------------------------------- |
| Shared components |                             +2 394 B |             +2 793 B | 6 componentes nuevos en cada framework (mismas 7 responsabilidades)                       |
| Runtime           | ≈ 0 (constante verificada, Fase 5.4) |             +4 102 B | React: 574 367 B originales idénticos; Angular: retención de core                         |
| Domain            |           ≈ 0 (constante verificada) |             +2 322 B | React: 34 601 B originales idénticos; Angular: retención por tree-shaking (validation.js) |
| rxjs              |                                    — |                +18 B | Retención marginal                                                                        |

**Cascada de tree-shaking dentro del app code:** al vaciar el JSX de dashboard/tasks en Fase 5.6 se eliminaron task-form (−5 703 B fuente) y kpi-card (−303 B); en Angular (Fase 5.5) se eliminaron task-form (−4 629 B) y kpi-card (−686 B) minificados. **Estos bytes NO se atribuyen a las features** en esta fase: se contabilizan en sus módulos propios (Projects/Tasks/Shared), que es exactamente donde el metafile/mapa los ubica.

## 8. Tabla principal por feature

| Feature              | React Δ fuente | Angular Δ minificado | Δ Angular−React | Confianza                                                                                       |
| -------------------- | -------------: | -------------------: | --------------: | ----------------------------------------------------------------------------------------------- |
| Dashboard            |           −439 |                 −567 |            −128 | React fuente / Angular exacto                                                                   |
| Projects             |        +12 060 |               +9 627 |          −2 433 | React fuente / Angular exacto                                                                   |
| Tasks                |        +13 379 |              +10 435 |          −2 944 | React fuente / Angular exacto                                                                   |
| Teams                |         +5 568 |               +4 112 |          −1 456 | React fuente / Angular exacto                                                                   |
| Reports              |         +4 893 |               +4 456 |            −437 | React fuente / Angular exacto                                                                   |
| Settings             |         +1 097 |                 +930 |            −167 | React fuente / Angular exacto                                                                   |
| Shared components    |         +2 394 |               +2 793 |            +399 | React fuente / Angular exacto                                                                   |
| Services             |         +9 255 |                 +561 |          −8 694 | **NO comparable** (React incluye domain-store + filters + ids; Angular separa store en domain/) |
| Adapters             |              0 |                    — |               — | Angular dentro de domain/                                                                       |
| Hooks                |           +743 |                    — |               — | No existe en Angular (DI)                                                                       |
| Domain store/adapter |              — |               +2 774 |               — | React dentro de services/                                                                       |
| App shell            |         +2 407 |               +1 450 |            −957 | React fuente / Angular exacto                                                                   |
| Entry                |            +97 |                    — |               — | —                                                                                               |

**ADVERTENCIA de comparabilidad:** las columnas no están en las mismas unidades (React = bytes **fuente**; Angular = bytes **minificados**). La columna Δ Angular−React mezcla unidades y NO debe leerse como una comparación minificada. Solo es válida como comparación **fuente vs minificado dentro de cada framework**, y entre frameworks solo para los puntos donde ambos tienen minificado (ver §9).

## 9. Puntos de comparación minificada entre frameworks

Solo existen datos minificados comparables para dos puntos:

| Punto                                           | React (minificado)                      | Angular (minificado)                     |
| ----------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| **Dashboard**                                   | 3 710 B VLQ (monolith, aprox.)          | 1 680 B metafile (exacto)                |
| **Coste JSX/template** (2 áreas, Fases 5.5–5.7) | −6 548 B (dashboard+tasks, con cascada) | −10 593 B (dashboard+tasks, con cascada) |

Para **Teams** el coste de JSX minificado es −1 730 B (bundle-delta exacto sin cascada, Fase 5.7), pero no existe el byte del módulo completo.

**Interpretación mínima:** en los únicos puntos comparables en minificado, Angular supera a React en bytes (módulo dashboard: 1 680 vs 3 710; coste template+cascada de 2 áreas: 10 593 vs 6 548). **Esto es un hecho descriptivo de los puntos medidos, no una afirmación sobre los frameworks**: la muestra es de 1 módulo y 2 áreas, y la atribución React es VLQ (aproximada).

## 10. Tabla por tipo de coste

| Tipo de coste                | React                                                                                                                        | Angular                                                                                                                 | Diferencia                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Templates AOT / JSX          | Dashboard −1 121 B (VLQ) · Teams −1 730 B (bundle-delta exacto) · Dashboard+Tasks −6 548 B con cascada (Fases 5.6/5.7)       | Directo −5 267 B (2 componentes, metafile) · total con cascada −10 593 B · extrapolación app 12 661–28 465 B (Fase 5.5) | **NO COMPARABLE directamente** (unidades/alcance distintos); única comparación soportada: −10 593 B vs −6 548 B para las mismas 2 áreas |
| Lógica app (no template/JSX) | NO MEDIBLE por separado (el minificador elimina la lógica no referenciada; el keeper la conserva pero no se cuantificó sola) | NO SEPARABLE dentro del módulo (clase + template compilada conviven en el mismo módulo)                                 | NO MEDIBLE en ambos                                                                                                                     |
| Runtime retenido             | ≈ 0 (verificado constante, Fase 5.4)                                                                                         | +4 102 B (metafile: _debug_node +2 942, _resource +570, core.mjs +465, effects +123)                                    | +4 102 B (Angular)                                                                                                                      |
| Domain retenido              | ≈ 0 (verificado constante, Fase 5.4)                                                                                         | +2 322 B (retención tree-shaking: validation.js 220→2 229)                                                              | +2 322 B (Angular)                                                                                                                      |
| Dependencias                 | 0 nuevas                                                                                                                     | rxjs +18 B (retención); 0 nuevas                                                                                        | +18 B (Angular)                                                                                                                         |
| No atribuible                | Minificado por feature NO MEDIBLE (0 segmentos VLQ en features) → residual del +24 985 B sin descomponer en minificado       | 0 (metafile atribuye el 100 %)                                                                                          | Residual React = bloqueo metodológico, no bytes desconocidos                                                                            |

Solo se rellenan celdas con evidencia suficiente; el resto es NO MEDIBLE.

## 11. Reconciliación con Fase 5.4

| Métrica                      | Fase 5.4 (oficial) | Esta fase                                                            | Estado    |
| ---------------------------- | -----------------: | -------------------------------------------------------------------- | --------- |
| Angular app code incremental |          +36 571 B | Σ features = **+36 571 B**                                           | ✅ exacto |
| React app code incremental   |   +24 985 B (min.) | Σ fuente = +51 454 B; minificado por feature NO MEDIBLE              | Parcial   |
| Δ app code Angular−React     |          +11 586 B | Angular descompuesto 100 %; React solo fuente + 2 puntos minificados | Parcial   |

Las cifras históricas de Fase 5.4 NO se modifican: esta fase las complementa. El total minificado de React (+24 985 B) no se puede descomponer por feature con las herramientas disponibles; el total fuente (+51 454 B) sí.

## 12. Estado de H2

**H2 (Angular tendrá un incremento de bundle comparable o menor que React): REFUTADA** — se mantiene.

Nivel de explicación causal:

- **EXPLICADA (lado Angular):** el +36 571 B de app code se descompone exactamente por feature (metafile). El +4 102 B de runtime, +2 322 B de domain y +18 B de rxjs también están medidos (Fase 5.4).
- **PARCIALMENTE EXPLICADA (diferencia total +18 028 B):** el lado Angular (43 013 B) está 100 % atribuido; del lado React, el app code minificado (+24 985 B) solo tiene puntos aislados (dashboard VLQ 3 710 B; JSX de dashboard+tasks −6 548 B; teams −1 730 B; componentes compartidos 5 000 B VLQ). El resto del minificado React no es atribuible por feature.
- **NO EXPLICADA:** la conversión fuente→minificado de las features React sin segmentos VLQ (projects, tasks, teams, reports, settings, app shell).

**Conclusión: H2 sigue REFUTADA, con explicación causal parcialmente alcanzada.** La parte de Angular está totalmente explicada; la parte de React está explicada solo a nivel fuente y en puntos aislados minificados.

## 13. Qué está explicado

1. **Angular: 100 % del incremento de app code (+36 571 B)** descompuesto por feature (metafile exacto): Tasks +10 435, Projects +9 627, Reports +4 456, Teams +4 112, Shared +2 793, Domain store/adapter +2 774, App shell +1 450, Services +561, Settings +930, Dashboard −567.
2. **Angular: runtime +4 102 B, domain +2 322 B, rxjs +18 B** (Fase 5.4, metafile módulo a módulo).
3. **React: incremento fuente por feature (+51 454 B)** exacto, y **VLQ minificado para dashboard (3 710 B), shared (5 000 B), services (4 181 B), adapters (280 B), hooks (3 005 B)**.
4. **Coste de template/JSX** de 2 áreas en ambos frameworks (Fases 5.5–5.7): Angular −10 593 B vs React −6 548 B minificados (con cascada), y directos −5 267 B vs −5 009 B.

## 14. Qué permanece residual

1. **El minificado por feature de React para projects/tasks/teams/reports/settings/app-shell: NO MEDIBLE.** El source map de rolldown no emite segmentos VLQ para esas fuentes (0 segmentos — mismo artefacto que Fase 5.4 para el baseline y Fase 5.6 para tasks). No es bytes desconocidos: es un bloqueo metodológico de la herramienta.
2. **La conversión fuente→minificado de React:** inestable entre componentes (0,61 vs 1,09; Fase 5.7) → no se puede convertir el +51 454 B fuente en minificado por feature.
3. **Separación template/lógica dentro de los módulos Angular** y **JSX/lógica dentro de los módulos React**: NO MEDIBLE con estas herramientas (conviven en el mismo módulo).
4. **Atribución exacta de los +43 013 B de Angular a runtime vs templates vs lógica** en términos absolutos (solo se tiene la extrapolación de Fase 5.5 y la retención de Fase 5.4).

## 15. Limitaciones

1. **Asimetría de unidades entre frameworks**: React se mide en bytes fuente (exactos); Angular en minificado (exacto). La columna Δ Angular−React de la tabla por feature mezcla unidades y no es una comparación minificada válida.
2. **VLQ de rolldown sin segmentos para features React** (projects/tasks/teams/reports/settings/app-shell): minificado por feature NO MEDIBLE. Documentado en Fases 5.4/5.6/5.7.
3. **VLQ de dashboard/shared/hooks es aproximada** (segment-span heuristic): los puntos minificados de React son APROXIMADOS, no exactos.
4. **Los deltas negativos** (Dashboard −567 Angular / −439 React fuente) reflejan refactor del baseline, no ahorro.
5. **La infraestructura no es 1:1** (Services/Hooks/Adapters/Domain store): se documenta por separado; forzar equivalencias sería un error.
6. **Los monoliths se reconstruyeron en /tmp** (fuera del repo) con flags CLI reversibles; los baselines proceden de Fase 5.4 (misma máquina/Node/versiones — determinismo verificado por hash).
7. **Sin componente temporal**: builds deterministas (mismo hash) → no se requiere mediana de ejecuciones.

## 16. Amenazas a la validez

1. **Confusión fuente vs minificado** (la mayor): leer la tabla React como minificado sería un error. Solo el total VLQ (16 176 B) y los puntos aislados son minificados.
2. **Confusión de la columna Δ Angular−React**: mezcla unidades; solo los puntos de §9 son comparables entre frameworks.
3. **Representatividad de la extrapolación de templates** (Fase 5.5): 12 661–28 465 B sobre 735 LOC template, rango amplio, solo Angular.
4. **VLQ de dashboard como punto de conversión único**: ratio ~1,1× con un solo componente (Fase 5.6); no se extrapola como hecho.
5. **Determinismo**: verificado (mismo hash al reconstruir los monoliths).

## 17. Conclusión

**HECHO MEDIDO**

- Angular: el incremento de app code +36 571 B se descompone **exactamente** por feature (metafile): Tasks +10 435 · Projects +9 627 · Reports +4 456 · Teams +4 112 · Shared +2 793 · Domain store/adapter +2 774 · App shell +1 450 · Services +561 · Settings +930 · Dashboard −567.
- React: el incremento **fuente** +51 454 B se descompone exactamente por feature (projects +12 060 · tasks +13 379 · services +9 255 · teams +5 568 · reports +4 893 · shared +2 394 · app shell +2 407 · settings +1 097 · hooks +743 · entry +97 · dashboard −439). VLQ minificado disponible solo para dashboard (3 710 B), shared (5 000), services (4 181), adapters (280), hooks (3 005) = 16 176 B total (coincide con Fase 5.3/5.4).
- Los únicos puntos comparables en minificado entre frameworks: módulo Dashboard 1 680 B (Angular, exacto) vs 3 710 B (React, VLQ aprox.); coste template+cascada de 2 áreas −10 593 B (Angular) vs −6 548 B (React).

**INFERENCIA**

- La diferencia de app code +11 586 B está **explicada al 100 % en el lado Angular** y **parcialmente en el lado React** (fuente + puntos minificados aislados).
- La asimetría de herramientas (metafile esbuild exacto vs source map sin segmentos VLQ para features) es la causa del residual, no bytes desconocidos ni peor rendimiento de ningún framework.

**HIPÓTESIS**

- H2: **REFUTADA** (se mantiene). Explicación causal: **PARCIALMENTE ALCANZADA** — Angular totalmente descompuesto; React descompuesto en fuente y en puntos aislados minificados.

**NO SABEMOS**

- El minificado por feature de React para projects/tasks/teams/reports/settings/app-shell (bloqueo metodológico del source map).
- La separación template/lógica (Angular) y JSX/lógica (React) dentro de cada módulo.
- Si el +11 586 B se explica por templates vs JSX, por lógica, o por ambos: solo hay evidencia de 2 áreas (Fases 5.5–5.7), no de las 6.

**No existe conclusión del tipo** "React es mejor", "Angular es peor", "Angular genera X bytes por feature" (salvo los bytes exactos por feature de Angular, que sí están medidos): la comparación entre frameworks en minificado solo es válida en los puntos de §9.

## 18. Recomendación

1. **No más microexperimentos de bundle en este laboratorio**: la pregunta de atribución ha llegado al límite de las herramientas disponibles (React sin metafile; source map sin segmentos). La única vía para cerrar el minificado por feature de React sería un build React con metafile equivalente (requiere cambiar la toolchain — fuera del alcance de este laboratorio, que usa Vite/Rolldown oficial).
2. **Lighthouse en CI/Chromium** (H8, pendiente e independiente del bundle): es el experimento con mayor valor informativo restante.
3. **Evolución del laboratorio** (añadir una feature, una regla, una entidad): medir el coste incremental de evolución, que es la pregunta de mantenibilidad pendiente (H6/H7 en fase posterior).
4. Cerrar la Fase 5 con la comparación global ya documentada (Fase 5.2) y esta atribución (Fases 5.3–5.8) como evidencia del trade-off de bundle.
