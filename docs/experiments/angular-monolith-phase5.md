# Comparación de métricas — Angular Monolith (Fase 5) vs Baseline (Fase 2)

- **Estado:** Completado (Fase 5.1 — medición y análisis)
- **Evidencia cruda:** [results/angular-monolith-phase5.json](./results/angular-monolith-phase5.json)
- **Baseline inmutable:** [baseline-phase2.json](./results/baseline-phase2.json) y [baseline-phase2.md](./baseline-phase2.md)
- **Referencia React Monolith:** [react-monolith-phase4.json](./results/react-monolith-phase4.json) y [react-monolith-phase4.md](./react-monolith-phase4.md)
- **Hipótesis:** [hypotheses-phase5.md](../comparisons/hypotheses-phase5.md)
- **Documentos relacionados:** [Metodología de métricas](./metrics.md), [Scorecard](../comparisons/scorecard.md)

## 1. Objetivo

Responder objetivamente a la pregunta: **«¿Qué coste arquitectónico y técnico ha tenido completar el Angular Monolith (Fase 5) para que implemente el contrato funcional completo, partiendo del vertical slice de la Fase 2?»**

Esta fase es exclusivamente de medición y análisis: **no** se ha modificado código funcional de `apps/angular-app/`, `apps/react-app/` ni `packages/domain/`, ni el fixture, ni los contratos, ni `turbo.json`, ni el baseline, ni las hipótesis. La única excepción son este documento, el JSON de evidencia y el índice de `docs/experiments/`.

El objetivo principal es medir el **coste incremental** de implementar el mismo contrato funcional en Angular (baseline → monolith), y contextualizarlo con el coste ya medido en React (Fase 4.1). **No** es un ranking absoluto de frameworks.

## 2. Fuentes de evidencia

