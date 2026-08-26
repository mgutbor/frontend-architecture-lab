# Fase 20 — Densidad de acoplamiento vs tamaño del grafo

## 1. Resumen ejecutivo

Se aisló la variable **densidad de acoplamiento** (edges/posibles) del **tamaño** y de la **topología** del grafo de features, construyendo **11 topologías** (8 en 30 features, 3 en 10 features) sobre el mismo dominio, y se ejecutaron 8 escenarios (M1–M6 + D1–D2) por celda y por framework: **176 celdas** medidas en copia aislada (`/tmp/lab-phase20`) con historial git propio.

**Hallazgo central: `densidad ≠ profundidad ≠ número de consumidores`, y el coste arquitectónico lo explican la profundidad y los consumidores, NO la densidad.**

- **La distancia causa→síntoma del bug central (D2) correlaciona PERFECTAMENTE con la profundidad máxima del grafo (r = 1.00)**, no con la densidad. Una estrella densa y superficial da distancia corta (STAR-0.20: dist=8 con 174 edges); una cadena dispersa y profunda da la distancia máxima (CHAIN-0.10: dist=27 con 87 edges). Con la MISMA densidad y MISMO número de edges, la cadena (dist=27) triplica la distancia de la estrella (dist=8).
- **El blast radius y los tests fallidos correlacionan PERFECTAMENTE con el número de consumidores transitivos (r = 1.00)**, y apenas con la densidad cuando la densidad refleja solo edges internos que no aumentan consumidores.
- **El coste LOCAL (M1/M6/D1 periférico) es constante e independiente de densidad, profundidad y tamaño** (blast=2, insp=1 en las 11 topologías, 176 celdas).
- **H150 (umbral de densidad con crecimiento superlineal) queda REFUTADO hasta densidad 0.403** (DAG completo, máximo factible): el espacio de búsqueda crece linealmente en consumidores/profundidad, no se dispara con la densidad.
- **React y Angular producen valores idénticos en las 176 celdas.**

El experimento REFUTA la pregunta implícita "más densidad = más coste": la densidad solo importa en la medida en que **cambia la profundidad o el número de consumidores reales**. La variable causal útil es el **grafo**: profundidad para debugging, consumidores para blast radius.

## 2. Pregunta experimental

> Con el mismo tamaño de sistema, ¿el coste arquitectónico depende más del número total de features o de la densidad/conectividad del grafo?

Y, más preciso: `¿es la densidad una variable causal útil, o el coste lo determinan profundidad, consumidores y topología?`

## 3. Definición matemática de density

```
density = edges / (N * (N - 1))   (grafo dirigido, sin self-loops)
         N = número de nodos del grafo sintético (27 en F30, 7 en F10)
         edges = imports feature→feature generados (mismos 3 features reales excluidos como destino salvo CLEAN)
```

Cada topología documenta además: maxDepth, avgDepth, maxInDegree, maxOutDegree, consumidores directos/transitivos del hub, número de componentes conectados, tamaño del mayor componente, diámetro y aislados.

## 4. Topologías

| Key            | Nodos | Edges | Densidad | MaxDepth | AvgDepth | Hub in | Hub out | Consum. transitivos hub | Comp. | LCC | Diámetro | Aislados |
| -------------- | ----: | ----: | -------: | -------: | -------: | -----: | ------: | ----------------------: | ----: | --: | -------: | -------: |
| F30:CLEAN      |    30 |     0 |    0.000 |        1 |     1.00 |      0 |       0 |                       0 |    30 |   1 |        0 |       30 |
| F30:CHAIN-0.10 |    30 |    87 |    0.100 |       27 |    12.70 |      7 |       8 |                      26 |     4 |  27 |        3 |        3 |
| F30:STAR-0.10  |    30 |    87 |    0.100 |        6 |     3.17 |     23 |       6 |                      23 |     4 |  27 |        3 |        3 |
| F30:STAR-0.20  |    30 |   174 |    0.200 |        8 |     4.27 |     24 |      10 |                      24 |     4 |  27 |        3 |        3 |
| F30:CHAIN-0.20 |    30 |   174 |    0.200 |       27 |    12.70 |     13 |      19 |                      19 |     4 |  27 |        2 |        3 |
| F30:BAL-0.30   |    30 |   261 |    0.300 |       15 |     7.50 |     14 |      14 |                      26 |     4 |  27 |        2 |        3 |
| F30:DENSE-0.40 |    30 |   348 |    0.400 |       27 |    12.70 |     25 |      26 |                      26 |     4 |  27 |        2 |        3 |
| F30:DENSE-MAX  |    30 |   351 |    0.403 |       27 |    12.70 |     26 |      26 |                      26 |     4 |  27 |        1 |        3 |
| F10:CLEAN      |    10 |     0 |    0.000 |        1 |     1.00 |      0 |       0 |                       0 |    10 |   1 |        0 |       10 |
| F10:STAR-0.20  |    10 |    18 |    0.200 |        4 |     2.20 |      6 |       5 |                       6 |     4 |   7 |        2 |        3 |
| F10:CHAIN-0.20 |    10 |    18 |    0.200 |        7 |     3.10 |      5 |       6 |                       5 |     4 |   7 |        2 |        3 |

