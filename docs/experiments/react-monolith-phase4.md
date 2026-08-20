# Comparación de métricas — React Monolith (Fase 4) vs Baseline (Fase 2)

- **Estado:** Completado (Fase 4.1 — medición y análisis)
- **Evidencia cruda:** [results/react-monolith-phase4.json](./results/react-monolith-phase4.json)
- **Baseline inmutable:** [baseline-phase2.json](./results/baseline-phase2.json) y [baseline-phase2.md](./baseline-phase2.md)
- **Documentos relacionados:** [Metodología de métricas](./metrics.md)

## 1. Objetivo

Responder objetivamente a la pregunta: **«¿Qué coste arquitectónico y técnico ha tenido convertir el vertical slice React de la Fase 2 en un React Monolith que implementa el contrato funcional completo (Fase 4)?»**

Esta fase es exclusivamente de medición y análisis: **no** se ha modificado código funcional de `apps/react-app/`, `apps/angular-app/` ni `packages/domain/`, ni el fixture, ni los contratos, ni `turbo.json`, ni el baseline.

## 2. Metodología

Se reutiliza íntegramente la metodología aprobada ([metrics.md](./metrics.md)) y el script `scripts/measure-baseline.mjs` **sin ninguna modificación**: el script ya aceptaba un nombre de ejecución, por lo que la medición se lanzó como `node scripts/measure-baseline.mjs react-monolith-phase4` y escribió la evidencia en `results/react-monolith-phase4.json` sin tocar el baseline.

Mismo procedimiento que en Fase 3:

- Build en frío (eliminando `dist` y `.angular/cache`), 3 ejecuciones, mediana + rango.
- Tests: 3 ejecuciones, mediana + rango, número de tests.
- Lint/typecheck: una ejecución (pass/fail + ms).
- Conteos de código, dependencias y arquitectura: estáticos y deterministas (mismas heurísticas que el baseline).
- gzip/brotli: `zlib` de Node (nivel por defecto), mismo procedimiento.

Las definiciones de las métricas **no han cambiado** por el crecimiento de React. Cuando una métrica no es directamente comparable se indica explícitamente (§10 y §11).

## 3. Entorno

| Variable               | Valor                                                  |
| ---------------------- | ------------------------------------------------------ |
| SO                     | macOS (darwin-arm64)                                   |
| CPU                    | Apple M1 (8 cores)                                     |
| RAM                    | 16 GiB                                                 |
| Node.js                | v25.3.0                                                |
| pnpm                   | 10.34.5                                                |
| Dataset                | `operations-hub-v1.json` (v1)                          |
| Modo de build          | Producción, en frío                                    |
| Navegador (Lighthouse) | Chrome 151.0.7922.170 (ver §8)                         |
| Cachés                 | Dist y `.angular/cache` eliminados antes de cada build |

El entorno es idéntico al del baseline (misma máquina, mismas versiones), por lo que los tiempos son comparables entre las dos ejecuciones de este laboratorio.

## 4. Baseline (Fase 3) — Resumen React

Valores de referencia extraídos de `baseline-phase2.json` (inmutable):

| Métrica                                              | Valor                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| LOC producción / tests                               | 325 / 137 (ratio 0.42)                                                                             |
| Archivos fuente / test                               | 10 / 4                                                                                             |
| Componentes · hooks · services · adapters · features | 2 · 1 · 1 · 1 · 2                                                                                  |
| Dependencias runtime / dev / transitivas             | 3 / 10 / 249                                                                                       |
| Build (mediana, rango)                               | 530 ms (524–543)                                                                                   |
| JS raw / gzip / brotli                               | 208 562 B / 63 499 B / 54 534 B (1 chunk)                                                          |
| CSS raw / gzip / brotli                              | 119 B / 125 B / 85 B                                                                               |
| Tests (nº, mediana, rango)                           | 8 · 1 339 ms (1 309–1 515)                                                                         |
| Arquitectura                                         | imports de domain: 6 · entre features: 0 · salientes: 4 · adapters: 1 · shared: 0 · duplicación: 6 |

## 5. React Monolith (Fase 4) — Resultados actuales

| Métrica                                              | Valor                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| LOC producción / tests                               | 2 198 / 1 112 (ratio 0.51)                                                                           |
| Archivos fuente / test                               | 25 / 10                                                                                              |
| Componentes · hooks · services · adapters · features | 7 · 1 · 3 · 1 · 9                                                                                    |
| Dependencias runtime / dev / transitivas             | 3 / 10 / 249                                                                                         |
| Build (mediana, rango)                               | 484 ms (459–551)                                                                                     |
| JS raw / gzip / brotli                               | 233 547 B / 68 572 B / 58 972 B (1 chunk)                                                            |
| CSS raw / gzip / brotli                              | 3 666 B / 1 162 B / 949 B                                                                            |
| Tests (nº, mediana, rango)                           | 84 · 3 079 ms (3 077–3 201)                                                                          |
| Arquitectura                                         | imports de domain: 13 · entre features: 0 · salientes: 23 · adapters: 1 · shared: 0 · duplicación: 6 |
| Lint / typecheck                                     | OK (1 024 ms) / OK (1 193 ms)                                                                        |