| Fuente                                                  | Rol                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/experiments/metrics.md`                           | Metodología aprobada (mediana + rango de 3 ejecuciones, build en frío, conteos estáticos). |
| `docs/experiments/baseline-phase2.md` + `.json`         | Baseline inmutable de Fase 2 (React, Angular, Domain).                                     |
| `docs/experiments/react-monolith-phase4.md` + `.json`   | Coste incremental de React Monolith (Fase 4.1), evidencia inmutable.                       |
| `docs/comparisons/hypotheses-phase5.md`                 | Hipótesis H1–H8 formuladas antes de implementar.                                           |
| `scripts/measure-baseline.mjs`                          | Script de medición **sin modificar** (acepta nombre de ejecución).                         |
| `docs/experiments/results/angular-monolith-phase5.json` | Evidencia cruda de esta medición (generada por el script).                                 |

## 3. Entorno

| Variable               | Valor                                                    |
| ---------------------- | -------------------------------------------------------- |
| SO                     | macOS (darwin-arm64)                                     |
| CPU                    | Apple M1 (8 cores)                                       |
| RAM                    | 16 GiB                                                   |
| Node.js                | v25.3.0                                                  |
| pnpm                   | 10.34.5                                                  |
| Dataset                | `operations-hub-v1.json` (v1)                            |
| Modo de build          | Producción, en frío                                      |
| Cachés                 | `dist` y `.angular/cache` eliminados antes de cada build |
| Navegador (Lighthouse) | Chrome 151.0.7922.170 (ver §10)                          |

Entorno idéntico al del baseline y de la Fase 4.1 (misma máquina, mismas versiones): los tiempos son comparables entre los tres ciclos de este laboratorio, con las limitaciones de ruido documentadas (§11).

## 4. Metodología

Se reutiliza íntegramente la metodología aprobada ([metrics.md](./metrics.md)) y el script `scripts/measure-baseline.mjs` **sin ninguna modificación**. La medición se lanzó como:

```bash
node scripts/measure-baseline.mjs angular-monolith-phase5
```

y escribió la evidencia en `results/angular-monolith-phase5.json` sin tocar el baseline. Mismo procedimiento que en Fase 3 y 4.1:

- Build en frío (eliminando `dist` y `.angular/cache`), 3 ejecuciones, mediana + rango.
- Tests: 3 ejecuciones, mediana + rango, número de tests.
- Lint/typecheck: una ejecución (pass/fail + ms).
- Conteos de código, dependencias y arquitectura: estáticos y deterministas (mismas heurísticas).
- gzip/brotli: `zlib` de Node (nivel por defecto), mismo procedimiento.

El script mide también React y Domain en la misma sesión (mismas condiciones), lo que permite contextualizar el incremento Angular con el incremento React sin asumir que las mediciones son independientes.

## 5. Métricas Angular Baseline (Fase 2, inmutable)

Valores de referencia extraídos de `baseline-phase2.json`:

| Métrica                                                 | Valor                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| LOC producción / tests                                  | 417 / 117 (ratio 0.28)                                                                             |
| Archivos fuente / test                                  | 13 / 3                                                                                             |
| Componentes · plantillas · adapters · stores · features | 3 · 3 · 1 · 1 · 4                                                                                  |
| Dependencias runtime / dev / transitivas                | 7 / 6 / 1074                                                                                       |
| Build (mediana, rango)                                  | 2720 ms (2700–2739)                                                                                |
| JS raw / gzip / brotli                                  | 136 621 B / 43 930 B / 39 156 B (1 chunk)                                                          |
| CSS raw / gzip / brotli                                 | 119 B / 125 B / 80 B                                                                               |
| Tests (nº, mediana, rango)                              | 6 · 2467 ms (2457–2625)                                                                            |
| Arquitectura                                            | imports de domain: 4 · entre features: 0 · salientes: 3 · adapters: 1 · shared: 0 · duplicación: 6 |

## 6. Métricas Angular Monolith (Fase 5, medido)

| Métrica                                                 | Valor                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| LOC producción / tests                                  | 2331 / 1043 (ratio 0.45)                                                                             |
| Archivos fuente / test                                  | 35 / 8                                                                                               |
| Componentes · plantillas · adapters · stores · features | 16 · 10 · 1 · 1 · 18                                                                                 |
| Dependencias runtime / dev / transitivas                | 7 / 6 / 1074                                                                                         |
| Build (mediana, rango)                                  | 2925 ms (2824–3372)                                                                                  |
| JS raw / gzip / brotli                                  | 179 634 B / 53 485 B / 47 348 B (1 chunk)                                                            |
| CSS raw / gzip / brotli                                 | 3438 B / 1135 B / 911 B                                                                              |
| Tests (nº, mediana, rango)                              | 61 · 3535 ms (3493–3768)                                                                             |
| Arquitectura                                            | imports de domain: 12 · entre features: 0 · salientes: 22 · adapters: 1 · shared: 0 · duplicación: 6 |
| Lint / typecheck                                        | OK (1040 ms) / OK (706 ms)                                                                           |

## 7. Tabla de deltas — Angular baseline → Angular Monolith

| Métrica                         |  Baseline | Angular Monolith | Variación absoluta | Variación % |
| ------------------------------- | --------: | ---------------: | -----------------: | ----------: |
| LOC producción                  |       417 |             2331 |              +1914 |       +459% |
| LOC tests                       |       117 |             1043 |               +926 |       +792% |
| Ratio test/código               |      0.28 |             0.45 |              +0.17 |         N/A |
| Archivos fuente                 |        13 |               35 |                +22 |       +169% |
| Archivos de test                |         3 |                8 |                 +5 |       +167% |
| Componentes                     |         3 |               16 |                +13 |       +433% |
| Plantillas                      |         3 |               10 |                 +7 |       +233% |
| Features                        |         4 |               18 |                +14 |       +350% |
| Adapters                        |         1 |                1 |                  0 |          0% |
| Stores                          |         1 |                1 |                  0 |          0% |
| Deps runtime                    |         7 |                7 |                  0 |          0% |
| Deps dev                        |         6 |                6 |                  0 |          0% |
| Deps transitivas                |      1074 |             1074 |                  0 |          0% |
| Build (mediana)                 |   2720 ms |          2925 ms |            +205 ms |       +7.5% |
| JS raw                          | 136 621 B |        179 634 B |          +43 013 B |      +31.5% |
| JS gzip                         |  43 930 B |         53 485 B |           +9 555 B |      +21.7% |
| JS brotli                       |  39 156 B |         47 348 B |           +8 192 B |      +20.9% |
| Chunks JS                       |         1 |                1 |                  0 |          0% |
| CSS raw                         |     119 B |          3 438 B |           +3 319 B |         N/A |
| Tests (nº)                      |         6 |               61 |                +55 |       +917% |
| Tiempo de tests (mediana)       |   2467 ms |          3535 ms |           +1068 ms |      +43.3% |
| Tiempo por test (mediana/nº)    |    411 ms |            58 ms |            −353 ms |      −85.9% |
| Importadores de domain          |         4 |               12 |                 +8 |       +200% |
| Imports entre features          |         0 |                0 |                  0 |          0% |
| Imports salientes de features   |         3 |               22 |                +19 |       +633% |
| Uso de adapters                 |         1 |                1 |                  0 |          0% |
| Directorios compartidos         |         0 |                0 |                  0 |          0% |
| Pares de duplicación deliberada |         6 |                6 |                  0 |          0% |

## 8. Comparación incremental React vs Angular

Ambos monoliths implementan el mismo contrato funcional (6 áreas, NAV-1…3, ACC-1…8). Los deltas miden el coste de pasar del vertical slice de Fase 2 al contrato completo en cada framework.

| Métrica                         | React (Fase 4.1) | Angular (Fase 5) | Lectura                                                                       |
| ------------------------------- | ---------------: | ---------------: | ----------------------------------------------------------------------------- |
| LOC producción (delta)          |            +1873 |            +1914 | Coste de código similar (+2% Angular)                                         |
| LOC tests (delta)               |             +975 |             +926 | Similar (−5% Angular)                                                         |
| Ratio test/código final         |             0.51 |             0.45 | Ambos por debajo de domain (1.11); cobertura de negocio concentrada en domain |
| Tests (delta)                   |              +76 |              +55 | Angular cubre el contrato con menos tests (naturaleza distinta, ver §9-H4)    |
| JS raw (delta)                  |        +24 985 B |        +43 013 B | Angular +72% más bytes que React en valor absoluto                            |
| JS gzip (delta)                 |         +5 073 B |         +9 555 B | Angular +88% más gzip que React                                               |
| Build (delta)                   |           −46 ms |          +205 ms | React dentro del ruido; Angular +7.5% con rangos sin solapar                  |
| Tiempo por test final           |            36 ms |            58 ms | Angular ~1.6× coste temporal por test                                         |
| Deps nuevas (runtime/dev/trans) |            0/0/0 |            0/0/0 | Ambos sin dependencias nuevas (H1)                                            |
| Imports entre features          |                0 |                0 | Ambos sin acoplamiento entre features (H5)                                    |
| Importadores de domain (delta)  |               +7 |               +8 | Crecimiento de uso del dominio similar                                        |

**Lectura centrada en el coste incremental:** implementar el mismo contrato costó a Angular un volumen de código casi idéntico al de React (≈1.9k LOC producción, ≈0.9k LOC tests), **cero dependencias nuevas** en ambos, y un incremento de bundle mayor en Angular (+43 kB raw vs +25 kB). El coste de build incremental de Angular (+205 ms) es real pero pequeño en valor absoluto; el coste por test es ~1.6× el de React.

## 9. Validación de hipótesis H1–H8

Criterios definidos en [hypotheses-phase5.md](../comparisons/hypotheses-phase5.md) (reglas de interpretación de la sección 2). No se fuerza ninguna hipótesis a confirmada.

### H1 — Dependencias

- **Hipótesis:** Angular implementará el contrato completo sin dependencias runtime nuevas.
- **Métrica:** `dependencies` (runtime / dev / transitivas).
- **Resultado:** 7 / 6 / 1074 en baseline y 7 / 6 / 1074 en monolith → delta **0 / 0 / 0**.
- **Evidencia:** `angular-monolith-phase5.json` → `dependencies.angular`; `package.json` sin cambios en `git status`.
- **Veredicto:** **CONFIRMADA**. El delta de dependencias runtime es 0. La Fase 5 no introdujo ninguna dependencia (ni runtime ni dev); las 1074 transitivas son la toolchain/ecosistema Angular ya presente en el baseline (no un coste de la Fase 5).

### H2 — Bundle

- **Hipótesis:** El incremento de bundle de Angular será inferior o comparable al de React (+25 kB raw), en parte por la compilación AOT de templates.
- **Métrica:** `build.assets` (raw / gzip / brotli, delta absoluto y porcentual vs baseline Angular).
- **Resultado:** Angular +43 013 B raw (+31.5%), +9 555 B gzip (+21.7%), +8 192 B brotli (+20.9%). React fue +24 985 B raw (+12.0%).
- **Evidencia:** deltas §7 y §8.
- **Veredicto:** **REFUTADA**. El incremento de bundle de Angular (+43 kB raw) es **superior** al de React (+25 kB raw), no inferior ni comparable (≈1.7× en raw, ≈1.9× en gzip). La AOT no redujo el coste incremental por debajo del de React en esta medición. Esto es un resultado válido del experimento (regla 1 de interpretación): la hipótesis se formula para ser contrastada, no para ser confirmada.

### H3 — Build

- **Hipótesis:** Angular tendrá un coste de build absoluto superior a React, pero el incremento por completar el contrato será razonable y reproducible.
- **Métrica:** `build.time` (mediana y rango de 3 ejecuciones, build en frío).
- **Resultado:** Angular baseline 2720 ms (2700–2739) → monolith 2925 ms (2824–3372): **+205 ms (+7.5%)**. React: 530 → 484 ms (−46 ms, dentro del ruido).
- **Evidencia:** `build.angular.runsMs` en ambos JSON.
- **Veredicto:** **CONFIRMADA**. El coste absoluto de Angular (2925 ms) es muy superior al de React (484 ms), como postulaba la hipótesis; el **incremento** por completar el contrato (+205 ms, +7.5%) es razonable y reproducible (los rangos baseline 2700–2739 y monolith 2824–3372 no se solapan, por lo que el incremento no es ruido, aunque es pequeño en valor absoluto). No se concluye que Angular «escala peor»: el dato dice que el coste de build absoluto es mayor, no que el incremento sea desproporcionado.

### H4 — Tests

- **Hipótesis:** Angular alcanzará cobertura funcional equivalente con un número similar de tests, aunque el coste temporal por test podría ser superior al de React.
- **Métrica:** `quality.tests` (nº de tests, tiempo total, tiempo/test, naturaleza).
- **Resultado:** Angular 6 → 61 tests; mediana 2467 → 3535 ms (+43.3%); **58 ms/test** final. React: 8 → 84 tests; **36 ms/test** final.
- **Evidencia:** `quality.angular.tests` y `quality.react.tests` (Fase 4.1).
- **Veredicto:** **CONFIRMADA**. La cobertura funcional es equivalente (ambos cubren el contrato completo, verificado en auditoría Fase 5.0 con 61 tests de integración real), el número de tests es similar en orden de magnitud (61 vs 84, sin buscar igualdad artificial) y el coste temporal por test es superior en Angular (58 vs 36 ms, ~1.6×). El tiempo/test **no** se usa como métrica de calidad (regla de la hipótesis): la naturaleza de los tests difiere (componentes standalone + templates en Angular vs componentes React), y el coste absoluto de la suite completa (3.5 s) sigue estando muy por debajo de cualquier presupuesto.

### H5 — Arquitectura

- **Hipótesis:** Angular mantendrá las mismas fronteras arquitectónicas que React: 0 imports entre features, 1 adapter, estado encapsulado, dominio compartido, sin shared innecesaria.
- **Métrica:** `architecture` (imports entre features, importadores del adapter, imports de dominio por capa, directorios compartidos, duplicación).
- **Resultado:** imports entre features **0**; adapter único (1 importador); importadores de domain 4 → 12; directorios shared/common **0**; 6 pares de duplicación deliberada.
- **Evidencia:** `architecture.angular` en `angular-monolith-phase5.json`; auditoría Fase 5.0 (ADR-002, signals, `asReadonly` + `computed`).
- **Veredicto:** **CONFIRMADA**. Las 5 fronteras de la hipótesis se mantienen con el contrato completo: 0 acoplamiento entre features (con 6 features), un único adapter de datos, estado de dominio encapsulado en el store (signals privados → `asReadonly`), dominio compartido vía `@operations-hub/domain` y ausencia de capa `shared`. La duplicación deliberada (6 pares) es la prevista por ADR-002 (orquestación de estado e integración, nunca lógica de dominio).

### H6 — Developer Experience

- **Hipótesis:** El coste observable de implementar una feature equivalente será comparable entre React y Angular, aunque la distribución de archivos y responsabilidades difiera.
- **Métrica:** flujo observable documentado (Anexo A de `baseline-phase2.md`, sección 9 de `react-monolith-phase4.md`).
- **Resultado:** la feature Teams se implementó en ambos frameworks con el mismo flujo de 4 pasos (crear archivos de feature → registrar en el shell → tests → validar). Angular usa componente + plantilla (`teams.component.ts` + `.html`) frente al archivo único `.tsx` de React; ambos requieren 2 archivos de feature + wiring + tests.
- **Evidencia:** Anexo A de baseline; `git status` de Fase 5 (archivos creados por feature); documento de Fase 4.1 §9.
- **Veredicto:** **CONFIRMADA** (parcial). El coste observable es comparable (mismo nº de pasos y de archivos de feature); la diferencia está en la distribución: Angular separa lógica (`.ts`) y template (`.html`) y registra componentes standalone en el shell, mientras React combina ambos en un archivo. No se crea ninguna puntuación subjetiva de DX (regla de la hipótesis): solo se documenta el flujo observado.

### H7 — Código

- **Hipótesis:** Angular probablemente requerirá más LOC de producción por feature (componentes, decoradores, separación HTML/TS), sin implicar peor arquitectura.
- **Métrica:** `code` (LOC producción/tests, ratio, archivos por feature).
- **Resultado:** Angular monolith 2331 LOC producción (vs React 2198) y ratio test/código 0.45 (vs 0.51). LOC por archivo de feature menor en Angular por la separación HTML/TS (18 archivos de feature + 16 componentes + 10 plantillas frente a 9 archivos de feature en React).
- **Evidencia:** `code.angular` / `code.react` en los JSON.
- **Veredicto:** **CONFIRMADA** (parcial). El total de LOC de producción es ligeramente superior en Angular (+6%: 2331 vs 2198) y la distribución por archivo es distinta (separación HTML/TS, más archivos por feature). El ratio test/código es menor (0.45 vs 0.51). **No** se interpreta LOC como calidad (regla 6 de interpretación): la arquitectura (H5) es equivalente y el dominio compartido concentra las reglas (ratio 1.11 en domain).

### H8 — Accesibilidad

- **Hipótesis:** Ambas implementaciones alcanzarán resultados equivalentes de accesibilidad (mismo contrato ACC-1…8).
- **Métrica:** Lighthouse accessibility.
- **Resultado:** **No medible** — Chrome headless bloqueado (ver §10). Sin resultados inventados.
- **Evidencia:** §10 de este documento; §8 de `react-monolith-phase4.md`.
- **Veredicto:** **NO CONCLUYENTE**. No existe evidencia real de ejecución. La implementación en código cubre ACC-1…8 (labels, `aria-describedby`, `aria-live`, landmarks, `:focus-visible`, contraste AA estático — verificado en auditoría Fase 5.0), pero la hipótesis no puede confirmarse sin Lighthouse. Se documenta el motivo explícitamente (regla 8 de interpretación).

## 10. Lighthouse

**No medible en este entorno — motivo documentado (regla 6 de `metrics.md`).**

Se intentó ejecutar Lighthouse siguiendo el mismo procedimiento que en Fase 4.1 (§8): build de producción servido por `http-server` temporal (puerto local, HTTP 200 verificado) y Chrome headless 151.0.7922.170 (binario local).

Resultado: **el bloqueo persiste y es idéntico al de Fase 4.1**, con una agravante:

- **Chrome headless se cuelga al cargar URLs `http://`**: con `--dump-dom` contra la SPA de Angular, el proceso seguía vivo pasados 15 s y el volcado mostraba un interstitial (title `localhost`), no la aplicación.
- **Esta vez tampoco terminan las URLs `data:`**: en Fase 4.1 las `data:` cargaban correctamente; en esta prueba el mismo binario volcó el contenido esperado (`ok-data-url`) pero **el proceso tampoco salió** (hubo que matarlo). El entorno de Chrome headless local está más degradado que en Fase 4.1.
- El título real de la app es `AngularApp` (`index.html`), confirmando que el volcado HTTP mostró el interstitial del navegador, no la app.