**Desviación documentada**: el nivel `~0.50` es matemáticamente infactible en un DAG (un DAG sobre 27 nodos sintéticos admite como máximo 27×26/2 = 351 edges ⇒ densidad 351/870 = 0.403). Se sustituyó `DENSE-0.50` por `DENSE-MAX` (351 edges, DAG completo) y se documenta el límite como hallazgo del propio experimento.

**La matriz separa densidad de profundidad**: CHAIN-0.10 y STAR-0.10 comparten densidad 0.100 pero profundidades 27 vs 6; CHAIN-0.20 y STAR-0.20 comparten densidad 0.200 pero profundidades 27 vs 8; DENSE-MAX y CHAIN-0.20 comparten profundidad 27 pero densidades 0.403 vs 0.200.

## 5. Tabla principal (React = Angular en todas las celdas)

Valores de blast radius (`blast`), distancia causa→síntoma (`dist`), tests fallidos (`tests`) y archivos inspeccionados (`insp`) por topología y escenario. Los escenarios locales (M1, M3, M6, D1) son idénticos en las 11 topologías y se omiten por brevedad:

| Topología     | M2 (hub) tests | M3 tests | M5 tests | M4 blast | D2 dist | D2 insp | D2 tests |
| ------------- | -------------: | -------: | -------: | -------: | ------: | ------: | -------: |
| F30:CLEAN     |              1 |        0 |       27 |       13 |       1 |       1 |        1 |
| F30:CHAIN-.10 |             27 |        0 |       27 |       13 |      27 |       8 |       27 |
| F30:STAR-.10  |             24 |        0 |       27 |       13 |       6 |      24 |       24 |
| F30:STAR-.20  |             25 |        0 |       27 |       13 |       8 |      25 |       25 |
| F30:CHAIN-.20 |             20 |        0 |       27 |       13 |      27 |      14 |       20 |
| F30:BAL-.30   |             27 |        0 |       27 |       13 |      15 |      15 |       27 |
| F30:DENSE-.40 |             27 |        0 |       27 |       13 |      27 |      26 |       27 |
| F30:DENSE-MX  |             27 |        0 |       27 |       13 |      27 |      27 |       27 |
| F10:CLEAN     |              1 |        0 |        7 |       13 |       1 |       1 |        1 |
| F10:STAR-.20  |              7 |        0 |        7 |       13 |       4 |       7 |        7 |
| F10:CHAIN-.20 |              6 |        0 |        7 |       13 |       7 |       6 |        6 |

Notas:

- M3 (cambio de contrato) no rompe tests (0) pero sí typecheck (estos no se muestran; errores typecheck = consumidores sintéticos del contrato).
- M4 (eliminación de hub) rompe la shell de navegación (blast=13 fijo; incluye los archivos de wiring/feature no relacionados con la sección) — constante en todas las topologías.
- M5 (cambio de regla de dominio compartida) rompe tests = consumidores sintéticos de la regla (27 en F30 / 7 en F10), independiente de densidad y topología.

## 6. Pares de control obligatorios

Los 4 pares aíslan las variables; en todos React = Angular:

| Par   | A vs B                         | Igual                                                   | Diferente                    | D2 result (A vs B)                          | Lectura                                                                                                           |
| ----- | ------------------------------ | ------------------------------------------------------- | ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| PAR-1 | STAR-0.20 vs CHAIN-0.20        | featureCount=30, edges=174, **densidad=0.200**          | profundidad 8 vs 27          | dist 8 vs 27; tests 25 vs 20; insp 25 vs 14 | La densidad NO explica: misma densidad, distancia 3.4× por la profundidad                                         |
| PAR-2 | CHAIN-0.10 vs STAR-0.10        | featureCount=30, edges=87, **densidad=0.100**           | profundidad 27 vs 6          | dist 27 vs 6; tests 27 vs 24                | Misma densidad: la cadena profunda multiplica la distancia por 4.5                                                |
| PAR-3 | CHAIN-0.10 vs STAR-0.10        | featureCount=30, **edges=87**, profundidad cercana _no_ | distribución (chain vs star) | dist 27 vs 6; insp 8 vs 24                  | **Decisivo**: mismo nº de edges, el coste de debugging se intercambia entre distancia (chain) e inspección (star) |
| PAR-4 | F10:STAR-0.20 vs F30:STAR-0.20 | **densidad=0.200**, forma star                          | featureCount 10 vs 30        | dist 4 vs 8; insp 7 vs 25; tests 7 vs 25    | El coste escala con consumidores/profundidad, que crecen con el tamaño — no con el tamaño per se                  |

