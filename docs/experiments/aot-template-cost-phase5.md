# Fase 5.5 — Aislamiento del coste de templates AOT en Angular

## 1. Objetivo

Determinar experimentalmente cuánto del incremento de JS del Angular Monolith (+43 013 B frente a su baseline, de los que +36 571 B son app code según Fase 5.4) procede de:

1. Templates Angular compiladas mediante AOT.
2. Lógica TypeScript/componentes.
3. Otros costes propios de la implementación Angular.

El objetivo **no** es optimizar el bundle ni modificar el producto: es aislar causalmente, mediante un experimento controlado, la contribución de las templates AOT al incremento de Angular y al diferencial de +18 028 B frente a React.

El experimento se ejecutó **exclusivamente** en un directorio temporal (`/tmp/lab-angular-aot`), fuera del árbol principal, con una copia exacta del Angular Monolith actual. El código funcional real no se ha modificado.

## 2. Hipótesis H9

> **H9 — Coste de templates AOT.** Una parte significativa del incremento de app code de Angular (+36 571 B frente al baseline Angular) procede de las instrucciones JavaScript generadas por las templates AOT.

Criterios predefinidos:

- **CONFIRMADA**: el experimento permite medir un incremento atribuible específicamente a templates AOT.
- **REFUTADA**: eliminar/reducir sustancialmente las templates no produce una reducción significativa del JS generado.
- **NO CONCLUYENTE**: el diseño experimental no permite separar template y lógica.

No se asumió previamente qué sería "significativo"; el resultado sale de los datos.

## 3. Diseño experimental

Copias de trabajo del Angular Monolith actual (commit de trabajo de Fase 5, sin commit) en `/tmp/lab-angular-aot/apps/angular-app`, verificadas **idénticas** al árbol principal (`diff -r` = 0). Única variable manipulada: la cantidad de template compilada en **2 componentes seleccionados**. Todo lo demás (lógica TS, imports, servicios, estado, tipos, dominio, fixture, configuración, versiones) permanece constante.

| Variante                      | Cambio respecto a la real                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Angular Monolith real** | Ninguno (reproduce 179 634 B JS raw)                                                                                                                      |
| **B — Template-minimal**      | `template: ''` en dashboard y tasks; misma lógica TS/imports/estado/servicios                                                                             |
| **C — Template-rich**         | Templates artificialmente más ricas para dashboard y tasks (elementos, bindings, interpolaciones, `@if`/`@for`, eventos, atributos ARIA); misma lógica TS |

Cada variante se construyó con `ng build --stats-json` (flag CLI reversible) y se guardaron `stats.json` (metafile esbuild) + `main.js` en `/tmp/lab-angular-aot/artifacts-{A,B,C}/`.

## 4. Variantes A/B/C

|                       |      A (real) | B (minimal) |  C (rich) |
| --------------------- | ------------: | ----------: | --------: |
| JS raw                | **179 634 B** |   169 041 B | 182 654 B |
| App code (`src/app/`) |      44 142 B |    33 600 B |  47 162 B |
| Runtime `@angular/*`  |     109 943 B |   109 892 B | 109 943 B |
| Domain                |      16 438 B |    16 438 B |  16 438 B |
| RxJS                  |       8 634 B |     8 634 B |   8 634 B |
| Chunks                |             1 |           1 |         1 |

La variante A reproduce exactamente el monolith oficial (179 634 B). Domain y RxJS no cambian en ninguna variante (control intacto). El runtime solo varía −51 B en B.

## 5. Componentes seleccionados

Selección justificada: un componente sencillo y uno con template relativamente compleja, los dos con template real y representativos de la app.

| Componente               | Archivo                                               | LOC TS | LOC template | Bindings aprox.                     | Estructuras de control                      | Bytes en A |
| ------------------------ | ----------------------------------------------------- | ------ | ------------ | ----------------------------------- | ------------------------------------------- | ---------- |
| **Dashboard** (sencillo) | `features/dashboard/dashboard.component.ts` + `.html` | 34     | 34           | ~12 (6 kpi-cards + interpolaciones) | 1 `@if` + 1 `@for`                          | 1 680 B    |
| **Tasks** (complejo)     | `features/tasks/tasks.component.ts` + `.html`         | 120    | 102          | ~30 (bindings, eventos, selects)    | 2 `@if`/`@else` + 3 `@for` + `@if` anidados | 5 806 B    |