Esto es una **limitación del entorno** (navegador headless + red local de esta máquina), independiente de la aplicación: la app se sirve correctamente (HTTP 200), sus assets cargan y sus 61 tests pasan en jsdom. **No se modificó ningún código** para sortear el bloqueo (regla de la fase) y **no se sustituyó Lighthouse por otra métrica** presentada como equivalente.

Consecuencia: Performance, Accessibility, Best Practices y SEO **no se registran** en esta medición. H8 queda NO CONCLUYENTE, igual que en Fase 4.1 para React. La comparación de accesibilidad (H8) sigue pendiente de un entorno donde Chrome headless funcione (p. ej. CI con Chromium).

## 11. Limitaciones

- **Lighthouse no medible** en este entorno (Chrome headless colgado con HTTP e inestable incluso con `data:`; §10). Sin puntuaciones en esta medición.
- **Cobertura:** sigue «no medible» (decisión de Fase 3; no se añadió `@vitest/coverage-v8`).
- **Tiempos:** de pared, misma máquina y sesión; sensibles a la carga de fondo. Mediana + rango de 3 mitigado pero no eliminado. El build de Angular mostró una primera ejecución atípica (3372 ms vs 2925/2824), consistente con ruido de primer arranque; se reporta el rango completo.
- **Build en frío:** misma definición que baseline (dist + `.angular/cache` eliminados); no se comparan cachés calientes.
- **gzip/brotli:** calculados con `zlib` de Node (nivel por defecto), no con configuración de servidor/CDN; comparables entre sí, no absolutos.
- **Métricas de arquitectura:** heurísticas por patrón de import y convención de directorios (mismas del baseline); no son análisis formal de grafos.
- **Conteo transitivo** (`pnpm list --depth Infinity`): incluye devDependencies del árbol; las 1074 de Angular reflejan la toolchain (CLI/compiler) como dev deps, no un coste de la Fase 5.
- **Un solo chunk:** ambas apps sin code splitting (decisión de alcance del MVP).
- **El script no se modificó**: la ejecución `angular-monolith-phase5` usa exactamente el mismo mecanismo que el baseline y la Fase 4.1; la única diferencia es el nombre del archivo de salida.

