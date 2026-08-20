# Baseline de Fase 2 — Resultados de medición

- **Estado:** Aprobado (Fase 3 — Baseline y métricas del laboratorio)
- **Fecha de medición:** 2026-08-20
- **Evidencia cruda:** [results/baseline-phase2.json](./results/baseline-phase2.json)
- **Documentos relacionados:** [Metodología de métricas](./metrics.md) (aprobada, Fase 0.1), [Scorecard](../comparisons/scorecard.md), [Arquitectura frontend](../architecture/frontend-architecture.md)

> **Nota:** `docs/experiments/metrics.md` sigue siendo exclusivamente la metodología/contrato de medición (no se modificó). Este documento contiene el primer ciclo de resultados: el **baseline de Fase 2**.

## 1. Objetivo

Convertir el estado actual del repositorio (Fase 2: `@operations-hub/domain` + `react-app` + `angular-app`) en un **baseline arquitectónico medible** que sirva de punto de referencia para fases posteriores. El baseline permite comparar React y Angular de forma objetiva (métricas) y por rúbrica (criterios cualitativos, ver scorecard), sin convertirlo en una competición artificial: el objetivo es estudiar decisiones arquitectónicas y sus trade-offs.

Este ciclo **no mide** Lighthouse (diferido al primer ciclo de comparación, cuando las apps tengan más vistas) ni cobertura (no configurada; se documenta el motivo en §9).

## 2. Metodología

Se sigue íntegramente la metodología aprobada en [metrics.md](./metrics.md):

- **Mediciones comparativas de ingeniería**, no benchmarks científicos.
- Métricas temporales (build, tests): **mediana y rango de 3 ejecuciones**, en la misma sesión y entorno.
- Lint y typecheck: una ejecución, registrando pass/fail y duración.
- Conteos estáticos (código, dependencias, arquitectura): deterministas.
- Toda métrica con su limitación explícita (§9).

**Reproducibilidad:** desde la raíz del repositorio, `pnpm measure` ejecuta el ciclo completo y regenera el JSON de evidencia. El script `scripts/measure-baseline.mjs` usa únicamente built-ins de Node (cero dependencias nuevas). Los ciclos futuros deben usar un nombre distinto (`pnpm measure -- <nombre>` no aplica; ejecutar `node scripts/measure-baseline.mjs <nombre>`) para no sobrescribir este baseline.

**Procedimiento de captura:**

1. Se registra el entorno (Node, pnpm, CPU, RAM, SO).
2. Se construye `@operations-hub/domain` (una ejecución, informativa: es infraestructura compartida, no un experimento).
3. Por aplicación: se eliminan `dist` y, en Angular, también `.angular/cache` (**build en frío**); se cronometra `pnpm build` 3 veces.
4. Se recolectan los activos JS/CSS del último build: tamaño raw, gzip y brotli (calculados con `zlib` de Node, nivel por defecto).
5. Por paquete: `pnpm test` 3 veces (mediana + rango + nº de tests) y `pnpm lint`/`pnpm typecheck` una vez.
6. Análisis estático: conteo de código, dependencias y métricas de arquitectura.

## 3. Entorno de medición

| Variable      | Valor                                               |
| ------------- | --------------------------------------------------- |
| SO            | macOS (darwin-arm64)                                |
| CPU           | Apple M1 (8 cores)                                  |
| RAM           | 16 GiB                                              |
| Node.js       | v25.3.0                                             |
| pnpm          | 10.34.5                                             |
| Dataset       | `operations-hub-v1.json` (v1)                       |
| Modo de build | Producción                                          |
| Cachés        | Builds en frío (dist y `.angular/cache` eliminados) |
| Red           | Sin red para datos (fixture local)                  |

> Limitación transversal: Node v25.3.0 local difiere del Node 22 fijado en CI. Los tiempos **no** se comparan entre máquinas; el entorno queda registrado para reproducibilidad.

## 4. Métricas

Métricas medidas por el script (definiciones completas en [metrics.md](./metrics.md)):

- **Código**: archivos fuente (prod/test), líneas de código (prod/test), ratio test/código, y desglose por rol (componentes, hooks, services, adapters, stores, plantillas, features).
- **Dependencias**: runtime directas, dev directas y transitivas totales (`pnpm list --depth Infinity`).
- **Build**: tiempo de build en frío (mediana+rango), tamaño de activos JS/CSS (raw/gzip/brotli), nº de chunks.
- **Calidad**: typecheck y lint (pass/fail + ms), nº de tests y tiempo de ejecución (mediana+rango).
- **Arquitectura**: archivos que importan el dominio por capa, imports entre features, imports relativos salientes de features, uso de adapters, directorios compartidos y duplicación deliberada entre apps.
- **Domain**: archivos, líneas, tests y exports públicos (`src/index.ts`).
- **Developer Experience**: pasos observables y comandos reales para añadir una feature equivalente (Anexo A).

## 5. Resultados React (`apps/react-app`)

