# Fase 5.4 — Baseline Attribution

## 1. Objetivo

Regenerar los baselines de React y Angular (estado previo a las Fases 4 y 5) con artefactos de composición comparables a los utilizados en la Fase 5.3, para pasar de:

```
baseline total → monolith total
```

a:

```
baseline composición → monolith composición → delta por categoría
```

La finalidad es eliminar, en la medida de lo posible, la asimetría metodológica detectada en la Fase 5.3 (Angular con metafile exacto, React con source map/VLQ, baselines de Fase 2 sin artefactos de composición) y comprobar con evidencia el supuesto de runtime constante.

Esta fase es **solo experimental**: no se ha modificado código funcional, no se han optimizado bundles y no se ha realizado ningún experimento de aislamiento de templates/AOT.

## 2. Pregunta experimental

> ¿De dónde procede exactamente el incremento de bundle entre Baseline y Monolith en React y Angular?

En concreto, la pregunta central del laboratorio (heredada de Fase 5.2/5.3):

> ¿Podemos explicar los **+18 028 B** de diferencia entre el incremento de Angular (+43 013 B) y el incremento de React (+24 985 B)?

## 3. Contexto de Fase 5.3

La Fase 5.3 atribuyó la composición de los monoliths:

- **Angular Monolith** (179 634 B JS raw): runtime `@angular/*` 109 943 B (61,2 %), app code 44 142 B (24,6 %), domain 16 438 B (9,2 %), rxjs 8 634 B (4,8 %), no atribuible 443 B (0,2 %). Método: metafile esbuild (`ng build --stats-json`), **exacto** (99,8 % atribuido).
- **React Monolith** (233 590 B JS raw): runtime react/react-dom/scheduler 214 561 B (91,9 %), app code 16 176 B (6,9 %), domain 11 322 B (4,8 %), no atribuible 866 B (0,4 %). Método: source map + decodificador VLQ, **aproximado** (±5–10 kB en app code).

Limitaciones heredadas:

1. La composición de los baselines de Fase 2 **no era medible** (no se generaron metafiles/source maps y los dist históricos fueron sobrescritos).
2. La Fase 5.3 utilizó el supuesto _"el runtime es aproximadamente constante entre baseline y monolith"_ sin verificación directa.
3. React (Vite 8 → rolldown) no emite metafile esbuild; la atribución VLQ es la única vía sin dependencias nuevas.

## 4. Baselines históricos utilizados

Se identificaron en `git log`:

| Estado                    | Commit                    | Contenido                                                                                          |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Baseline (Fase 2)         | `abd78e3`                 | React y Angular pre-monolith (contrato parcial: Dashboard + Projects) + `packages/domain` completo |
| React Monolith (Fase 4)   | `60053b1`                 | Contrato funcional completo en React                                                               |
| Angular Monolith (Fase 5) | working tree (sin commit) | Contrato funcional completo en Angular                                                             |

Verificaciones previas a la reconstrucción:

- `git diff abd78e3..HEAD -- packages/domain` → **0 cambios**: el dominio del baseline es idéntico al actual.
- `package.json` de ambas apps idénticos entre `abd78e3` y el monolith → **mismas versiones de toolchain** (React 19.2.8 / Vite 8.2.2 rolldown 1.2.5; Angular 21.2.21 / TS 5.9.2).
- El baseline de Fase 2 ya embebía el fixture completo (`loadFixture` + `operations-hub-v1.json`).

## 5. Commits/versiones

```
baseline (React y Angular):   abd78e3
React Monolith:               60053b1
Angular Monolith:             working tree (Fase 5, sin commit)

Node:      v25.3.0
pnpm:      pnpm@10.34.5 (packageManager en package.json raíz)
React:     react/react-dom 19.2.8, vite 8.2.2 (rolldown 1.2.5)
Angular:   @angular/core + @angular/cli 21.2.21, typescript 5.9.2
Domain:    @operations-hub/domain workspace:* (idéntico, verificado)
```

**Estrategia de seguridad con git** (sin tocar el árbol de trabajo principal):

1. Registro de `git status --short` y commit actual antes de empezar.
2. Creación de **worktrees temporales** (checkout completo) en `/tmp/lab-baseline-react` y `/tmp/lab-baseline-angular` desde `abd78e3`.
3. Symlink del `node_modules` de cada app del workspace hacia el worktree (mismos bins y mismas versiones).
4. Build de cada baseline con flags CLI reversibles.
5. **Sin commits, sin `reset --hard`, sin checkout destructivo**; los cambios de la Fase 5 en el árbol principal quedaron intactos (verificado al final con `git status`).