El componente Tasks es el que más creció en Fase 5.4 (+5 806 B de módulo); Dashboard es el más pequeño de las features con template. Juntos suman 136 LOC template (18,5 % del total de la app, 735 LOC).

## 6. Condiciones controladas

- Misma copia de `apps/angular-app` (verificada con `diff -r`).
- Mismo `node_modules` (symlink): mismas versiones de Angular 21.2.21, TypeScript 5.9.2 y dependencias.
- Misma configuración de build (producción, optimización, AOT, minificación).
- Mismo flag CLI `--stats-json`; mismo mecanismo de análisis que Fase 5.3/5.4 (metafile esbuild, `bytesInOutput` por módulo).
- Misma máquina/sesión/Node; dominio y fixture intactos.
- Builds deterministas: la variante A reconstruida produce el mismo hash (`main-KDDRVGPV.js`) y los mismos bytes.

## 7. Resultados brutos

| Métrica  |       A |       B |       C |       Δ A→B |      Δ A→C |
| -------- | ------: | ------: | ------: | ----------: | ---------: |
| JS raw   | 179 634 | 169 041 | 182 654 | **−10 593** | **+3 020** |
| App code |  44 142 |  33 600 |  47 162 |     −10 542 |     +3 020 |
| Runtime  | 109 943 | 109 892 | 109 943 |         −51 |          0 |
| Domain   |  16 438 |  16 438 |  16 438 |           0 |          0 |
| RxJS     |   8 634 |   8 634 |   8 634 |           0 |          0 |

## 8. Diferencia de bytes por componente

**Coste directo (módulo del componente, A→B):**

| Componente             | Bytes A | Bytes B |    Δ directo | B/LOC template |
| ---------------------- | ------: | ------: | -----------: | -------------: |
| dashboard.component.ts |   1 680 |     451 | **−1 229 B** |           36,1 |
| tasks.component.ts     |   5 806 |   1 768 | **−4 038 B** |           39,6 |
| **Total directo**      |         |         | **−5 267 B** | **38,7 media** |

**Cascada (tree-shaking, A→B):** al quedar las templates vacías, los componentes hijos que solo referenciaban esas templates se eliminan del bundle:

| Módulo                                | Bytes A |       Bytes B |        Δ |
| ------------------------------------- | ------: | ------------: | -------: |
| features/tasks/task-form.component.ts |   4 629 | 0 (eliminado) | −4 629 B |
| components/kpi-card.component.ts      |     686 | 0 (eliminado) |   −686 B |
| runtime `@angular/core`               |       — |             — |    −51 B |

**Sensibilidad (A→C, templates enriquecidas, misma lógica TS):**

| Componente | Bytes A | Bytes C |        Δ | LOC añadidos | B/LOC marginal |
| ---------- | ------: | ------: | -------: | -----------: | -------------: |
| dashboard  |   1 680 |   3 506 | +1 826 B |         +106 |           17,2 |
| tasks      |   5 806 |   7 000 | +1 194 B |          +49 |           24,4 |

**Dato clave de causalidad:** aumentar la cantidad de template compilada aumenta de forma observable el JS generado (+3 020 B al enriquecer solo 2 templates), confirmando la dirección causal template → bytes.

## 9. Análisis de instrucciones AOT

- **NO MEDIBLE**: el conteo de instrucciones `ɵɵ*` en el bundle minificado de producción devuelve 0 ocurrencias en las tres variantes (esbuild manglea los identificadores `ɵɵ` en producción). Se intentó y se documenta como limitación; no se construyó una variante sin optimización porque eso habría roto la condición controlada de configuración.
- **Proxy cuantitativo utilizado**: `bytesInOutput` del metafile por módulo (exacto). Las instrucciones `ɵɵ*` generadas por cada template quedan dentro del módulo de su componente; la resta A−B mide exactamente esas instrucciones (la clase TS se conserva íntegra en B, verificable porque el módulo B conserva los miembros de la clase).
- El delta A−B por componente (1 229 y 4 038 B) es, por tanto, una medida **directa** de las instrucciones de template compiladas + imports asociados, sin incluir la lógica de la clase.

## 10. Contribución estimada al app code