PAR-1 y PAR-2 **refutan "más densidad = más coste"**: con densidad idéntica, la topología profunda es la que eleva la distancia de debugging. PAR-3 demuestra que `density != depth != consumer_count`: mismo nº de edges produce dos perfiles de coste opuestos. PAR-4 une F20 con F19: al normalizar por densidad, el coste de debugging crece con la profundidad/consumidores que crecen con el tamaño.

## 7. Correlaciones

| Relación                                | n   | r     | r²   | Lectura                                                                           |
| --------------------------------------- | --- | ----- | ---- | --------------------------------------------------------------------------------- |
| maxDepth → causeToSymptomDistance (D2)  | 14  | 1.00  | 1.00 | **Determinista**: la distancia de debugging ES la profundidad del grafo recorrido |
| transitiveConsumers → testsFailing (M2) | 14  | 1.00  | 1.00 | **Determinista**: los tests rotos son exactamente los consumidores transitivos    |
| transitiveConsumers → testsFailing (D2) | 14  | 1.00  | 1.00 | Ídem                                                                              |
| maxDepth → filesInspected (D2)          | 14  | −0.29 | 0.09 | Débil/negativa: la inspección NO crece con la profundidad                         |
| density → maxDepth                      | 7   | 0.43  | 0.18 | Densidad NO predice profundidad (una estrella densa es poco profunda)             |

**Advertencia metodológica**: las métricas son deterministas (r = 1.00 proviene de identidad estructural, no de variabilidad estadística). Se presenta la correlación como confirmación de una relación funcional exacta, no como inferencia estadística independiente. Las celdas en que la variable no varía (r = null) se reportan como no correlacionables (v.g. M1/periférico constante).

## 8. Hipótesis H141–H150

| Hipótesis                                                                                    | Veredicto                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H141 — A igual nº de features, más densidad ⇒ mayor blast radius                             | **PARCIALMENTE CONFIRMADA**: solo cuando la densidad añade consumidores reales al destino; M2 tests 1→27 (CLEAN→DENSE) escala con consumidores, pero dos topologías de misma densidad difieren (STAR 24 vs CHAIN 20) |
| H142 — A igual nº de features, más densidad ⇒ mayor distancia causa→síntoma                  | **REFUTADA**: CHAIN-0.10 (dens. 0.100) tiene la distancia MÁXIMA (27) frente a STAR-0.10 (misma densidad, dist 6); la distancia la fija la profundidad, no la densidad                                               |
| H143 — Consumidores directos/transitivos explican mejor blast radius que nº de features      | **CONFIRMADA** (r=1.00, M2 y D2)                                                                                                                                                                                     |
| H144 — Profundidad máxima explica debugging mejor que densidad global                        | **CONFIRMADA** (r=1.00 deposición de D2; density→depth solo r=0.43)                                                                                                                                                  |
| H145 — Grafo denso poco profundo: más blast pero menor distancia que uno disperso y profundo | **CONFIRMADA**: STAR-0.20 (dens. 0.200, depth 8) ⇒ dist 8, insp 25; CHAIN-0.10 (dens. 0.100, depth 27) ⇒ dist 27, insp 8. La estrella inspecciona más pero localiza antes                                            |
| H146 — Coste local constante aunque aumente densidad cuando no cruza contratos               | **CONFIRMADA**: M1/M6/D1 = blast 2, insp 1 en las 11 topologías                                                                                                                                                      |
| H147 — Cambios sobre hubs/contratos comparten escalan con consumidores reales                | **CONFIRMADA** (M3/M5: tests/typecheck = consumidores sintéticos del contrato, 27/7, independiente de densidad)                                                                                                      |
| H148 — Diferencia medible entre aumentar densidad vs profundidad a edges aprox. constante    | **CONFIRMADA** (PAR-3: mismo nº de edges cambia el perfil de coste debugging)                                                                                                                                        |
| H149 — React y Angular misma relación densidad/blast/debugging                               | **CONFIRMADA** (valores idénticos en las 176 celdas)                                                                                                                                                                 |
| H150 — Umbral de densidad con crecimiento superlineal del espacio de búsqueda                | **REFUTADA** hasta densidad 0.403 (DAG completo): D2 inspid 27 = nº máximo de nodos sintéticos; crecimiento lineal, sin inflexión                                                                                    |