## 6. Comparación

| Métrica                         |  Baseline | React Monolith | Variación absoluta | Variación % |
| ------------------------------- | --------: | -------------: | -----------------: | ----------: |
| LOC producción                  |       325 |          2 198 |             +1 873 |       +576% |
| LOC tests                       |       137 |          1 112 |               +975 |       +712% |
| Ratio test/código               |      0.42 |           0.51 |              +0.09 |         N/A |
| Archivos fuente                 |        10 |             25 |                +15 |       +150% |
| Archivos de test                |         4 |             10 |                 +6 |       +150% |
| Componentes                     |         2 |              7 |                 +5 |       +250% |
| Hooks                           |         1 |              1 |                  0 |          0% |
| Services                        |         1 |              3 |                 +2 |       +200% |
| Adapters                        |         1 |              1 |                  0 |          0% |
| Features                        |         2 |              9 |                 +7 |       +350% |
| Deps runtime                    |         3 |              3 |                  0 |          0% |
| Deps dev                        |        10 |             10 |                  0 |          0% |
| Deps transitivas                |       249 |            249 |                  0 |          0% |
| Build (mediana)                 |    530 ms |         484 ms |             −46 ms |       −8.7% |
| JS raw                          | 208 562 B |      233 547 B |          +24 985 B |      +12.0% |
| JS gzip                         |  63 499 B |       68 572 B |           +5 073 B |       +8.0% |
| JS brotli                       |  54 534 B |       58 972 B |           +4 438 B |       +8.1% |
| Chunks JS                       |         1 |              1 |                  0 |          0% |
| CSS raw                         |     119 B |        3 666 B |           +3 547 B |         N/A |
| Tests (nº)                      |         8 |             84 |                +76 |       +950% |
| Tiempo de tests (mediana)       |  1 339 ms |       3 079 ms |          +1 740 ms |       +130% |
| Tiempo por test (mediana/nº)    |    167 ms |          37 ms |            −130 ms |        −78% |
| Importadores de domain          |         6 |             13 |                 +7 |       +117% |
| Imports entre features          |         0 |              0 |                  0 |          0% |
| Imports salientes de features   |         4 |             23 |                +19 |       +475% |
| Uso de adapters                 |         1 |              1 |                  0 |          0% |
| Directorios compartidos         |         0 |              0 |                  0 |          0% |
| Pares de duplicación deliberada |         6 |              6 |                  0 |          0% |

## 7. Arquitectura

Comparación estructural sin valoración subjetiva:

- **Tamaño:** el código de producción creció ~6.8× (325 → 2 198 LOC) y los tests ~8× (137 → 1 112 LOC), repartidos en 9 features (2 → 9) y 7 componentes compartidos (2 → 7). El código sigue siendo pequeño para el alcance (contrato completo con 6 áreas).
- **Complejidad:** se mantiene en 3 capas funcionales (features → services/hooks → adapter → domain) sin capas nuevas. El store pasó de 1 a 3 servicios (`domain-store`, `ids`, `filters`), todos con responsabilidad única. No hay directorios `shared`/`common` ni abstracciones genéricas nuevas.
- **Dependencias:** sin cambios (3/10/249). Todo el crecimiento se absorbió en código propio + el paquete de dominio.
- **Imports:** los imports directos hacia `@operations-hub/domain` pasaron de 6 a 13 (features 2 → 8); los imports **entre** features siguen en 0 (las features no se acoplan entre sí); los imports salientes de features hacia componentes/services/hooks pasaron de 4 a 23 (consolidación de UI compartida: `field`, `empty-state`, `status-badge`, `priority-badge`, `feedback`).
- **Duplicación:** los 6 pares de duplicación deliberada con Angular se mantienen (adapter, store, kpi-card, dashboard, projects, app shell) — el dominio compartido sigue siendo la única fuente de reglas; la duplicación es de integración.
- **Separación de responsabilidades:** sin cambios de dirección de dependencias: UI → features → estado/aplicación → adapter → domain.

## 8. Lighthouse

**No medible en este entorno — motivo documentado (regla 6 de `metrics.md`).**

