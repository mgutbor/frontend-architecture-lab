# Fase 19 — Escalabilidad arquitectónica: impacto del tamaño del grafo de features

## 1. Resumen ejecutivo

Se construyeron 4 escalas controladas del grafo de features (S1=5, S2=10, S3=20, S4=30 features conectadas) en 2 topologías (CLEAN con 0 imports feature→feature; COUPLED con cadena controlada de 1/2/4/6 edges) sobre el mismo dominio, y se ejecutaron 6 escenarios de mantenimiento (M1–M6) y 2 de debugging (D1–D2) en cada celda, por framework: **128 celdas** medidas en copia aislada con historial git propio.

**Hallazgo central:** el coste por cambio NO crece con el tamaño del grafo cuando el cambio es local o periférico; **crece de forma estrictamente LINEAL con el número de consumidores reales** cuando el cambio toca una regla/contrato compartido o un helper acoplado. **No aparece crecimiento superlineal en ningún escenario hasta 30 features.** La distancia causa→síntoma en debugging de un bug central crece linealmente con la profundidad del grafo (2→7) y permanece plana (1) en arquitectura limpia. **React y Angular presentan curvas idénticas en las 128 celdas.**

## 2. Pregunta experimental

> ¿Cómo escala el coste arquitectónico (mantenimiento, debugging, blast radius) cuando aumenta el número de features y dependencias?

La Fase 18 demostró que el acoplamiento aumenta blast radius, distancia causa→síntoma y espacio de búsqueda, pero en un proyecto con pocas features. Fase 19 responde si esos efectos crecen (y cómo) al escalar el grafo.

## 3. Diseño experimental

- **Dominio y contrato constantes**: mismo fixture, mismas reglas, mismas features reales (dashboard, projects, tasks) en todas las escalas.
- **Features generadas** (catalogs `catalog-01…catalog-27`): estructuralmente equivalentes, con contrato de dominio (`CatalogItem` + regla `completionRatio`/`count<N>Overdue`), UI (búsqueda, filtro, selección, nota local de escritura), tests y wiring de navegación — generadas por templates deterministas en el script.
- **Escalas**: S1=5 (3 reales + 2 generadas), S2=10 (+7), S3=20 (+17), S4=30 (+27).
- **Topologías**:
  - CLEAN: 0 imports feature→feature; dominio como fuente única de reglas.
  - COUPLED: cadena feature→feature con ratio constante (edges = floor(total/5)): 5→1, 10→2, 20→4, 30→6. Raíz de cadena = feature central (catalog-01); hoja = periférica (catalog-02/03/05/07).
- **Escenarios**:
  - M1 — modificación periférica (subtítulo en la hoja).
  - M2 — modificación central semántica (salida de `linkedTitle` de la raíz).
  - M3 — cambio de contrato (`completionRatio` gana un parámetro obligatorio).
  - M4 — eliminación de la feature raíz.
  - M5 — cambio semántico de regla de dominio (`round`→`floor` en `completionRatio`).
  - M6 — refactor interno sin cambio funcional (rename local en catalog-02).
  - D1 — bug de presentación type-valid en la hoja (swap de labels Active/Planned).
  - D2 — bug semántico type-valid en el helper de la raíz (`Catalog 01`→`Catalog 99`).
- **Métricas**: filesChanged, LOC, features afectadas, unrelated features, blast radius, filesInspected, distancia causa→síntoma, tests fallidos, errores de typecheck, invariantes (0 imports f→f en CLEAN, 0 duplicación, 0 deps nuevas).
- **Matriz**: 4 escalas × 2 topologías × 8 escenarios × 2 frameworks = 128 celdas, n=1 por celda (métricas deterministas derivadas de git + typecheck/tests dirigidos).

## 4. Topologías (grafo medido)

| Escala | Topología | Nodos | Edges | Max depth | Avg depth | Densidad | Aislados | Consumidores transitivos de la raíz |
| ------ | --------- | ----: | ----: | --------: | --------: | -------: | -------: | ----------------------------------: |
| S1     | CLEAN     |     5 |     0 |         1 |      1.00 |        0 |        5 |                                   0 |
| S1     | COUPLED   |     5 |     1 |         2 |      1.20 |     0.20 |        3 |                                   1 |
| S2     | CLEAN     |    10 |     0 |         1 |      1.00 |        0 |       10 |                                   0 |
| S2     | COUPLED   |    10 |     2 |         3 |      1.30 |     0.20 |        7 |                                   2 |
| S3     | CLEAN     |    20 |     0 |         1 |      1.00 |        0 |       20 |                                   0 |
| S3     | COUPLED   |    20 |     4 |         5 |      1.50 |     0.20 |       15 |                                   4 |
| S4     | COUPLED   |    30 |     6 |         7 |      1.70 |     0.20 |       23 |                                   6 |