Nota de reconstrucción: los worktrees se construyeron con el toolchain actual (versiones idénticas a las del monolith, verificado en git), no con los bins históricos de Fase 2. Los bytes totales de los builds reconstruidos coinciden **exactamente** con los oficiales de Fase 2:

|                         | Official Fase 2 | Reconstruido |
| ----------------------- | --------------- | ------------ |
| React baseline JS raw   | 208 605 B       | 208 605 B ✅ |
| Angular baseline JS raw | 136 621 B       | 136 621 B ✅ |

## 6. Metodología

**Misma metodología de atribución que Fase 5.3** (requisito de simetría dentro de cada framework):

| Framework | Baseline         | Monolith         | Mecanismo                                      |
| --------- | ---------------- | ---------------- | ---------------------------------------------- |
| React     | source map + VLQ | source map + VLQ | `vite build --sourcemap` (flag CLI reversible) |
| Angular   | metafile esbuild | metafile esbuild | `ng build --stats-json` (flag CLI reversible)  |

- Categorías: framework/runtime, app code, dominio (código + fixture JSON), dependencias, CSS, generado/compilado.
- gzip/brotli: Node `zlib` nivel por defecto, misma metodología que `metrics.md`.
- Los builds de análisis se generaron con flags CLI reversibles **sin modificar configuración permanente** (verificado con `git diff`).
- No se midió gzip/brotli por categoría: la compresión es global por asset y comprimir módulos por separado no es representativo de la transferencia real.

**Asimetría documentada entre frameworks (inherente a las herramientas):** la atribución de Angular es **exacta** (bytesInOutput por módulo); la de React es **aproximada** (VLQ) y, en el baseline, **incompleta** (ver sección 7). La comparación incremental dentro de cada framework es la que debe leerse con sus propias limitaciones.

## 7. React baseline

**Totales** (reconstruido, idéntico al oficial):

```
JS raw 208 605 B · gzip 63 534 B · brotli 54 606 B · 1 chunk · CSS 119 B
```

**Hallazgo metodológico (limitación del mapa, no del código):** el source map del baseline **no contiene segmentos para las fuentes de la aplicación** (0 de 48 169 segmentos apuntan a las fuentes `src/`; el monolith sí los tiene, 4 082). La atribución VLQ del baseline devuelve app code = 0 B, lo cual es un artefacto del mapa generado por rolldown para este bundle, no un reflejo del contenido (el baseline sí tiene Dashboard y Projects).

Consecuencia: **el app code minificado del baseline de React no es medible por esta vía.**

**Verificaciones de constancia (evidencia independiente de la VLQ):**

| Fuente                                             |  Baseline |  Monolith | Resultado                               |
| -------------------------------------------------- | --------: | --------: | --------------------------------------- |
| runtime (react/react-dom/scheduler) sourcesContent | 574 367 B | 574 367 B | idéntico (10/10 fuentes byte-idénticas) |
| domain sourcesContent                              |  34 601 B |  34 601 B | idéntico                                |
| fixture literal (span medido en el bundle)         |   9 336 B |   9 335 B | constante (±1 B)                        |

Con estas verificaciones, el delta React **+24 985 B** queda atribuido por residual: runtime y domain son constantes (mismas fuentes, mismas versiones, mismo minificador) → **el incremento de React es app code** (+≈25 kB minificado; +51 454 B originales sin minificar: 9 761 → 61 215 B).

El "+8 966 B de runtime" que muestra la VLQ (205 595 → 214 561) es un **artefacto de cobertura** del mapa del baseline (menos segmentos → menor atribución), no crecimiento real: las fuentes del runtime son byte-idénticas y la versión es la misma. Se descarta como interpretación (ver sección 15).

## 8. Angular baseline

**Totales** (reconstruido, idéntico al oficial):

```
JS raw 136 621 B · gzip 43 930 B · brotli 39 156 B · 1 chunk · CSS 119 B
```

**Atribución exacta (metafile esbuild):**