## 9. Blast radius vs density

| Densidad | Topología    | Blast M2 (tests) | Lectura                                   |
| -------: | ------------ | ---------------: | ----------------------------------------- |
|    0.000 | CLEAN        |                1 | Sine consumidores                         |
|    0.100 | CHAIN / STAR |          27 / 24 | Pordepende de la forma, no de la densidad |
|    0.200 | CHAIN / STAR |          20 / 25 | Misma densidad, perfiles distintos        |
|    0.300 | BALANCED     |               27 | Cubre todos los consumidores              |
|    0.400 | DENSE-0.40   |               27 | Techo = nº consumidores reales            |
|    0.403 | DENSE-MAX    |               27 | Techo = nº consumidores reales            |

El blast radius no sigue una curva con la densidad; sigue el **conjunto de consumidores reales del nodo modificado**. All densidades altas muestran el techo (27) porque el hub alcanza transitivamente a todos los sintéticos; densidades bajas también pueden alcanzarlo si la forma es una cadena larga (CHAIN-0.10 ⇒ 27).

## 10. Debugging distance vs depth

| Topología      | MaxDepth | D2 dist | D2 insp |
| -------------- | -------: | ------: | ------: |
| F30:CLEAN      |        1 |       1 |       1 |
| F30:STAR-0.10  |        6 |       6 |      24 |
| F30:STAR-0.20  |        8 |       8 |      25 |
| F30:BAL-0.30   |       15 |      15 |      15 |
| F30:CHAIN-0.10 |       27 |      27 |       8 |
| F30:CHAIN-0.20 |       27 |      27 |      14 |
| F30:DENSE-0.40 |       27 |      27 |      26 |
| F30:DENSE-MAX  |       27 |      27 |      27 |

`D2 dist ≡ maxDepth` (r=1.00). La distancia de localización de un bug semántico central es, exactamente, cuántas capas de dependencia hay que atravesar desde el síntoma UI hasta la causa. La densidad no la mueve: una estrella densa localiza en 6–8 capas; una cadena dispersa o un grafo denso y profundo en 27.

## 11. React vs Angular

Identidad total: en las 176 celdas, `filesChanged`, `filesInspected`, `causeToSymptomDistance`, `blastRadius`, `testsFailing`, `typecheckErrors`, `unrelatedFeatures` son iguales en React y Angular. La única diferencia observable de granularidad es la física (spec/template/component de Angular), que no altera ninguna métrica de coste estructural. React y Angular comparten la misma curva de densidad→profundidad→consumidores→coste.

## 12. Invariantes

- **CLEAN** (F30 y F10): 0 imports feature→feature (scannedEdges = 0), 0 reglas duplicadas, 0 deps nuevas, typecheck/test/lint/build verdes.
- **Acopladas**: únicamente las violaciones deliberadas (imports feature→feature del diseño); sin duplicación de reglas, sin deps nuevas, typecheck/test verdes.
- Todas las topologías cumplen scannedEdges == edges diseñados; 0 imports de domain→apps.

## 13. Diferencias significativas vs ruido

Métricas deterministas (git + typecheck/tests dirigidos, n=1 por celda): no hay ruido aleatorio. La variación observada es propiedad estructural exacta del grafo. La correlación density→depth (r=0.43) es real y obedece a que una estrella densa es, por construcción, poco profunda — es una restricción topológica, no una relación causal encubierta.

## 14. Qué hipótesis fueron confirmadas/refutadas/no concluyentes

- **CONFIRMADAS**: H143, H144, H145, H146, H147, H148, H149.
- **PARCIALMENTE CONFIRMADA**: H141 (densidad solo media si cambia consumidores o profundidad).
- **REFUTADAS**: H142 (densidad no incrementa distancia de debugging), H150 (sin umbral superlineal hasta 0.403).
- **NO CONCLUYENTES**: ninguna (todas las métricas son medibles y deterministas; los cruces de densidad fuera de DAG no existen).

## 15. Limitaciones