La densidad del grafo acoplado se mantuvo constante (0.2) por diseño: la única variable de escala es el tamaño (nodos/edges/profundidad).

## 5. Tabla principal (React = Angular en todas las celdas)

### Escenarios de dominio/contrato (blast radius = consumidores reales)

| Escenario            | Métrica           | S1  | S2  | S3  | S4  | Crecimiento                      |
| -------------------- | ----------------- | --- | --- | --- | --- | -------------------------------- |
| M3 (contrato)        | errores typecheck | 2   | 7   | 17  | 27  | lineal = consumidores sintéticos |
| M5 (regla semántica) | tests fallidos    | 2   | 7   | 17  | 27  | lineal = consumidores sintéticos |
| M3/M5                | filesChanged      | 1   | 1   | 1   | 1   | constante                        |

### Escenarios de feature central acoplada (blast = cadena)

| Escenario              | Topología     | Métrica                 | S1  | S2  | S3  | S4  | Crecimiento                     |
| ---------------------- | ------------- | ----------------------- | --- | --- | --- | --- | ------------------------------- |
| M2 (central semántico) | CLEAN         | tests fallidos          | 1   | 1   | 1   | 1   | constante                       |
| M2                     | COUPLED       | tests fallidos          | 2   | 3   | 5   | 7   | lineal = profundidad de cadena  |
| D2 (bug central)       | CLEAN         | distancia causa→síntoma | 1   | 1   | 1   | 1   | constante                       |
| D2                     | COUPLED       | distancia causa→síntoma | 2   | 3   | 5   | 7   | lineal = profundidad            |
| D2                     | COUPLED       | tests fallidos          | 2   | 3   | 5   | 7   | lineal = consumidores           |
| D2                     | CLEAN/COUPLED | filesInspected          | 1/2 | 1/2 | 1/2 | 1/2 | constante (dependencia directa) |

### Controles planos (periférico/local)

| Escenario                | Métrica                             | S1      | S2      | S3      | S4      |
| ------------------------ | ----------------------------------- | ------- | ------- | ------- | ------- |
| M1 (periférico)          | filesChanged / tests fallidos       | 1 / 0   | 1 / 0   | 1 / 0   | 1 / 0   |
| M6 (refactor)            | filesChanged / tests fallidos       | 1–2 / 0 | 1–2 / 0 | 1–2 / 0 | 1–2 / 0 |
| D1 (bug periférico)      | distancia / tests fallidos          | 1 / 1   | 1 / 1   | 1 / 1   | 1 / 1   |
| M4 CLEAN (eliminación)   | errores typecheck / refs residuales | 0 / 0   | 0 / 0   | 0 / 0   | 0 / 0   |
| M4 COUPLED (eliminación) | errores typecheck (import roto)     | 1       | 1       | 1       | 1       |

## 6. Evolución con el tamaño

- **Superficie de cambio por escenario: constante** (1 archivo para M1/M2/M3/M5/M6/D1/D2; 12 para M4 por la regeneración del shell). El coste directo de editar no crece con 5→30 features.
- **Blast radius (tests/typecheck afectados): lineal** en el número de consumidores reales: M3/M5 exactamente = consumidores sintéticos (2→27); M2/D2 exactamente = profundidad de la cadena (2→7).
- **Distancia causa→síntoma: lineal en la profundidad del grafo** (D2 COUPLED 2→7), plana en CLEAN.
- **No hay superlinealidad** en ningún escenario hasta 30 features; no hay punto de inflexión: el crecimiento es lineal desde S1.
- **Coste por feature: estable** — dividiendo blast radius entre features, el ratio no aumenta (linealidad perfecta).

## 7. Blast radius

- Crece **con los consumidores reales**, no con el número total de features: M3/M5 (regla compartida) crecen en ambas topologías (2→27); M2/D2 (helper acoplado) solo crecen en COUPLED (2→7) y exactamente con la cadena.
- `unrelatedFeaturesAffected = 0` en las 128 celdas: el blast radius nunca contamina features no relacionadas.
- La eliminación (M4) tiene blast radius constante: en CLEAN elimina limpiamente (0 refs); en COUPLED deja exactamente 1 import roto (catalog-02 → catalog-01), independiente de la escala.

## 8. Debugging

- **D1 (bug periférico)**: distancia 1, 1 test fallido, 1 archivo inspeccionado — idéntico en las 4 escalas y en ambas topologías. El coste de localizar un bug local NO escala.
- **D2 (bug central)**: la distancia causa→síntoma crece con la profundidad del grafo (2→3→5→7 en COUPLED) y los tests fallidos crecen con los consumidores de la cadena (2→3→5→7). En CLEAN, el mismo bug permanece plano (1/1).
- El espacio de búsqueda por dependencia directa (grep del helper) es constante (2 archivos); lo que crece es la **profundidad del recorrido** hasta el síntoma (hasta 7 capas en S4).