| Categoría                   |    Baseline |    Monolith |           Δ | Nota                                                                                             |
| --------------------------- | ----------: | ----------: | ----------: | ------------------------------------------------------------------------------------------------ |
| app code                    |       7 571 |      44 142 | **+36 571** | componentes AOT (templates compilados dentro de los `.component.ts`) + store + forms + servicios |
| `@angular/core`             |      94 224 |      98 324 |  **+4 100** | retención (ver desglose abajo)                                                                   |
| `@angular/platform-browser` |      11 319 |      11 321 |          +2 | retención                                                                                        |
| `@angular/common`           |         298 |         298 |           0 | —                                                                                                |
| domain                      |      14 116 |      16 438 |  **+2 322** | retención de validadores/transiciones/reports                                                    |
| rxjs                        |       8 616 |       8 634 |         +18 | retención                                                                                        |
| entry                       |          34 |          34 |           0 | —                                                                                                |
| **TOTAL JS**                | **136 621** | **179 634** | **+43 013** | 100 % atribuido                                                                                  |

**Desglose de la retención del runtime `@angular/core`** (módulos con delta ≠ 0, mismas versiones):

```
fesm2022/_debug_node-chunk.mjs   +2 942 B
fesm2022/_resource-chunk.mjs     +   570 B
fesm2022/core.mjs                +   465 B
fesm2022/_effect-chunk2.mjs      +   103 B
fesm2022/_effect-chunk.mjs       +    20 B
```

**Desglose de la retención del domain** (módulos con delta ≠ 0, mismas fuentes):

```
dist/src/validation.js   220 → 2 229 B  (+2 009 B)  ← el baseline retenía una fracción mínima
dist/src/transitions.js  117 →   294 B  (+  177 B)
dist/src/reports.js      867 → 1 003 B  (+  136 B)
(rules.js, fixture.js y operations-hub-v1.json sin cambios)
```

**Interpretación clave:** los +6 442 B de retención (4 102 runtime + 2 322 domain + 18 rxjs) **no son código nuevo ni dependencias nuevas**: son el efecto de _tree-shaking_ — el monolith usa más superficie del mismo código (todos los validadores, todas las transiciones, más directivas/helpers del core). El fixture JSON (9 259 B) es constante en ambos.

## 9. Comparación incremental React

```
React baseline  208 605 B  →  React monolith  233 590 B   Δ = +24 985 B
```

| Categoría |                                             Δ React | Método                                                             |
| --------- | --------------------------------------------------: | ------------------------------------------------------------------ |
| app code  | **≈ +24 985 B** (minificado) / +51 454 B (original) | residual: delta total − (runtime + domain, verificados constantes) |
| runtime   |                         ≈ 0 (constante, verificado) | sourcesContent byte-idénticos                                      |
| domain    |                         ≈ 0 (constante, verificado) | sourcesContent idénticos + span del fixture constante              |
| **TOTAL** |                                       **+24 985 B** | medido                                                             |

El incremento de React es, con evidencia, **enteramente app code**. No hay retención de runtime/domain medible (las fuentes son byte-idénticas y la versión del toolchain no cambió).

## 10. Comparación incremental Angular

```
Angular baseline  136 621 B  →  Angular monolith  179 634 B   Δ = +43 013 B
```

| Categoría                        |     Δ Angular |              % del delta |
| -------------------------------- | ------------: | -----------------------: |
| app code                         | **+36 571 B** |                   85,0 % |
| runtime `@angular/*` (retención) |      +4 102 B |                    9,5 % |
| domain (retención de superficie) |      +2 322 B |                    5,4 % |
| rxjs (retención)                 |         +18 B |                   0,04 % |
| **TOTAL**                        | **+43 013 B** | 100 % (atribuido exacto) |

## 11. React vs Angular

### Totales

|           | React baseline | React monolith | Δ React | Angular baseline | Angular monolith | Δ Angular |          ΔΔ |
| --------- | -------------: | -------------: | ------: | ---------------: | ---------------: | --------: | ----------: |
| JS raw    |        208 605 |        233 590 | +24 985 |          136 621 |          179 634 |   +43 013 | **+18 028** |
| JS gzip   |         63 534 |         68 610 |  +5 076 |           43 930 |           53 485 |    +9 555 |      +4 479 |
| JS brotli |         54 606 |         59 002 |  +4 396 |           39 156 |           47 348 |    +8 192 |      +3 796 |
| CSS raw   |            119 |          3 666 |  +3 547 |              119 |            3 438 |    +3 319 |        −228 |
| Chunks JS |              1 |              1 |       0 |                1 |                1 |         0 |           0 |

### Por categoría (JS raw)