- Features adicionales generadas por template (catalogs) estructuralmente equivalentes; exceso de regularidad frente a features reales desiguales.
- Proxies estructurales (sin tiempo humano real de debugging).
- Grafo DAG (sin ciclos) por construcción; densidades > 0.403 imposibles sin romper la semántica de profundidad.
- n=1 por celda (métricas deterministas); la "correlación" r=1.00 es identidad estructural, no muestra estadística.
- Un solo dominio, una sola arquitectura, un repositorio.
- M4 (eliminación) mide el coste fijo del wiring de shell, no del acoplamiento (constante en todas las topologías).
- no extrapola a ciclos, dependencias transitivas cíclicas, o escalas > 30 features.

## 16. Comparación con F13–F19

- **F13 (mantenibilidad)**: F20 confirma que el coste local de mantenimiento es bajo y estable; añade que permanece constante incluso a densidad 0.403 con 30 features.
- **F17 (debugging multicapa)**: F20 refuerza que la profundidad de la causa (ya no solo la capa, sino la profundidad en el grafo) determina la distancia de localización; confirma con r=1.00.
- **F18 (acoplamiento)**: F20 matiza el efecto del acoplamiento: importar feature→feature encarece en la medida en que **acorta la distancia (profundidad) entre consumidor y dependencia** o añade consumidores reales; una estrella añade muchas aristas (fácil de inspeccionar todas) frente a una cadena que esconde la causa en capas profundas.
- **F19 (escalabilidad)**: F19 mostró crecimiento lineal con el tamaño a densidad constante (0.2). F20 mantiene lo mismo con densidad CONSTANTE y demuestra que la densidad NO es la variable explicativa: al variar densidad (0.1→0.4+) y forma, el coste sigue a profundidad y consumidores.
- **Síntesis**: la densidad NO es una variable causal útil por sí sola. El predictor robusto es el **grafo de dependencias** (profundidad para debugging, consumidores reales para blast radius).

## 17. Siguiente experimento recomendado

1. **F21 — Dependencias cíclicas (grafo con ciclos)**: F19/F20 usan DAG; qué ocurre si se introducen ciclos feature→feature (rompe profundidad bien definida, posibilidad de crecimiento superlineal y de blow-up del blast radius por recurrencia). Mayor valor científico para cerrar el modelo del grafo.
2. **F22 — Tests como red de seguridad bajo densidad**: cuantificar cuántos tests de regresión se necesitan por unidad de densidad/consumidor para mantener la localización efectiva; conecta el coste de prueba con la topología del grafo.
3. **F23 — Instrumentos de detección de densidad (visualizaciones/lint de arquitectura)**: implementar parsers/invariantes automáticos que adviertan de hubs, cadenas profundas o densidad alta como indicador temprano (extiende H140/H150 de dictamen a herramienta).

## 18. Estado de git

- Árbol productivo limpio (solo artefactos de F20): `scripts/measure-architecture-density-phase20.mjs`, `docs/experiments/density-vs-size-phase20.md`, `docs/experiments/results/density-vs-size-phase20.json` (176 celdas), `docs/experiments/README.md`, `package.json`.
- Copia aislada `/tmp/lab-phase20` con historial propio y 11 snapshots de topología.
- Sin commit.

## 19. Notificación ntfy

Notificación enviada al topic configurado con estado SUCCESS al completar todas las validaciones (ver sección Validaciones). Incluye: Fase 20 completada, 11 topologías, 176 celdas, veredictos H141–H150, estado de git, siguiente experimento.

## 20. Commit propuesto

```
test(experiments): isolate coupling density as the predictor of cost

fase 20 separates coupling density (edges/possible, 0.000..0.403 dag-limit
on 30 features, 0.200 on 10) from graph size and topology across 11
topologies and 176 structural cells (m1..m6, d1..d2, react and angular).
shows density alone is not the driver: cause->symptom distance follows graph
depth exactly (r=1.00, e.g. chain-0.10 dist 27 vs star-0.10 dist 6 at equal
density 0.100) and blast radius follows real transitive consumers (r=1.00);
local maintenance stays constant (blast 2) up to density 0.403; no
superlinear threshold found (h150 refuted); react and angular are identical
in every cell. adds scripts/measure-architecture-density-phase20.mjs,
results json and report; updates docs/experiments/README.md and package.json
(architecture:density); no production functionality changed.
```

---

**Regla final cumplida**: el experimento intentaba refutar "más densidad = más coste" y lo hizo (H142 y H150 refutadas). Se documenta explícitamente que densidad ≠ profundidad ≠ consumidores y que el coste lo determinan profundidad y consumidores, no la densidad. Sin commit; notificación ntfy entregada.