## 9. React vs Angular

**Curvas idénticas en las 128 celdas.** Todas las métricas (filesChanged, blast radius, distancia, tests fallidos, errores de typecheck, invariantes) coinciden exactamente entre React y Angular para cada escenario/escala/topología. Las únicas diferencias absolutas son estructurales y constantes: M6 toca 1 archivo en React (page) vs 2 en Angular (component + template); M1/M4 idénticos. La pendiente de escalabilidad es la misma.

## 10. Invariantes

- **CLEAN**: 0 imports feature→feature (verificado por escaneo del grafo en cada estado), 0 reglas duplicadas, 0 dependencias nuevas, domain sin imports de apps, typecheck/tests/build verdes en los 8 estados validados.
- **COUPLED**: violación deliberada y documentada (imports de cadena); todo lo demás intacto. Tras cada fix, typecheck/tests verdes (128/128 celdas `suiteOkAfter=true`, salvo M4-COUPLED cuyo estado final es intencionalmente el import roto medido).
- Árbol productivo: sin contaminación (el experimento vive en `/tmp/lab-phase19`).

## 11. Diferencias significativas vs ruido

- **Reproducible y consistente**: la linealidad de M3/M5 (2→7→17→27) y de M2/D2-COUPLED (2→3→5→7) es exacta (no aproximada) y coincide entre frameworks.
- **Estructural (no ruido)**: M6 1 vs 2 archivos (React vs Angular) — constante en todas las escalas; M4 = 12 archivos por la regeneración del shell.
- **Sin diferencias atribuibles a ruido**: las métricas son deterministas (git + tests dirigidos).

## 12. Interpretación obligatoria

1. **¿Qué métrica crece más con el tamaño?** Los tests/errores afectados por cambios de reglas/contratos compartidos (lineal en consumidores) y la distancia de debugging de un bug central (lineal en profundidad).
2. **¿El coste por feature permanece estable?** Sí — la superficie directa de cambio es constante y el blast radius es exactamente proporcional a los consumidores.
3. **¿El blast radius crece linealmente?** Sí, en todos los escenarios que crecen.
4. **¿El debugging central escala peor?** Sí: distancia 2→7 y 2→7 tests fallidos; el debugging periférico no escala.
5. **¿La profundidad explica mejor que el número de features?** Sí para debugging (D2 distancia = profundidad de la cadena, no el total de features: S4 con 30 features da distancia 7 en COUPLED y 1 en CLEAN). No para blast radius de reglas compartidas (que depende de consumidores reales, no de profundidad).
6. **¿La densidad es mejor predictor?** NO CONCLUYENTE: la densidad se mantuvo constante (0.2) por diseño; el diseño no permite separar densidad de tamaño.
7. **¿Qué ocurre al duplicar features?** El blast radius de reglas compartidas se duplica (lineal); la distancia de la cadena crece con los edges.
8. **¿Qué ocurre al duplicar dependencias?** En este diseño ambas crecen juntas (edges = f(features)); no se aisló el efecto de duplicar edges con features constantes.
9. **¿La arquitectura limpia escala mejor?** Sí para debugging (distancia plana) y para cambios de features centrales acopladas (blasto 1); igual que COUPLED para reglas de dominio compartidas (el dominio es común).
10. **¿El acoplamiento produce crecimiento superlineal?** NO — refutado: el crecimiento adicional del acoplamiento es lineal (2→7), no superlineal, hasta 30 features.
11. **¿React y Angular presentan la misma curva?** Sí, idéntica.
12. **¿Existe un punto de inflexión?** No detectado hasta 30 features; el crecimiento es lineal desde S1.
13. **¿A partir de qué escala aparecen diferencias relevantes?** Desde S1 ya se observa la diferencia CLEAN vs COUPLED (distancia 1 vs 2); la brecha crece linealmente (hasta 1 vs 7 en S4).
14. **¿Qué conclusión de Fase 18 se mantiene?** El acoplamiento aumenta distancia y blast radius, y la duplicación oculta divergencias — se mantiene y ahora se sabe que crece linealmente.
15. **¿Qué conclusión necesita matización?** F18 no permitía distinguir crecimiento lineal vs superlineal; F19 muestra que es lineal en este rango.
16. **¿Qué métrica usar como indicador temprano de deterioro?** La profundidad máxima del grafo y el número de consumidores transitivos de la raíz: predicen directamente la distancia de debugging y el blast radius de cambios centrales.
17. **¿Qué experimento seguir?** Ver §19.

## 13. Comparación con fases anteriores