| Métrica                                  | Valor                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Archivos fuente / líneas                 | 10 / 325                                                          |
| Archivos de test / líneas                | 4 / 137                                                           |
| Ratio test/código                        | 0.42                                                              |
| Roles                                    | 2 componentes, 1 hook, 1 service, 1 adapter, 2 páginas de feature |
| Dependencias runtime / dev / transitivas | 3 / 10 / 249                                                      |
| Build (mediana, rango)                   | 530 ms (524–543)                                                  |
| JS final                                 | 208 562 B raw · 63 499 B gzip · 54 534 B brotli (1 chunk)         |
| CSS                                      | 119 B raw · 125 B gzip · 85 B brotli (1 chunk)                    |
| Tests                                    | 8 tests · mediana 1339 ms (1309–1515)                             |
| Lint / typecheck                         | OK (947 ms) / OK (983 ms)                                         |

## 6. Resultados Angular (`apps/angular-app`)

| Métrica                                  | Valor                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Archivos fuente / líneas                 | 13 / 417                                                                                              |
| Archivos de test / líneas                | 3 / 117                                                                                               |
| Ratio test/código                        | 0.28                                                                                                  |
| Roles                                    | 3 componentes, 3 plantillas, 1 adapter, 1 store, 4 archivos de feature (2 componentes + 2 plantillas) |
| Dependencias runtime / dev / transitivas | 7 / 6 / 1074                                                                                          |
| Build (mediana, rango)                   | 2720 ms (2700–2739)                                                                                   |
| JS final                                 | 136 621 B raw · 43 930 B gzip · 39 156 B brotli (1 chunk)                                             |
| CSS                                      | 119 B raw · 125 B gzip · 80 B brotli (1 chunk)                                                        |
| Tests                                    | 6 tests · mediana 2467 ms (2457–2625)                                                                 |
| Lint / typecheck                         | OK (780 ms) / OK (725 ms)                                                                             |

## 7. Resultados Domain (`packages/domain`)

| Métrica                                  | Valor                                |
| ---------------------------------------- | ------------------------------------ |
| Archivos fuente / líneas                 | 7 / 760                              |
| Archivos de test / líneas                | 6 / 840                              |
| Ratio test/código                        | 1.11                                 |
| Exports públicos (`src/index.ts`)        | 48                                   |
| Dependencias runtime / dev / transitivas | 0 / 2 / 197                          |
| Build (1 ejecución, informativa)         | 577 ms                               |
| Tests                                    | 103 tests · mediana 761 ms (760–761) |
| Lint / typecheck                         | OK (832 ms) / OK (765 ms)            |

## 8. Arquitectura — métricas de acoplamiento

| Métrica                                                                           | React                                                         | Angular                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Archivos de producción que importan `@operations-hub/domain`                      | 6                                                             | 4                                     |
| Imports de dominio por capa                                                       | adapters 1 · components 1 · features 2 · hooks 1 · services 1 | domain (adapter+store) 2 · features 2 |
| Imports **entre** features                                                        | 0                                                             | 0                                     |
| Imports relativos salientes de features (hacia componentes/hooks/services/domain) | 4                                                             | 3                                     |
| Importadores del adapter de datos                                                 | 1                                                             | 1                                     |
| Directorios compartidos (`shared`/`common`)                                       | 0                                                             | 0                                     |
| Duplicación deliberada entre apps (pares por concepto)                            | 6 (adapter, store, kpi-card, dashboard, projects, app shell)  | 6                                     |

**Lectura:** ambas apps tienen acoplamiento entre features nulo y una única frontera de datos (el adapter). En React el dominio se importa desde 5 capas distintas; en Angular desde 2 (capa `domain` + features). No existen directorios compartidos dentro de cada app: lo común ya vive en `@operations-hub/domain`. La duplicación entre apps es deliberada y está documentada en `frontend-architecture.md` §5 (orquestación de estado e integración, nunca lógica de dominio).

## 9. Limitaciones

- **Lighthouse: no medido** en este baseline. La metodología lo define (metrics.md §3.4), pero requiere añadir la herramienta y servir los builds; se difiere al primer ciclo de comparación, cuando las apps tengan el contrato funcional completo y más vistas. Motivo registrado (regla 6 de metrics.md).
- **Cobertura: no medible de forma fiable** — no está configurada en ninguna app (requeriría `@vitest/coverage-v8`). Se documenta el motivo en lugar de omitirlo en silencio (regla 6). Decisión explícita: no añadir una dependencia únicamente para esta métrica.
- **Tiempos**: son de pared, en esta máquina y sesión; sensibles a la carga de fondo. Mediana+rango de 3 mitigado pero no eliminado. **No comparables entre máquinas** ni con el CI (Node 22).
- **Build en frío**: React elimina solo `dist` (Vite build no usa caché persistente); Angular elimina también `.angular/cache`. Los tiempos no incluyen cachés calientes.
- **gzip/brotli**: calculados con `zlib` de Node (nivel por defecto), no con la configuración real de servidor/CDN; son comparables entre sí, no absolutos.
- **Conteo transitivo** (`pnpm list --depth Infinity`): incluye las devDependencies del árbol; Angular arrastra su toolchain (CLI/compiler) como dev deps, lo que explica en gran parte la diferencia (1074 vs 249).
- **Métricas de arquitectura**: heurísticas por patrón de import y convención de directorios, no análisis formal de grafos. Simples y repetibles, que es lo que exige el laboratorio.
- **Bundle**: 1 chunk por app, sin code splitting; los tamaños cambiarán al ampliar el contrato funcional (Fase 4+). El tamaño no representa rendimiento en runtime (metrics.md §3.1).
- **Tamaño del dataset de prueba** (8/3/6/30): los tiempos y tamaños no escalan linealmente con el contrato completo.
- **Conteos de roles**: por convención de directorios (p. ej. `*.component.ts` en Angular); los archivos de test se excluyen de los conteos de producción.