**MEDIDO (directo):** las templates de los 2 componentes seleccionados (136 LOC de 735) generan **5 267 B** de instrucciones compiladas (11,9 % del app code del monolith, 44 142 B). Incluyendo la cascada (componentes hijos eliminados + runtime), el efecto total medido de esas 2 templates es **10 593 B** (24,0 % del app code).

**INFERIDO (extrapolación lineal a los 735 LOC template de la app):**

| Tasa                             | Valor | Estimación app code | % app code (44 142 B) | % incremento (+36 571 B) |
| -------------------------------- | ----: | ------------------: | --------------------: | -----------------------: |
| Alta (medida: 38,7 B/LOC)        |  38,7 |            28 465 B |                64,5 % |                   77,8 % |
| Baja (marginal rica: 17,2 B/LOC) |  17,2 |            12 661 B |                28,7 % |                   34,6 % |
| **Rango**                        |       | **12 661–28 465 B** |       **28,7–64,5 %** |          **34,6–77,8 %** |

El rango es amplio porque las templates enriquecidas (contenido más simple) tienen una tasa marginal menor que las templates reales densas en bindings. La estimación central (tasa medida) apunta a **~28,5 kB, ~64 % del app code**.

## 11. Comparación con los +36 571 B

Referencia Fase 5.4 (no alterada): incremento JS raw +43 013 B; app code +36 571 B; runtime +4 102 B; domain +2 322 B; rxjs +18 B.

| Métrica                               |           Bytes | % del app code +36 571 B | % del total +43 013 B |
| ------------------------------------- | --------------: | -----------------------: | --------------------: |
| Coste directo medido (2 componentes)  |         5 267 B |                   14,4 % |                12,2 % |
| Efecto total medido A→B (con cascada) |        10 593 B |                   29,0 % |                24,6 % |
| Extrapolación a toda la app (rango)   | 12 661–28 465 B |              34,6–77,8 % |           29,4–66,2 % |

**Interpretación:** las templates AOT explican una parte significativa del app code de Angular: al menos ~15 % (medido directo con solo 2 de 17 componentes con template) y plausiblemente la mayor parte del app code (estimación central ~64 %). La lógica TS de los componentes (clases, `computed`, métodos, servicios, formularios) y los componentes hijos no relacionados con templates constituyen el resto.

## 12. Estado de H9

**H9: CONFIRMADA.**

El experimento permite medir un incremento atribuible específicamente a templates AOT:

- Quitar las templates de 2 componentes (únicamente eso) reduce el bundle en 5 267 B directos (y 10 593 B con cascada), con lógica TS intacta.
- Enriquecer las mismas templates aumenta el JS de forma proporcional (+3 020 B), confirmando la causalidad.
- La estimación para toda la app sitúa el coste de templates AOT entre ~12,7 y ~28,5 kB del app code (28,7–64,5 %), con la tasa medida apuntando a ~28,5 kB.

**Precisión:** el valor directo (5 267 B) es exacto; el rango extrapolado es una estimación con amplia incertidumbre y debe leerse como tal.

## 13. Limitaciones

1. **El coste directo incluye la template compilada + imports asociados del módulo**, no solo las instrucciones `ɵɵ*` (no separables a nivel de módulo con el metafile). La clase TS se conserva íntegra, por lo que la resta mide las instrucciones de template y sus helpers de import.
2. **La cascada (5 315 B) contiene template + lógica de los componentes hijos** (task-form, kpi-card): no es atribuible solo a templates, aunque es una consecuencia directa de cambiar la template.
3. **La extrapolación es lineal** y asume representatividad de los 2 componentes; las tasas marginales de contenido enriquecido son menores (17–24 B/LOC) que las de las templates reales (36–40 B/LOC), de ahí el rango amplio.
4. **No se midió el coste equivalente de JSX en React**: el experimento cuantifica el coste de templates dentro de Angular, no la diferencia Angular−React (el JSX también genera código).
5. **Conteo de `ɵɵ*` no medible** en el bundle minificado (mangled); se usó bytes por módulo como proxy.
6. Las variantes experimentales viven en `/tmp/lab-angular-aot` (fuera del repo) y no se versionan; son reconstruibles según el anexo.

## 14. Amenazas a la validez