- **F13 (mantenibilidad)**: confirma y amplía — el coste estructural por cambio localizado es constante con el tamaño; la variación la explica la arquitectura, no el framework.
- **F17 (debugging multi-capa)**: amplía — la distancia causa→síntoma se comporta como en F17 (1/2/3 capas) y ahora se demuestra que crece linealmente con la profundidad del grafo (2→7).
- **F18 (acoplamiento inducido)**: amplía — el efecto del acoplamiento (blast +1, distancia +1) se confirma y se cuantifica su crecimiento lineal con la escala.
- **F11/F12 (evolución de dominio)**: matiza — el coste de cambios de contrato/regla crece linealmente con los consumidores, lo que refuerza el valor de la fuente única de verdad centralizada (M3/M5 muestran el mismo blast en ambas topologías: el dominio compartido ya es el punto de concentración).
- Ninguna contradicción: todas las fases anteriores se refuerzan o se amplían.

## 14. Limitaciones

- 30 features es el máximo reproducido; no se puede descartar superlinealidad más allá (el diseño no extrapola).
- La densidad del grafo acoplado se mantuvo constante (0.2): no se midió el efecto de densidades distintas (H140 no concluyente).
- Features generadas por templates: estructuralmente equivalentes por diseño; una base con features heterogéneas podría mostrar curvas distintas.
- Proxies estructurales (archivos, distancia, tests afectados), sin tiempo humano.
- n=1 por celda: las métricas son deterministas (git + typecheck/tests), no hay medición temporal; la reproducibilidad se garantiza por los snapshots y el script.
- M4 mide 12 archivos por la regeneración del shell (coste constante, no de escala).
- El espacio de búsqueda de D2 se midió por dependencia directa (2 archivos) más distancia (2→7); no se contabilizó el coste de los hops intermedios como "archivos inspeccionados".

## 15. Archivos creados/modificados

- `scripts/measure-architecture-scalability-phase19.mjs` (nuevo — generador de escalas + 128 celdas + métricas, idempotente, exit ≠ 0 ante fallos)
- `docs/experiments/architecture-scalability-phase19.md` (nuevo — este informe)
- `docs/experiments/results/architecture-scalability-phase19.json` (nuevo — 128 celdas + grafo + validaciones + agregados)
- `docs/experiments/README.md` (modificado — fila Fase 19)
- `package.json` (modificado — `architecture:scalability`)

## 16. Validaciones

- `pnpm format` / `pnpm format:check` — ✅
- `pnpm lint` — ✅
- `pnpm typecheck` — ✅
- `pnpm test` — ✅
- `pnpm build` — ✅
- `pnpm architecture:scalability` — ✅ exit 0, 128/128 celdas, JSON válido
- Procesos residuales: 0
- Árbol productivo: solo los 5 artefactos previstos

## 17. Estado de git

```
 M docs/experiments/README.md
 M package.json
?? docs/experiments/architecture-scalability-phase19.md
?? docs/experiments/results/architecture-scalability-phase19.json
?? scripts/measure-architecture-scalability-phase19.mjs
```

Sin commit.

## 18. Notificación ntfy

Enviada tras las validaciones según `~/.knowledge.md` (endpoint `https://ntfy.mmxnas.synology.me/mmx-frontend-architecture-lab`, payload `[Freebuff] SUCCESS — frontend-architecture-lab — Fase 19: escalabilidad del grafo de features medida (128 celdas, crecimiento lineal, validaciones verdes)`).

## 19. Siguiente experimento recomendado

1. **Densidad vs tamaño** (mayor valor): mantener features constantes (30) y variar la densidad/edges (0.1 → 0.5) para aislar si la densidad o el tamaño dominan el coste (resuelve H140).
2. **Superlinealidad a escala mayor**: 40–60 features para comprobar si la linealidad se mantiene o aparece un punto de inflexión.
3. **Acoplamiento de dominio compartido**: inducir edges entre entidades de `packages/domain` (no entre features) para medir el coste cuando la violación vive en la capa central.

## 20. Commit propuesto

```
test(experiments): measure architecture scalability across feature graph sizes

adds phase 19: 128 cells (4 scales x 2 topologies x 8 scenarios x 2
frameworks) over generated feature graphs of 5/10/20/30 wired features
in clean (0 feature-to-feature imports) and coupled (1/2/4/6-edge
chain) topologies, measured on an isolated lab copy with own git
history.

findings: the direct change surface stays constant with size; blast
radius grows exactly linearly with real consumers (shared-rule changes
2->27 failing tests/typecheck errors; coupled-hub changes 2->7) and
debugging distance grows linearly with graph depth (2->7) only under
coupling; no superlinear growth up to 30 features; react and angular
produce identical curves in every cell; architecture, not framework,
explains the variation.

adds scripts/measure-architecture-scalability-phase19.mjs, results
json and report; updates docs/experiments/README.md and package.json
(architecture:scalability); no production functionality changed.
```