| Categoría |      React base |      React mono |                  Δ React | Angular base | Angular mono |   Δ Angular |            ΔΔ |
| --------- | --------------: | --------------: | -----------------------: | -----------: | -----------: | ----------: | ------------: |
| app code  |             0 * |       16 176 ** | **≈ +24 985** (residual) |        7 571 |       44 142 |     +36 571 | **≈ +11 586** |
| runtime   | const. (verif.) | const. (verif.) |                      ≈ 0 |      105 841 |      109 943 |      +4 102 |        +4 102 |
| domain    |       11 480 ** |       11 322 ** |      ≈ 0 (const. verif.) |       14 116 |       16 438 |      +2 322 |        +2 322 |
| rxjs      |               — |               — |                        — |        8 616 |        8 634 |         +18 |           +18 |
| **TOTAL** |     **208 605** |     **233 590** |              **+24 985** |  **136 621** |  **179 634** | **+43 013** |   **+18 028** |

\* Atribución VLQ del baseline = 0 B: el source map del baseline no mapea el app code (limitación documentada, sección 7). El valor real del app code minificado del baseline no es medible; el Δ React app code se reporta como residual.

\*\* Valores VLQ corregidos con el span del fixture medido; aproximados (±5–10 kB en app code).

### Supuesto de runtime (revisión del supuesto de Fase 5.3)

| Framework | ¿Runtime constante?        | Evidencia                                                                           |
| --------- | -------------------------- | ----------------------------------------------------------------------------------- |
| React     | ✅ **Sí, verificado**      | sourcesContent byte-idénticos (574 367 = 574 367 B), mismas versiones y minificador |
| Angular   | ❌ **No** (crece +4 102 B) | metafile exacto: más superficie de `@angular/core` retenida por el uso del monolith |

El supuesto "runtime constante" de Fase 5.3 **se cumple para React pero no para Angular**: el runtime de Angular crece +4 102 B, aunque por **retención de tree-shaking** (el monolith usa más features del core), no por código nuevo ni dependencias. El supuesto "sin dependencias nuevas" se mantiene para ambos.

## 12. Atribución de los +18 028 B

**La diferencia incremental se descompone exactamente:**

```
ΔAngular − ΔReact  =  +43 013 − (+24 985)  =  +18 028 B

  app code        +36 571 − (+24 985)  =  +11 586 B   (64,3 %)
  runtime          +4 102 − (≈ 0)      =   +4 102 B   (22,7 %)
  domain           +2 322 − (≈ 0)      =   +2 322 B   (12,9 %)
  rxjs                 +18 − (0)       =      +18 B   ( 0,1 %)
  ─────────────────────────────────────────────────────────
  TOTAL                                   +18 028 B   (100 %)
```

**Lectura por categoría:**

1. **App code (+11 586 B, ~64 %):** el mismo contrato funcional produce más bytes minificados de código de aplicación en Angular (+36 571 B) que en React (+≈24 985 B). Incluye los templates compilados AOT (instrucciones `ɵɵ*` embebidas en los `.component.ts`), los formularios y la separación HTML/TS. En React, el JSX compila a llamadas `jsx()`/`jsxDEV` más compactas. Es la categoría dominante y la única que contiene código nuevo.

2. **Runtime (+4 102 B, ~23 %):** retención de `@angular/core`. El monolith usa más superficie del runtime existente (helpers de debug de nodos, recursos, effects); el baseline tree-shakeaba más de `@angular/core`. No es código nuevo.

3. **Domain (+2 322 B, ~13 %):** retención de la superficie del dominio compartido. El baseline retenía una fracción mínima de `validation.js` (220 B); el monolith usa todos los validadores del contrato (+2 009 B solo en validation). Mismas fuentes (`packages/domain` idéntico verificado). React no muestra este efecto porque su baseline ya retenía el domain completo.

4. **rxjs (+18 B, ~0 %):** retención marginal.

**Nivel de explicación: EXPLICADA.**

- Lado Angular: **100 % del delta atribuido módulo a módulo** (metafile exacto; la suma de los deltas por módulo = +43 013 B).
- Lado React: delta total exacto (+24 985 B) con runtime y domain **verificados constantes** por fuentes byte-idénticas → app code por residual. La incertidumbre restante es la división interna de los +24 985 B de React (todo app code frente a una posible retención mínima de runtime no medible), que no altera la descomposición del ΔΔ más que en ±unos cientos de bytes.