1. **Confusión template/lógica en la cascada**: el efecto A→B total (10 593 B) no es "solo template" — incluye componentes hijos completos. Se mitiga separando directo vs cascada en el análisis.
2. **Tree-shaking no deseado**: al vaciar la template, el compilador puede descartar código que la template referenciaba (cascada). Es un efecto real de la manipulación, documentado y medido por separado.
3. **Representatividad de la selección**: 2 de 17 componentes. Se eligieron el más complejo (tasks) y el más sencillo (dashboard); la extrapolación asume linealidad y se reporta como rango.
4. **Tasa marginal vs promedio**: las templates enriquecidas son más simples por LOC; usar su tasa como límite bajo es conservador, no exacto.
5. **Determinismo**: verificado (mismo hash y bytes al reconstruir A). Sin componente temporal → sin necesidad de 3 ejecuciones.
6. **No ciego**: el experimentador conoce la manipulación, pero la medición es objetiva (bytes del metafile).

## 15. Reproducibilidad

Artefactos y comandos (todo en `/tmp`, nada del árbol principal):

```bash
# 1. Copia del monolith actual (fuera del repo)
rm -rf /tmp/lab-angular-aot && mkdir -p /tmp/lab-angular-aot/apps
rsync -a --exclude dist --exclude node_modules \
  apps/angular-app/ /tmp/lab-angular-aot/apps/angular-app/
ln -s /Users/plopez7/Dev/frontend-architecture-lab/apps/angular-app/node_modules \
  /tmp/lab-angular-aot/apps/angular-app/node_modules
# (verificar: diff -r --exclude dist --exclude node_modules = idéntico)

# 2. Variante A (real)
cd /tmp/lab-angular-aot/apps/angular-app && ./node_modules/.bin/ng build --stats-json
mkdir -p /tmp/lab-angular-aot/artifacts-A
cp dist/angular-app/stats.json /tmp/lab-angular-aot/artifacts-A/stats.json
cp dist/angular-app/browser/main-*.js /tmp/lab-angular-aot/artifacts-A/main.js

# 3. Variante B (template: '' en dashboard y tasks, mismo .ts)
sed -i '' "s|templateUrl: './dashboard.component.html'|template: ''|" \
  src/app/features/dashboard/dashboard.component.ts
sed -i '' "s|templateUrl: './tasks.component.html'|template: ''|" \
  src/app/features/tasks/tasks.component.ts
# build + guardar artifacts-B igual que A

# 4. Variante C (restaurar templateUrl y usar templates ricas, mismas en el informe)
# build + guardar artifacts-C igual que A

# 5. Análisis (genera el JSON)
node scripts/analyze-aot-template-cost.mjs
```

El script `scripts/analyze-aot-template-cost.mjs` lee `artifacts-{A,B,C}/{stats.json, main.js}` (ruta configurable con `AOT_ARTIFACTS_DIR`) y genera `docs/experiments/results/aot-template-cost-phase5.json` con el mecanismo de atribución de Fase 5.3/5.4. El LOC de template por componente se mide desde el repositorio (mismo conteo que la sección 5).

## 16. Conclusión

- **H9: CONFIRMADA.**
- **Bytes atribuibles experimentalmente a templates AOT:** 5 267 B directos medidos (2 componentes), 10 593 B con cascada; extrapolados a toda la app: **12 661–28 465 B** (estimación central ~28,5 kB con la tasa medida).
- **% respecto a los +36 571 B de app code:** 14,4 % directo medido; 29,0 % con cascada; 34,6–77,8 % extrapolado.
- **% respecto a los +43 013 B de incremento total:** 12,2 % directo; 24,6 % con cascada; 29,4–66,2 % extrapolado.
- **Qué permanece sin explicar:** la lógica TS de los componentes (clases, `computed`, métodos, formularios, servicios) — el resto del app code —, la parte de los componentes hijos no relacionada con templates, y el coste equivalente de JSX en React (no medido en este experimento).
- **Siguiente experimento recomendado:** aplicar el mismo diseño experimental a React (variante con JSX mínimo vs real vs rico, midiendo el bundle con source map/VLQ) para cuantificar el coste de JSX compilado y poder comparar directamente "coste de template AOT vs coste de JSX" en el diferencial de app code (+11 586 B de la Fase 5.4). Esto convertiría la atribución del +18 028 B en una comparación explícita de código generado por template.

**Regla final respetada:** experimento científico (validez, reproducibilidad, trazabilidad), sin contaminar el producto (0 cambios funcionales), sin optimizar, sin refactorizar, sin tocar React ni el dominio. Solo medición.