Se intentó ejecutar Lighthouse (vía `npx`, sin dependencia permanente) sobre el build de producción servido por un servidor estático temporal (`npx http-server`, puerto local; verificado con HTTP 200 y carga correcta de todos los assets). Resultado:

- **Chrome headless 151.0.7922.170 se cuelga al cargar cualquier URL `http://` en esta máquina**: probado con `--headless` y `--headless=new`, con y sin `--user-data-dir`/`--no-first-run`, contra la SPA de React, contra una página HTML estática plana (sin JavaScript) y con `--dump-dom` y `--screenshot`. Las URLs `data:` cargan correctamente en el mismo binario; todas las URLs HTTP se quedan colgadas indefinidamente (≥40 s) y Lighthouse aborta con «Chrome prevented page load with an interstitial».
- Esto indica un problema del **entorno** (navegador headless + red local de esta máquina), **independiente de la aplicación**: la app se sirve y ejecuta correctamente (HTTP 200, assets cargados por el propio Chrome, 84 tests en jsdom en verde).
- **No se modificó ningún código de la aplicación** para intentar sortearlo (regla de la fase).

Consecuencia: Performance, Accessibility, Best Practices y SEO de Lighthouse **no se registran** en esta medición. No se inventan resultados. Lighthouse queda pendiente de un entorno donde Chrome headless funcione (p. ej. CI con Chromium) o de una revisión del navegador local, y se incorporará al primer ciclo de comparación completo (MVP-11/12).

## 9. Developer Experience

Escenario del baseline: «añadir una feature equivalente (Teams view)». En Fase 2 era hipotético; en Fase 4 **se implementó de verdad**. El flujo real observado en el repositorio:

**Archivos creados (Teams):**

- `src/features/teams/teams-page.tsx` — página (lista con contadores derivados vía `buildTeamReport`, detalle, asignación de miembros con `updateUserTeam`).
- `src/features/teams/teams-page.test.tsx` — 3 tests (lista con contadores, detalle, BR-3).

**Archivos modificados:**

- `src/app/App.tsx` — entrada de navegación + render condicional (1 línea de tipo + 1 botón + 1 rama).
- `src/app/App.test.tsx` — 1 caso añadido a los tests de navegación.

**Capas implicadas:** feature (página) → componentes compartidos (`feedback`, `empty-state`) → servicios (store vía hook `use-domain-store`) → adapter → domain. **Cero cambios en `packages/domain`**: la feature no necesitó API nueva (los builders de reports y la validación de `teamId` ya existían en el dominio).

**Flujo de datos:** estado de dominio (`DomainState`) → contadores derivados con `buildTeamReport` → mutaciones de sesión vía `updateUserTeam` (validada con `validateUserInput` dentro del store). Sin recalcular nada en la UI.

**Integración con navegación/estado:** una entrada nueva en la navegación por estado; el estado de Settings no se ve afectado; las mutaciones son de sesión (TR-2).

**Comparación con el baseline:** el baseline estimó «2 archivos + wiring en App + tests»; lo real fue consistente (2 archivos de feature + wiring + tests). El coste marginal por feature del Monolith completo es bajo gracias a los componentes compartidos y a que el contrato de dominio ya cubre las reglas necesarias.

## 10. Limitaciones

- **Lighthouse no medible** en este entorno (Chrome headless cuelga con URLs HTTP; §8). No hay puntuaciones Performance/Accessibility/Best Practices/SEO en esta medición.
- **Cobertura:** sigue siendo «no medible» (decisión de Fase 3; no se añadió `@vitest/coverage-v8`).
- **Tiempos:** de pared, misma máquina y sesión; sensibles a la carga de fondo. La variación del build (−8.7%) está **dentro del ruido** de medición (rango 459–551 ms frente a 524–543 del baseline): no se debe interpretar como una mejora real.
- **Build en frío:** misma definición que el baseline (dist + `.angular/cache` eliminados); no se comparan cachés calientes.
- **gzip/brotli:** calculados con `zlib` de Node (nivel por defecto), no con configuración de servidor/CDN.
- **Métricas de arquitectura:** heurísticas por patrón de import y convención de directorios (las mismas del baseline); no son análisis formal de grafos.
- **Conteo transitivo** (`pnpm list --depth Infinity`): incluye devDependencies del árbol (sin cambios respecto al baseline).
- **Un solo chunk:** la app sigue sin code splitting (decisión de alcance del MVP, no del baseline).
- **El script no se modificó**: la ejecución `react-monolith-phase4` usa exactamente el mismo mecanismo que el baseline; la única diferencia es el nombre del archivo de salida.

## 11. Interpretación

Análisis crítico, relacionando métricas con decisiones arquitectónicas:

- **Qué ha aumentado:** el código de producción (~6.8×), los tests (~8× en líneas, ~10.5× en número), el bundle JS (+12% raw / +8% gzip), el tiempo total de tests (+130%) y los imports salientes de features (4 → 23).
- **Qué ha disminuido:** el tiempo de build (−8.7%, dentro del ruido, no concluyente) y el **tiempo por test** (−78%: de 167 ms a 37 ms por test).
- **Qué permanece estable:** dependencias (0 nuevas), chunks (1), imports entre features (0), adapter único (1), directorios compartidos (0), pares de duplicación con Angular (6), hooks (1), lint/typecheck en verde.
- **Costes de la implementación completa:** ~2 200 LOC de producción y ~1 100 de tests; +25 kB JS raw; +1.7 s de suite de tests en total. Son los costes esperados de pasar de 2 a 6 áreas funcionales con CRUD, formularios con validación y accesibilidad.
- **Métricas especialmente relevantes:**
  - **Dependencias invariables (3/10/249) con el contrato completo**: es la consecuencia directa de la decisión de Fase 2 (ADR-002, sin librerías de estado/routing/UI) y del paquete de dominio (ADR-001): los formularios reutilizan los validadores del dominio y el estado se resuelve con `useSyncExternalStore` + React. El crecimiento se absorbió en código propio, no en librerías.
  - **Imports entre features = 0** con 9 features: la separación por área funcional se mantuvo; el acoplamiento nuevo es exclusivamente hacia capas compartidas (componentes/servicios), que es la dirección correcta de dependencia.
  - **Bundle +12% raw para ~7× de código**: el runtime de React domina el tamaño; el código añadido creció sublinealmente (minificación, sin dependencias nuevas). El coste de la complejidad funcional es bajo en transferencia (gzip +8%).
  - **Tiempo por test −78%**: la suite cambió de composición (tests unitarios rápidos de ids/filtros junto a tests de componente); el bucle de retroalimentación total (~3 s) sigue muy por debajo de cualquier presupuesto.
- **Métricas que pueden inducir a error:**
  - La **caída del build** parece una mejora pero es ruido de medición (rangos solapados); no debe citarse como beneficio.
  - El **+130% del tiempo de tests** sin matizar oculta que el coste por test cayó; el aumento total es el precio del volumen de cobertura pedido por el contrato.
  - El **+12% de bundle** es engañoso en porcentaje pequeño sobre una base dominada por el runtime; en bytes reales son +25 kB por todo el contrato.
  - El **ratio test/código** (0.42 → 0.51) no mide calidad: el dominio (que concentra las reglas) tiene ratio 1.11 y sus 103 tests no se duplican en la app.

## 12. Conclusiones

1. **El contrato funcional completo se implementó con cero dependencias nuevas** (3/10/249 invariables): la decisión de delegar reglas/validación en `@operations-hub/domain` y resolver estado y UI con React puro absorbió todo el crecimiento en código propio — el coste arquitectónico se pagó en LOC, no en superficie de dependencias.
2. **El bundle JS creció +12% raw / +8% gzip (+25 kB raw) para ~7× más código**, en un solo chunk (sin code splitting, fuera del alcance MVP): el coste de transferencia del contrato completo es sublineal porque el runtime del framework domina el tamaño.
3. **La suite de tests creció ×10.5 (8 → 84) mientras el tiempo total solo ×2.3** (1 339 → 3 079 ms; 37 ms por test, −78%): la cobertura del contrato se logró sin degradar el bucle de retroalimentación.
4. **La disciplina arquitectónica se mantuvo intacta**: 0 imports entre features (con 9 features), un único adapter como frontera de datos, 6 pares de duplicación deliberada con Angular, sin directorios shared y sin capas nuevas; el acoplamiento nuevo es exclusivamente hacia capas compartidas.
5. **Lighthouse no pudo medirse** por un bloqueo de Chrome headless en este entorno (documentado, sin resultados inventados); el resto de métricas es reproducible con `node scripts/measure-baseline.mjs react-monolith-phase4` y el baseline permanece inmutable para comparaciones futuras.

## Anexo — Validación de la medición

- `pnpm measure` equivalente: `node scripts/measure-baseline.mjs react-monolith-phase4` ✓ (genera `results/react-monolith-phase4.json`).
- `pnpm --dir apps/react-app build` ✓ · `pnpm --dir apps/react-app test` ✓ (84 tests en verde).
- `pnpm format` ✓ · `pnpm format:check` ✓ · `pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm check` ✓.
- Sin commit. Solo se modificaron documentos/resultados: `docs/experiments/react-monolith-phase4.md` y `docs/experiments/results/react-monolith-phase4.json` (y el índice de `docs/experiments/`).