## 12. Anomalías

- **Chrome headless degradado respecto a Fase 4.1**: en 4.1 las URLs `data:` cargaban (el proceso salía); en esta sesión el proceso no termina ni con `data:`. No afecta a ninguna métrica de la Fase 5, pero implica que el bloqueo del entorno es peor que el documentado y refuerza la NO CONCLUSIÓN de H8.
- **Primera ejecución de build de Angular fuera de rango** (3372 ms; mediana 2925): atribuible a ruido de primer arranque (cold caches del SO/bundler); se documenta el rango completo en lugar de ocultarlo.
- **Build de React −46 ms vs baseline** en Fase 4.1 y 492 ms en esta medición: consistente con el rango de ruido (459–551); no se interpreta como mejora.

## 13. Conclusiones

1. **Cero dependencias nuevas (H1 CONFIRMADA):** 7/6/1074 invariables con el contrato completo. La decisión de delegar reglas/validación en `@operations-hub/domain` (ADR-001) y resolver estado con signals nativos (ADR-002) absorbió todo el crecimiento en código propio — idéntico patrón al de React.
2. **El incremento de bundle de Angular (+43 kB raw) supera al de React (+25 kB raw) (H2 REFUTADA):** la compilación AOT no hizo el crecimiento incremental menor. En términos relativos Angular creció +31.5% sobre una base menor; en bytes absolutos el coste incremental del contrato es ~1.7× el de React. Resultado válido del experimento, sin connotación de calidad.
3. **El build de Angular sigue siendo más caro en absoluto (2925 vs 484 ms) y su incremento (+205 ms, +7.5%) es real pero pequeño (H3 CONFIRMADA):** no hay evidencia de «escalado peor» en el incremento; solo de coste absoluto mayor, como postulaba la hipótesis.
4. **La suite de tests creció ×10 (6 → 61) con coste por test ~1.6× el de React (58 vs 36 ms) (H4 CONFIRMADA):** la cobertura funcional es equivalente con menos tests que React (61 vs 84) y sin degradar el bucle de retroalimentación (3.5 s total).
5. **La disciplina arquitectónica se mantuvo intacta (H5 CONFIRMADA):** 0 imports entre features (con 6 features), un único adapter, estado encapsulado en el store de signals, dominio compartido, sin directorios shared y 6 pares de duplicación deliberada — idéntico a React.
6. **El coste observable por feature es comparable (H6 CONFIRMADA) y el volumen de código similar (H7 CONFIRMADA parcial):** ≈1.9k LOC de producción en ambos, con distribución distinta (HTML/TS separados en Angular). LOC no se interpreta como calidad.
7. **Lighthouse no medible (H8 NO CONCLUYENTE):** bloqueo de Chrome headless del entorno (peor que en Fase 4.1); sin resultados inventados. Pendiente de un entorno con Chromium funcional.