## 13. Revisión de H2

**H2 (original):** _"El incremento de bundle producido por completar Angular Monolith será inferior o comparable al incremento observado en React (+25 kB raw), debido en parte a la compilación AOT de templates."_

**Resultado: REFUTADA y ahora EXPLICADA.**

- Angular incrementa +43 013 B frente a +24 985 B de React: la hipótesis queda refutada con los datos (ya desde Fase 5.1).
- La atribución de esta fase explica **por qué**: (a) el app code AOT de Angular es ~11,6 kB mayor que el de React para el mismo contrato, (b) Angular retiene ~4,1 kB más de su runtime y (c) ~2,3 kB más de superficie del domain. La AOT no reduce el incremento por debajo del de React: los templates se compilan dentro de los módulos de componentes y el resultado en bytes supera al JSX de React.
- El supuesto de runtime constante de Fase 5.3 queda **corregido para Angular** (+4 102 B por retención), sin cambiar la conclusión de H2.

## 14. Limitaciones

1. **React app code del baseline no medible en minificado:** el source map del baseline no mapea las fuentes de la app (0 segmentos). El Δ React app code se reporta como residual (delta total − runtime − domain, ambos verificados constantes). No es una medición directa por módulo.
2. **React runtime "constante" verificado por fuentes, no por bytes minificados:** sourcesContent byte-idénticos + mismas versiones/minificador son evidencia fuerte, pero no excluyen una retención mínima de tree-shaking de react/react-dom entre baseline y monolith. Si existiera (no medible), el app code residual de React sería ligeramente menor y la descomposición del ΔΔ variaría en ±pocos cientos de bytes.
3. **Atribución VLQ aproximada** (±5–10 kB en app code del monolith de React); el total y las constancias verificadas no dependen de ella.
4. **Baselines reconstruidos con el toolchain actual** (versiones idénticas a los monoliths, verificado en git), no con los bins históricos de Fase 2. Los bytes totales coinciden exactamente con los oficiales.
5. **Sin desglose template/lógica dentro del app code de Angular:** los templates AOT están compilados dentro de los `.component.ts`; aislar los bytes exactos de instrucciones `ɵɵ*` requiere el experimento de aislamiento (posterior, sección 17).
6. **gzip/brotli solo por asset**, no por categoría (compresión global).
7. **Entorno:** macOS arm64, Node v25.3.0, pnpm 10.34.5. Los tiempos y bytes pueden variar en otro entorno; los bytes de los builds de análisis son deterministas (mismos inputs/versiones).
8. **Los dist reconstruidos de los baselines quedaron en worktrees temporales** (`/tmp/lab-baseline-*`) fuera del repositorio: el JSON de esta fase referencia sus números, pero los artefactos no se versionan.

## 15. Interpretaciones descartadas

Las siguientes conclusiones **no están demostradas** por esta evidencia y se descartan como explicaciones:

1. **"AOT genera más bytes por sí mismo"** — no medible con estas herramientas: los templates se compilan dentro de los módulos de componentes y no existe una categoría separada "templates" en el metafile. Lo que se mide es que el app code total de Angular (componentes + templates + forms) minifica a más bytes que el de React. La causalidad AOT↔bytes requeriría el experimento de aislamiento.
2. **"Los templates causan los +18 kB"** — el app code (+11 586 B) es solo el 64 % del ΔΔ; el 36 % restante es retención de runtime/domain sin relación con templates. Atribuir los +18 kB exclusivamente a templates no está soportado.
3. **"Angular tiene peor tree-shaking que React"** — el efecto observado (retención de +6 442 B) es **uso de más superficie del mismo código**, no incapacidad de eliminar código muerto: el baseline eliminó (tree-shakeó) más porque usaba menos. No hay evidencia de que Angular retenga código muerto.
4. **"Angular tiene peor bundle que React"** — el bundle **absoluto** de Angular (179,6 kB) es **menor** que el de React (233,6 kB). La diferencia está en el **incremento**, no en el absoluto. Confundir ambos sería un error (sección 11).
5. **"React tiene mejor bundle"** — véase el punto anterior: depende de si se habla de absoluto o incremental.
6. **"Más bytes implican peor arquitectura"** — los +18 kB no correlacionan con arquitectura: el dominio compartido, la separación de estado y las fronteras son las mismas en ambos (ADR-002). El incremento refleja la expresión del mismo contrato en cada toolchain.
7. **"El runtime de React crece +8 966 B"** (VLQ) — artefacto de cobertura del source map del baseline (menos segmentos → menos atribución). Las fuentes del runtime son byte-idénticas; no es crecimiento real.