## 10. Interpretación

Este baseline **no es una competición** y ninguna métrica aislada es concluyente. Lo que sí permite observar:

- **Peso estructural del bundle**: para el mismo slice funcional, el JS de Angular (136.6 kB raw) es menor que el de React (208.6 kB raw) en esta build; ambos en 1 chunk y CSS trivial. La diferencia es estructural (runtime de cada framework, compilación AOT de Angular vs JSX en runtime de React). No permite concluir nada sobre rendimiento en runtime ni sobre el coste con el contrato completo.
- **Toolchain**: el build en frío de Angular es ~5× el de React (2720 vs 530 ms) y sus tests ~1.8× (2467 vs 1339 ms) en esta máquina. Angular ejecuta más pasos (compilación AOT, presupuestos, hashing). Ambos están muy por debajo de un presupuesto típico de CI; la diferencia es de fricción de iteración, no un bloqueo.
- **Superficie de dependencias**: Angular (1074 transitivas) vs React (249) — incluye el toolchain Angular como dev deps; el dominio compartido tiene **0 dependencias runtime**. El coste de suministro del dominio es nulo; el de cada app refleja el ecosistema, no la calidad.
- **Arquitectura**: acoplamiento entre features nulo en ambas, frontera de datos única (adapter), dominio como única fuente de reglas (los features importan `@operations-hub/domain` directamente en ambas — los builders de reports y las máquinas de estado se usan tal cual, sin reimplementación). La distribución de imports por capa difiere (React: 5 capas; Angular: 2), reflejando los modelos de estado distintos (ADR-002).
- **Tests**: el dominio es la pieza más probada (103 tests, ratio 1.11) y las apps tienen tests de integración mínimos (8 y 6, ratio 0.42 y 0.28). Esto es **coherente con el diseño**: la lógica de negocio ya está cubierta en domain; las apps prueban integración con el dominio, renderizado e interacción de transición. Un ratio bajo en las apps no implica falta de calidad, sino distribución intencionada de la responsabilidad de testing.

**Conclusión del baseline:** el estado de Fase 2 queda fijado como referencia medible. Los valores de este documento (y el JSON de evidencia) son la línea base contra la que se compararán los ciclos posteriores (contrato completo, nuevas fases, microfrontends). La decisión final sobre qué arquitectura «gana» no existe: el scorecard combinará estas mediciones con evaluación por rúbrica, siempre con evidencia trazable.

## Anexo A — Developer Experience: pasos observables para añadir una feature equivalente

Para añadir una vista «Teams» equivalente (consume `Team`, `User` y `buildTeamReport` del dominio) en el estado actual:

**React** (sin tocar el dominio):

1. Crear `apps/react-app/src/features/teams/teams-page.tsx` — componente que lee el `Dataset` del store (hook `use-domain-store`) y calcula las filas con `buildTeamReport` del dominio.
2. Registrar la sección en `apps/react-app/src/app/App.tsx`: ampliar el union `Section`, añadir el botón de navegación y el render condicional.
3. Añadir `apps/react-app/src/features/teams/teams-page.test.tsx` (render + interacción).
4. Validar: `pnpm --dir apps/react-app typecheck && pnpm --dir apps/react-app test && pnpm --dir apps/react-app lint`.

**Angular** (sin tocar el dominio):

1. Crear `apps/angular-app/src/app/features/teams/teams.component.ts` + `teams.component.html` — standalone, inyecta `DomainStore`, estado derivado con `computed` y `buildTeamReport`.
2. Registrar en `apps/angular-app/src/app/app.ts`: añadir el componente al array `imports`, ampliar el union `Section`, añadir botón de navegación y render condicional.
3. Añadir `apps/angular-app/src/app/features/teams/teams.component.spec.ts`.
4. Validar: `pnpm --dir apps/angular-app typecheck && pnpm --dir apps/angular-app test && pnpm --dir apps/angular-app lint`.

**Observaciones:** en ambos casos el trabajo se limita a la app (0 archivos de `packages/domain` modificados — los tipos, reglas y builders ya existen). La diferencia observable entre frameworks es el mecanismo de integración: registro de componentes standalone + signals (`computed`) en Angular frente a hook + render condicional en React. Ningún paso requiere comandos no documentados en el README/CONTRIBUTING.