## 14. Resumen ejecutivo

| Hipótesis        | Veredicto                | Dato clave                                       |
| ---------------- | ------------------------ | ------------------------------------------------ |
| H1 Dependencias  | **CONFIRMADA**           | delta 0/0/0                                      |
| H2 Bundle        | **REFUTADA**             | +43 kB raw Angular vs +25 kB React               |
| H3 Build         | **CONFIRMADA**           | +205 ms (+7.5%), rangos sin solapar              |
| H4 Tests         | **CONFIRMADA**           | 61 tests; 58 ms/test vs 36 ms React              |
| H5 Arquitectura  | **CONFIRMADA**           | 0 imports entre features, 1 adapter, sin shared  |
| H6 DX            | **CONFIRMADA** (parcial) | mismo nº de pasos; distribución HTML/TS distinta |
| H7 Código        | **CONFIRMADA** (parcial) | 2331 vs 2198 LOC; ratio 0.45 vs 0.51             |
| H8 Accesibilidad | **NO CONCLUYENTE**       | Chrome headless bloqueado (entorno)              |

El Angular Monolith implementa el contrato funcional completo con un coste incremental comparable al de React en código y dependencias, mayor en bundle y build absoluto, y una arquitectura que preserva todas las fronteras de ADR-002. La comparación experimental queda registrada con evidencia reproducible (`node scripts/measure-baseline.mjs angular-monolith-phase5`); el baseline y las hipótesis permanecen inmutables.

## Anexo — Validación de la medición

- `node scripts/measure-baseline.mjs angular-monolith-phase5` ✓ (genera `results/angular-monolith-phase5.json`).
- `pnpm --dir apps/angular-app build` ✓ (dentro del script) · `pnpm --dir apps/angular-app test` ✓ (61 tests en verde).
- `pnpm format:check` ✓ · `pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm test` ✓ · `pnpm build` ✓.
- Sin commit. Solo se modificaron documentos/resultados: `docs/experiments/angular-monolith-phase5.md`, `docs/experiments/results/angular-monolith-phase5.json` y el índice de `docs/experiments/README.md`.