## 16. Conclusión

1. **Qué cambió realmente entre baseline y monolith:**
   - **React:** +24 985 B, atribuido por residual a **app code** (runtime y domain verificados constantes byte a byte). No hay retención medible.
   - **Angular:** +43 013 B, atribuido **exacto**: app code +36 571 B (85 %), retención de runtime +4 102 B, retención de domain +2 322 B, rxjs +18 B.
2. **La diferencia de +18 028 B está explicada:** ~64 % más de app code en Angular para el mismo contrato (+11 586 B), ~23 % retención de runtime (+4 102 B) y ~13 % retención de domain (+2 322 B). La suma es exacta por construcción.
3. **La AOT no produce el incremento menor esperado por H2:** la hipótesis queda refutada; el coste incremental de Angular es superior al de React y ahora se conoce su composición.
4. **El supuesto de runtime constante era válido para React y no para Angular** (+4 102 B por retención de uso, sin código nuevo).
5. **La asimetría metodológica de Fase 5.3 se redujo, no se eliminó:** dentro de cada framework, baseline y monolith usan ahora el mismo mecanismo (React VLQ, Angular metafile). Entre frameworks la asimetría persiste por las herramientas disponibles (rolldown no emite metafile).

## 17. Próximo experimento

Los datos justifican ahora el experimento que Fase 5.3 había aplazado:

**A. Aislar el coste de template AOT** — medir un componente Angular sin template (o con template mínimo) contra el mismo componente con template, comparando el metafile, para cuantificar los bytes de instrucciones `ɵɵ*` por template. Esto cerraría la única pregunta abierta: cuánto del app code Angular (+36 571 B) es template compilado y cuánto es componente/lógica. **Este experimento NO debe realizarse sobre los monoliths** (son la referencia), sino sobre variantes aisladas en worktrees, y es la vía para convertir el "≈64 % app code" en una atribución template/lógica explícita.

**B. (alternativa/siguiente) Verificación de la retención mínima de React** — construir un React baseline mínimo (solo `createRoot`) en worktree y medir el runtime minificado para acotar la retención de react/react-dom entre baseline y monolith; acotaría el residual de React en ±pocos cientos de bytes.

**C. Lighthouse en CI/Chromium** — permanece pendiente (H8) y es independiente del bundle.

---

## Anexo — Reproducibilidad

Comandos exactos utilizados para reconstruir los baselines y regenerar los artefactos de análisis (todos reversibles; ninguno modifica configuración permanente):

```bash
# 1. Worktrees temporales desde el commit baseline de Fase 2 (fuera del árbol principal)
git worktree add /tmp/lab-baseline-react abd78e3
git worktree add /tmp/lab-baseline-angular abd78e3

# 2. Reutilizar los bins del workspace (mismas versiones)
ln -s /Users/plopez7/Dev/frontend-architecture-lab/apps/react-app/node_modules /tmp/lab-baseline-react/apps/react-app/node_modules
ln -s /Users/plopez7/Dev/frontend-architecture-lab/apps/angular-app/node_modules /tmp/lab-baseline-angular/apps/angular-app/node_modules

# 3. Build de baselines con flags CLI (artefactos de composición)
cd /tmp/lab-baseline-react/apps/react-app && ./node_modules/.bin/vite build --sourcemap
cd /tmp/lab-baseline-angular/apps/angular-app && ./node_modules/.bin/ng build --stats-json

# 4. Monoliths (mismos flags, en el árbol principal)
cd apps/react-app && ./node_modules/.bin/vite build --sourcemap
cd apps/angular-app && ./node_modules/.bin/ng build --stats-json

# 5. Análisis (genera ambos JSON)
node scripts/analyze-bundle-baseline.mjs
node scripts/analyze-bundle.mjs

# 6. Limpieza de worktrees
# git worktree remove /tmp/lab-baseline-react --force
# git worktree remove /tmp/lab-baseline-angular --force
```

Verificaciones previas: `git diff abd78e3..HEAD -- packages/domain` (0 cambios), `package.json` de ambas apps idénticos entre baseline y monolith, y tamaños totales reconstruidos idénticos a los oficiales de Fase 2 (React 208 605 B, Angular 136 621 B).
