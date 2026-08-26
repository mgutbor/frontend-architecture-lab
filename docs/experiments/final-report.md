# Frontend Architecture Lab — Final Report

> Cierre científico del laboratorio comparativo React vs Angular. Este documento sintetiza exclusivamente la evidencia documentada en F1–F20 y no introduce una Fase 21.

## 1. Executive Summary

El laboratorio estudió arquitectura, evolución del dominio, mantenibilidad, debugging, rendimiento y experiencia de usuario en implementaciones equivalentes de Operations Hub con React y Angular. La conclusión más sólida no es la superioridad de un framework, sino que las propiedades arquitectónicas —fuente única de verdad, contratos explícitos, aislamiento entre features, consumidores reales y profundidad del grafo— explican más variación de mantenimiento y debugging que la elección entre React y Angular dentro de este laboratorio.

La arquitectura limpia mantuvo 0 imports feature→feature, 0 reglas de dominio duplicadas, 0 dependencias nuevas injustificadas y blast radius localizado en las fases de evolución y mantenimiento. F18 mostró que el acoplamiento inducido empeora blast radius, distancia causa→síntoma y divergencia; F19 observó crecimiento lineal hasta 30 features; F20 separó densidad, profundidad y consumidores: la profundidad predijo la distancia de debugging y los consumidores transitivos predijeron el blast radius. No se observó crecimiento superlineal hasta la escala medida, pero esto no demuestra que no exista en sistemas mayores.

En rendimiento, el montaje de listas grandes dominó el coste end-to-end y Angular fue consistentemente más costoso en ese régimen; React acumuló más trabajo síncrono en actualizaciones incrementales y, bajo throttling, ese trabajo llegó a convertirse en INP/TBT. Estas son diferencias de régimen, no un ganador global. Las métricas dependen del harness, datasets, navegador y hardware utilizados.

## 2. Research Questions

1. ¿Qué coste estructural tienen React y Angular al crecer, evolucionar y depurar el mismo dominio?
2. ¿Puede mantenerse el dominio como fuente única de verdad durante breaking changes y migraciones graduales?
3. ¿Cómo afectan el acoplamiento, la profundidad y los consumidores al blast radius y a la localización de fallos?
4. ¿Cómo se comportan montaje, actualizaciones incrementales y UX bajo datasets grandes y CPU limitada?
5. ¿Qué decisiones arquitectónicas son defendibles con evidencia y cuáles no?

## 3. Experimental Methodology

Se utilizaron copias aisladas para los experimentos que modificaban temporalmente el producto, snapshots/commits propios, el mismo dominio y fixtures equivalentes, TypeScript, tests, lint, builds y, cuando correspondía, Chrome/CDP/Lighthouse. Las mediciones estructurales se basaron en archivos, LOC, imports, consumidores, capas, grafos, tests e invariantes. Las mediciones de runtime conservaron ejecuciones individuales y utilizaron medianas, p95, long tasks, main-thread work, INP/TBT cuando el harness podía medirlos.

El laboratorio distingue evidencia medida, interpretación y limitación. No se inventó tiempo humano de desarrollo o debugging. Las correlaciones estructurales de F19/F20 no se presentan como causalidad universal.

## 4. Phase Overview

| Fase | Tema                       | Objetivo                                           | Resultado principal                                                                                                                      | Estado / limitación principal                                                         |
| ---- | -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1    | Fundaciones                | Establecer repositorio, dominio y arquitectura     | Base común para React, Angular y domain                                                                                                  | Baseline histórico; no es un benchmark aislado                                        |
| 2    | Baseline                   | Medir aplicaciones iniciales                       | Baseline funcional, estructural y de calidad                                                                                             | Limitado al producto Operations Hub                                                   |
| 3    | Preparación arquitectónica | Consolidar contratos y capas                       | Preparó la comparación equivalente                                                                                                       | Evidencia preparatoria                                                                |
| 4    | React monolith             | Medir coste de una implementación monolítica React | Contrato funcional completo y coste de monolito                                                                                          | Limitado a este dominio y baseline                                                    |
| 5    | Angular monolith y bundle  | Comparar monolito Angular y atribuir bundle        | Angular tuvo diferencias de bundle; H2 sobre incremento comparable quedó refutada; H8 accesibilidad/rendimiento inicial confirmada       | Atribución React parcialmente medible; variantes AOT/JSX no son arquitectura completa |
| 6    | Evolución/coste de cambio  | Medir feature, regla, contrato y evolución         | Coste estructural equivalente, aislamiento y tests; H9–H13 confirmadas                                                                   | Experimento de cambios controlados                                                    |
| 7    | Interacción                | Medir latencia y trabajo por interacción           | Latencia percibida equivalente; React más trabajo síncrono y heap en listas                                                              | CDP directo y datasets acotados                                                       |
| 8    | Escalabilidad estructural  | Crecer de 0 a 10 features                          | Coste local e invariantes estables; Angular más bundle incremental                                                                       | Escala pequeña                                                                        |
| 9    | Interacción bajo carga     | Medir 30–300 elementos                             | Latencia agregada equivalente; sync React crece; aislamiento intacto                                                                     | Más allá de 300 no concluyente en parte del análisis                                  |
| 9.1  | Umbral de montaje          | Medir 300–3000 tareas                              | Montaje cruza 100 ms entre 300 y 600; Angular más costoso; long tasks antes en Angular                                                   | Cruces interpolados no son puntos medidos                                             |
| 9.2  | Actualización incremental  | Medir S2/S4 con datasets grandes                   | React acumula sync; S4 cambia de dirección según escenario; sin cruce de 100 ms hasta 2000                                               | Harness CDP y régimen concreto                                                        |
| 9.3  | End-to-end                 | Combinar montaje e interacción                     | Total aditivo y dominado por montaje; Angular peor globalmente; React más coste incremental                                              | Efectos de sesión/contexto limitan causalidad fina                                    |
| 10   | Lighthouse                 | Validar UX con User Flows                          | Montaje aparece en INP/TBT; accesibilidad equivalente; sync incremental React no cruza INP en el rango inicial                           | Artefactos/INP n/a documentados                                                       |
| 11   | Evolución de dominio       | Medir breaking changes                             | TypeScript localiza consumidores; dominio sigue fuente única; 0 coupling                                                                 | Número de consumidores del producto                                                   |
| 12   | Contratos versionados      | Coexistir V1/V2 y migrar gradualmente              | React V2 y Angular V1 coexistieron; compatibilidad localizada; retirada completa                                                         | Alcance temporal y dominio controlado                                                 |
| 13   | Mantenibilidad             | Comparar seis tareas heterogéneas                  | LOC comparables; Angular más archivos; 0 coupling; H82 parcial                                                                           | Proxies estructurales, no carga cognitiva humana                                      |
| 14   | Mantenimiento bajo carga   | Relacionar cambio estructural y runtime            | Sin delta runtime reproducible por mantenimiento; H88 no concluyente                                                                     | Sensibilidad limitada del harness                                                     |
| 15   | CPU throttling             | Medir degradación 1×/4×/6×                         | Angular penaliza más montaje; React paga sync incremental bajo CPU limitada                                                              | Throttling simulado, no hardware físico                                               |
| 16   | Lighthouse throttled       | Conectar main-thread work con UX                   | Sync React se convierte en INP/TBT bajo throttling; montaje sigue dominante; H97 resuelta                                                | Lighthouse/Chrome y muestras limitadas                                                |
| 17   | Debugging multicapa        | Medir bugs en presentación, servicio y dominio     | Distancia aumenta con capas; coste de corrección comparable; H114 parcial                                                                | Proxies de búsqueda, no tiempo humano                                                 |
| 18   | Acoplamiento inducido      | Medir coupling y duplicación                       | Blast radius, distancia y divergencia aumentan; arquitectura domina al framework                                                         | Acoplamiento deliberadamente inducido                                                 |
| 19   | Escalabilidad del grafo    | Medir 5/10/20/30 features con densidad constante   | Crecimiento lineal; profundidad y consumidores explican costes; React=Angular                                                            | No separa densidad por diseño; H140 no concluyente                                    |
| 20   | Densidad vs tamaño         | Separar densidad, profundidad y consumidores       | Densidad no fue predictor suficiente: profundidad predice debugging y consumidores blast; sin superlinealidad hasta 0.403; React=Angular | Grafo sintético controlado, máximo 30 features                                        |

## 5. Hypothesis Matrix

La matriz completa conserva los veredictos históricos documentados. Para H1–H8 se usan los veredictos de F5/Fase Lighthouse; H9–H13 corresponden a F6; H14–H18 a F7; H19–H26 a F8; H27–H30 a F9; H31–H34 a F9.1; H35–H40 a F9.2; H41–H46 a F9.3; H47–H52 a F10; H53–H62 a F11; H63–H75 a F12; H76–H82 a F13; H83–H90 a F14; H91–H100 a F15; H101–H110 a F16; H111–H120 a F17; H121–H130 a F18; H131–H140 a F19; H141–H150 a F20.

| Hipótesis | Fase | Resultado histórico                                      | Evidencia / limitación                                                                   |
| --------- | ---: | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| H1–H8     |    5 | Mayoritariamente confirmadas; H2 refutada; H8 confirmada | Bundle, AOT/JSX y Lighthouse; atribución React parcial                                   |
| H9–H13    |    6 | CONFIRMADAS                                              | Cambios equivalentes, tests e invariantes                                                |
| H14–H18   |    7 | CONFIRMADAS                                              | 160 interacciones CDP; 0 long tasks; trabajo sync desigual                               |
| H19–H26   |    8 | CONFIRMADAS                                              | 0→10 features; coste local e invariantes                                                 |
| H27       |    9 | CONFIRMADA, matizada                                     | Latencia agregada equivalente; dirección por escenario                                   |
| H28–H29   |    9 | CONFIRMADAS                                              | Sync React escala; 0 mutaciones fuera                                                    |
| H30       |    9 | CONFIRMADA en 30–300; fuera de rango NO CONCLUYENTE      | No permite extrapolar a datasets mayores                                                 |
| H31–H34   |  9.1 | CONFIRMADAS                                              | Umbral y crecimiento de montaje 300–3000                                                 |
| H35–H36   |  9.2 | CONFIRMADAS                                              | S2/S4 y sync incremental                                                                 |
| H37       |  9.2 | CONFIRMADA, dependiente del escenario                    | Angular/React cambian de dirección según interacción                                     |
| H38–H40   |  9.2 | CONFIRMADAS                                              | Umbral, aislamiento y régimen medido                                                     |
| H41–H46   |  9.3 | CONFIRMADAS                                              | Flujo aditivo, montaje dominante, long tasks y aislamiento                               |
| H47       |   10 | PARCIALMENTE CONFIRMADA                                  | Equivalencia pequeña; divergencia en montaje grande                                      |
| H48       |   10 | CONFIRMADA                                               | INP/TBT del mount; LCP/FCP no capturan SPA diferida                                      |
| H49       |   10 | PARCIALMENTE CONFIRMADA                                  | Main-thread work sí; INP no hasta 3000 en ese harness                                    |
| H50–H52   |   10 | CONFIRMADAS                                              | Direccionalidad, a11y y umbrales                                                         |
| H53–H62   |   11 | CONFIRMADAS                                              | Breaking change, entidad, regla central y locality                                       |
| H63–H74   |   12 | CONFIRMADAS                                              | Coexistencia, migración aislada, deuda temporal y retirada                               |
| H75       |   12 | CONFIRMADA                                               | Lectores read-only agnósticos a forma                                                    |
| H76–H81   |   13 | CONFIRMADAS                                              | Seis tareas, LOC/tests/invariantes                                                       |
| H82       |   13 | PARCIALMENTE CONFIRMADA                                  | Granularidad Angular vs composición React; no equivale a carga cognitiva                 |
| H83–H87   |   14 | CONFIRMADAS                                              | 200 celdas; deltas de runtime no reproducibles por mantenimiento                         |
| H88       |   14 | NO CONCLUYENTE según resumen de fase                     | No demuestra correlación entre código accidental y runtime                               |
| H89–H90   |   14 | CONFIRMADAS                                              | Aislamiento y patrones reproducibles                                                     |
| H91–H96   |   15 | CONFIRMADAS                                              | 108 celdas × 5; throttling real CDP                                                      |
| H97       |   15 | NO CONCLUYENTE                                           | INP no medible en CDP directo                                                            |
| H98–H100  |   15 | CONFIRMADAS                                              | Sensibilidad diferencial y cambio sync→duración                                          |
| H101–H110 |   16 | CONFIRMADAS                                              | Lighthouse throttled; H97 resuelta; limitaciones Lighthouse documentadas                 |
| H111–H113 |   17 | CONFIRMADAS                                              | Profundidad, capas y espacio de búsqueda                                                 |
| H114      |   17 | PARCIALMENTE CONFIRMADA                                  | Compartición pesa más que profundidad en blast                                           |
| H115–H120 |   17 | CONFIRMADAS                                              | Equivalencia, tests e invariantes                                                        |
| H121–H130 |   18 | CONFIRMADAS según informe de F18                         | Coupling, duplicación, debugging y recuperación; variante inducida limita generalización |
| H131      |   19 | PARCIALMENTE CONFIRMADA                                  | Solo cambios que cruzan consumidores/hubs escalan                                        |
| H132–H137 |   19 | CONFIRMADAS                                              | Coste local plano, blast/consumidores y debugging central                                |
| H138      |   19 | REFUTADA / sin superlinealidad observada                 | Hasta 30 features y densidad constante                                                   |
| H139      |   19 | CONFIRMADA                                               | Curvas React/Angular equivalentes                                                        |
| H140      |   19 | NO CONCLUYENTE                                           | Densidad constante por diseño                                                            |
| H141      |   20 | PARCIALMENTE CONFIRMADA                                  | Densidad importa solo cuando añade consumidores reales                                   |
| H142      |   20 | REFUTADA                                                 | Misma densidad con profundidad distinta produce distinta distancia                       |
| H143–H149 |   20 | CONFIRMADAS                                              | Consumidores, profundidad, topologías y equivalencia cross-framework                     |
| H150      |   20 | REFUTADA en el rango medido                              | No hay umbral superlineal hasta DAG máximo factible 0.403; no extrapolar                 |

### Criterio de lectura

Un veredicto histórico no se sustituye por una fase posterior. Por ejemplo, H97 se conserva como NO CONCLUYENTE en F15 y F16 aporta evidencia posterior que la resuelve en el contexto Lighthouse; H140 sigue NO CONCLUYENTE en F19 y F20 la estudia con topologías adicionales. Las fases posteriores matizan el alcance, no reescriben los resultados originales.

## 6. Architectural Findings

### A. Arquitectura

La separación por capas y la dependencia dirigida hacia el dominio mantuvieron invariantes estables en F6, F8, F11–F14 y F17–F20. Evidencia: HIGH dentro de este repositorio; limitada por el tamaño y el patrón de arquitectura.

### B. Dominio

El dominio fue fuente única de verdad en evolución, migración y reglas centrales. F11/F12/F18/F20 respaldan que centralizar reglas evita divergencia durante cambios. Confianza: HIGH para este dominio.

### C. Contratos

Los breaking changes son detectables y el versionado temporal permite migración gradual si la compatibilidad se localiza y tiene plan de retirada. F11/F12. Confianza: HIGH en el experimento; no implica que toda migración real sea mecánica.

### D. Acoplamiento

El coupling feature→feature y la duplicación aumentan blast radius, consumidores afectados y riesgo de divergencia en F18. F19/F20 muestran que densidad por sí sola no describe el coste: deben observarse consumidores y profundidad. Confianza: HIGH para los grafos medidos; causalidad universal: no demostrada.

### E. Mantenibilidad

El coste estructural local fue comparable entre frameworks y permaneció localizado cuando no se cruzaron contratos compartidos. F13/F14/F19/F20. Confianza: MEDIUM/HIGH; los proxies no miden carga cognitiva humana.

### F. Debugging

La distancia causa→síntoma y el espacio de búsqueda crecen con capas/profundidad y consumidores. F17/F18/F19/F20. Confianza: HIGH como proxy estructural; MEDIUM como representación del debugging humano.

### G. Rendimiento

El montaje de grandes listas domina los flujos completos; las actualizaciones incrementales tienen otro régimen. Angular fue más costoso en montaje; React acumuló más trabajo síncrono incremental, especialmente visible bajo throttling. F9.1–F16. Confianza: HIGH para el harness y datasets medidos; no universal.

### H. UX

Lighthouse conectó main-thread work con INP/TBT bajo throttling y confirmó que el montaje puede dominar UX, mientras el trabajo incremental React se vuelve relevante con CPU limitada. F10/F16. Confianza: MEDIUM por entorno headless, muestra y emulación.

### I. React vs Angular

No hay evidencia de superioridad arquitectónica global. F6–F8, F11–F14, F17–F20 muestran costes estructurales equivalentes o explicables por la arquitectura. Las diferencias de runtime son dependientes del escenario: Angular montaje, React incremental bajo carga limitada. Confianza: MEDIUM dentro del dominio.

### J. Escalabilidad

La superficie local puede permanecer constante; cambios compartidos escalan con consumidores; debugging acoplado escala con profundidad; no se observó superlinealidad hasta 30 features. F19/F20. Confianza: MEDIUM por escala sintética y limitada.

## 7. Domain and Contracts

El patrón defendible es un dominio compartido con reglas de negocio centralizadas y contratos explícitos consumidos por ambas aplicaciones. F11 detectó consumidores reales de breaking changes mediante TypeScript; F12 demostró coexistencia V1/V2, compatibilidad en la frontera y retirada de V1 sin segunda fuente de verdad. La deuda de compatibilidad es temporal, medible y debe desaparecer tras la migración.

No se justifica duplicar reglas para permitir una migración más cómoda. Si una transformación es necesaria, debe vivir en una frontera identificable, tener consumidores y fecha/condición de retirada verificables.

## 8. Coupling and Scalability

F18 estableció el coste del acoplamiento inducido. F19 mostró que, con densidad constante, el crecimiento observado fue lineal hasta 30 features. F20 separó variables:

- `density != depth != consumers`.
- La profundidad máxima fue el predictor observado de `causeToSymptomDistance` (r=1.00 en el conjunto determinista de F20).
- Los consumidores transitivos predijeron `blastRadius`/tests afectados (r=1.00 en el conjunto determinista).
- Un grafo denso y superficial puede inspeccionarse ampliamente pero atravesar pocas capas; uno profundo y disperso puede tener menor blast horizontal y mayor distancia vertical.
- El coste local no creció en las topologías medidas.

Los valores r proceden de métricas deterministas del diseño; no deben interpretarse como significancia estadística independiente.

## 9. Debugging and Maintainability

F13 no midió tiempo humano: utilizó superficie, LOC, símbolos y proxies. F17 añadió bugs multicapa y mostró que la profundidad aumenta el espacio de búsqueda aunque la corrección final pueda ser pequeña. F18 hizo explícito que coupling y duplicación ensanchan el radio afectado. F19/F20 mostraron que el número total de features no basta: importan consumidores, profundidad y distribución topológica.

La duplicación de reglas es especialmente peligrosa porque puede mantener tests verdes inicialmente y divergir después. Los tests son red de seguridad, no sustituto de ownership ni de límites arquitectónicos.

## 10. Performance and UX

| Régimen                       | React                                       | Angular                                                            | Lectura limitada al laboratorio                               |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Montaje grande                | Generalmente menor que Angular              | Generalmente mayor                                                 | Angular tiene penalización consistente en S1/F9.1/F10/F15/F16 |
| Incremental con CPU abundante | Más sync work, latencia a menudo comparable | Menos sync directo; commit puede ser mayor en escenarios concretos | El resultado depende de S2/S4 y del harness                   |
| Incremental con CPU limitada  | Sync work se convierte en duración/INP/TBT  | Menor sync incremental observado                                   | F15/F16 muestran cambio de régimen, no superioridad global    |
| E2E                           | Ventaja incremental parcial                 | Montaje domina y eleva total                                       | El ganador global del flujo depende de la combinación         |
| LCP/FCP                       | Equivalentes en controles                   | Equivalentes en controles                                          | SPA diferida hace que no capturen todo el coste de montaje    |
| Accesibilidad                 | 100/100 en controles medidos                | 100/100 en controles medidos                                       | No prueba accesibilidad universal                             |

El puente `CPU throttling → main-thread work → long tasks → INP/TBT` quedó medible en F16. Esto no convierte 4×/6× en equivalentes exactos a dispositivos físicos ni permite predecir producción.

## 11. React vs Angular

| Dimensión                  | React                                                      | Angular                               | Conclusión                                                     |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| Arquitectura y aislamiento | Comparable                                                 | Comparable                            | No hay superioridad observada                                  |
| LOC de mantenimiento       | Similar                                                    | Similar                               | Diferencias pequeñas y dependientes de escenario               |
| Granularidad física        | Menos archivos en F13                                      | Más archivos por TS/template/spec     | Diferencia estructural, no automáticamente coste accidental    |
| Breaking changes/migración | Aislable                                                   | Aislable                              | F11/F12: ambos preservan invariantes                           |
| Debugging multicapa        | Comparable                                                 | Comparable                            | Diferencias atribuidas a cobertura/estructura, no al framework |
| Montaje grande             | Menor en los regímenes medidos                             | Mayor                                 | Diferencia real de runtime en este harness                     |
| Incremental                | Más trabajo sync; peor bajo throttling en S4               | Menos sync directo en ese régimen     | Diferencia de régimen, no global                               |
| UX/a11y                    | A11y equivalente; INP incremental sensible bajo throttling | A11y equivalente; montaje más costoso | Depende de escenario y dataset                                 |
| Escalabilidad del grafo    | Curva equivalente                                          | Curva equivalente                     | Arquitectura explica más que framework                         |

No existe evidencia de que React sea arquitectónicamente superior a Angular en general, ni evidencia de superioridad global de Angular. Sí existen diferencias medidas de runtime en escenarios concretos.

## 12. Refuted and Inconclusive Hypotheses

### Lo que el laboratorio no demostró

- H2 quedó refutada respecto a incremento de bundle comparable; la atribución causal completa del lado React fue parcial.
- H49 fue solo parcialmente confirmada en F10: main-thread work no implicó INP adicional en ese rango.
- H82 solo fue parcialmente confirmada: más archivos Angular y composición/hook setup React son observaciones estructurales, no una medida de carga cognitiva.
- H88 no demostró que código accidental estructural cause runtime adicional.
- H97 fue NO CONCLUYENTE en F15 porque CDP directo no medía INP como Lighthouse; F16 aporta una resolución metodológica posterior, sin borrar el veredicto de F15.
- H114 fue parcial: el blast radius dependió también de compartición, no solo de profundidad.
- H130 y otras conclusiones de recuperación de F18 están limitadas al acoplamiento inducido del sandbox.
- H138/H150 no encontraron crecimiento superlineal hasta las escalas medidas; no refutan su existencia fuera de ellas.
- H140 fue no concluyente en F19 porque la densidad permaneció constante; F20 aporta separación dentro de nuevas topologías.
- Las fases no demostraron productividad humana, carga cognitiva subjetiva, aprendizaje, calidad de código subjetiva ni tiempos humanos de debugging.

## 13. Architectural Principles

### Principle 1 — Mantener una única fuente de verdad para las reglas

**Statement:** Las reglas de negocio deben vivir en el dominio compartido.

**Evidence:** F6, F11, F12, F18, F20.

**Why:** La centralización evitó divergencia durante breaking changes, coexistencia V1/V2 y cambios compartidos.

**Trade-off:** Cambiar una regla compartida afecta a consumidores reales y exige tests de contrato.

**Confidence:** HIGH.

### Principle 2 — Hacer explícitos los contratos

**Statement:** Los consumidores deben depender de contratos tipados y versionables, no de formas implícitas.

**Evidence:** F11–F12.

**Why:** TypeScript localizó consumidores y permitió migración gradual.

**Trade-off:** Un breaking change puede tener blast radius amplio pero visible.

**Confidence:** HIGH.

### Principle 3 — Localizar la compatibilidad temporal

**Statement:** Un adaptador V1/V2 debe vivir en una frontera clara y tener retirada verificable.

**Evidence:** F12.

**Why:** La coexistencia real no duplicó reglas y terminó con 100% de migración.

**Trade-off:** Existe compatibility debt temporal y mantenimiento adicional.

**Confidence:** HIGH.

### Principle 4 — Evitar imports directos feature→feature

**Statement:** Las features deben depender de capas permitidas y no de implementaciones de otras features.

**Evidence:** F8, F11–F14, F17–F20.

**Why:** F18 midió mayor blast/search bajo coupling; F20 mostró efectos de profundidad y consumidores.

**Trade-off:** Puede requerir contratos o coordinación en una capa compartida bien ownershipada.

**Confidence:** HIGH.

### Principle 5 — No duplicar reglas de negocio

**Statement:** La duplicación de una regla debe tratarse como deuda explícita y temporal, no como arquitectura permanente.

**Evidence:** F12, F18, F20.

**Why:** La divergencia puede aparecer aunque la implementación inicial conserve comportamiento.

**Trade-off:** La centralización aumenta el número de consumidores que deben validarse.

**Confidence:** HIGH.

### Principle 6 — Vigilar consumidores y profundidad, no solo tamaño o densidad

**Statement:** El blast radius debe analizar consumidores reales y debugging debe controlar profundidad del grafo.

**Evidence:** F17, F19, F20.

**Why:** En F20 consumidores y profundidad explicaron perfiles distintos; densidad no fue suficiente.

**Trade-off:** Requiere mantener análisis de dependencias y no reducir la salud arquitectónica a una sola cifra.

**Confidence:** HIGH como principio de medición.

### Principle 7 — Separar coste local de coste compartido

**Statement:** Un cambio local puede permanecer constante mientras un cambio sobre contrato/hub escala con consumidores.

**Evidence:** F11, F13, F19, F20.

**Why:** Evita confundir número total de archivos del sistema con blast radius real.

**Trade-off:** Las métricas deben clasificar correctamente consumidores directos/transitivos.

**Confidence:** HIGH en el rango medido.

### Principle 8 — Medir montaje e interacción como regímenes distintos

**Statement:** Las decisiones de rendimiento deben evaluar montaje, actualización incremental y E2E por separado.

**Evidence:** F9.1–F10, F15–F16.

**Why:** Angular penalizó montaje y React incremental bajo CPU limitada; una media global ocultaría ambos patrones.

**Trade-off:** El harness es más complejo y requiere más ejecuciones.

**Confidence:** HIGH para el laboratorio.

### Principle 9 — Tratar tests como red de seguridad, no como sustituto de arquitectura

**Statement:** Los tests detectan regresiones, pero no eliminan coupling ni duplicación.

**Evidence:** F12, F17, F18.

**Why:** El acoplamiento puede permanecer estructuralmente dañino con suite verde.

**Trade-off:** Más cobertura aumenta señales y coste de mantenimiento.

**Confidence:** MEDIUM/HIGH.

### Principle 10 — Documentar limitaciones junto con resultados

**Statement:** Toda métrica debe incluir su alcance, harness y amenazas de validez.

**Evidence:** F5, F9–F10, F14–F16, F19–F20.

**Why:** Los resultados de CDP, Lighthouse, proxies y hardware no son intercambiables.

**Trade-off:** El informe es menos concluyente y más honesto.

**Confidence:** HIGH.

## 14. Defensible Architectural Decisions

| Decisión                                                  | Evidencia          | Confianza   | Trade-off                                      |
| --------------------------------------------------------- | ------------------ | ----------- | ---------------------------------------------- |
| Mantener reglas en `packages/domain`                      | F11, F12, F18, F20 | HIGH        | Cambios centrales notifican a más consumidores |
| Usar contratos tipados explícitos                         | F11, F12           | HIGH        | Breaking changes visibles y mecánicos          |
| Localizar adaptadores V1/V2                               | F12                | HIGH        | Compatibility debt temporal                    |
| Prohibir imports feature→feature directos                 | F8, F17–F20        | HIGH        | Puede requerir contratos/intermediarios claros |
| Escanear duplicación de reglas                            | F12, F18, F20      | HIGH        | Requiere tooling/documentación                 |
| Medir consumidores y profundidad del grafo                | F19–F20            | HIGH        | No basta una métrica agregada                  |
| Separar benchmarks de mount, incremental y E2E            | F9–F16             | HIGH        | Mayor coste de medición                        |
| Usar tests de regresión e invariantes arquitectónicas     | F11–F18            | MEDIUM/HIGH | Tests verdes no prueban ausencia de deuda      |
| Verificar a11y con auditorías, no inferirla del framework | F5, F10, F16       | MEDIUM      | Cobertura limitada al producto y auditor       |
| Mantener planes de retirada para deuda temporal           | F12, F18           | HIGH        | Exige disciplina de limpieza                   |

## 15. Decisions We Cannot Defend

- Elegir React o Angular como ganador global de arquitectura.
- Afirmar que React es globalmente más rápido o Angular globalmente más lento.
- Extrapolar las curvas de 30 features a 1000 features.
- Afirmar que no existe crecimiento superlineal fuera del rango medido.
- Traducir 4×/6× CDP a un dispositivo físico concreto.
- Afirmar productividad humana, carga cognitiva o tiempo humano de debugging a partir de LOC/archivos.
- Afirmar causalidad entre número de archivos/framework y runtime.
- Generalizar a otros dominios, equipos, arquitecturas, navegadores o infraestructuras.
- Crear ADRs definitivos automáticamente a partir de este informe sin revisión de contexto.

## 16. Recommended Reference Architecture

Arquitectura conceptual compatible con la evidencia:

```text
apps
├── react-app
│   └── features ─────┐
└── angular-app       │
    └── features ────┤
                     ↓
                 packages/domain
                     ↓
              shared/infrastructure
```

### Dependencias permitidas

- `apps` consume `packages/domain` mediante contratos públicos.
- Cada feature consume su propio state/service/component y el dominio compartido.
- `shared/infrastructure` ofrece capacidades transversales sin ownership de reglas de negocio.

### Dependencias prohibidas

- feature → feature directo salvo una excepción documentada y temporal.
- domain → apps.
- React → Angular o Angular → React.
- duplicación de reglas en adapters de framework.
- acceso de consumidores a internals no públicos del dominio.

### Ownership y testing

El dominio owns contracts, entidades, invariantes y reglas. Las features own presentación y composición local. Los tests del dominio cubren reglas; tests de features cubren integración y UI; checks automáticos inspeccionan imports, duplicación, referencias temporales y consumidores afectados.

### Observabilidad

Separar métricas de montaje, incremental y E2E; conservar p50/p95 y runs; registrar dataset, navegador, CPU, long tasks, INP/TBT y checks. Para arquitectura, registrar nodos, edges, profundidad, consumidores y blast radius.

## 17. ADR Candidates

No se crean ADRs en esta fase. Candidatos para revisión posterior:

1. **Ownership de reglas en el dominio compartido** — F11, F12, F18, F20. Consecuencia: cambios centrales requieren coordinación de consumidores.
2. **Regla de dependencia entre features y capas** — F8, F17–F20. Consecuencia: menor acoplamiento, posible necesidad de contratos explícitos.
3. **Estrategia de contratos versionados y retirada** — F12. Consecuencia: migración gradual con deuda temporal controlada.
4. **Política de duplicación de reglas** — F12, F18, F20. Consecuencia: adapters limitados a forma y no a negocio.
5. **Matriz de rendimiento por régimen** — F9–F16. Consecuencia: no usar una única métrica global.
6. **Observabilidad del grafo arquitectónico** — F19–F20. Consecuencia: controlar consumidores y profundidad además de density.

## 18. Limitations

### A. Proyecto

- Dominio y número de features limitados; las escalas grandes de F19/F20 usan features generadas con patrón controlado.
- No representa organizaciones, equipos o repositorios de otra estructura.

### B. Hardware y entorno

- Una máquina, navegador y entorno local/headless.
- CPU throttling simulado por CDP; no equivale exactamente a hardware real.
- Scheduler, GC y variabilidad del navegador pueden afectar runtime.

### C. Datasets

- Rangos concretos: desde decenas hasta 3000 tareas y hasta 30 features.
- No se midieron todos los regímenes posibles ni producción real.

### D. Proxies

- Archivos, LOC, capas, inspecciones y correlaciones no son carga cognitiva ni productividad humana.
- Las correlaciones de F20 son sobre métricas deterministas y no significancia estadística independiente.

### E. Frameworks

- Solo versiones, configuración y patrones de este repositorio.
- Diferencias de tooling, templates/TSX y cobertura pueden afectar resultados.

### F. Métricas

- LCP/FCP no capturan necesariamente montaje SPA diferido.
- INP/TBT dependen del harness; CDP directo no sustituye Lighthouse.
- Las reglas de detección de archivos/imports pueden ser sensibles a granularidad.

### G. Generalización

No se puede generalizar a otros dominios, escalas, equipos, navegadores, dispositivos físicos ni aplicaciones con arquitectura diferente.

### Cinco limitaciones prioritarias

1. Ausencia de tiempo humano real.
2. Escala y dominio limitados.
3. Dependencia de un entorno/hardware/navegador.
4. Proxies estructurales como representación indirecta de mantenibilidad/debugging.
5. Diferencia entre benchmarks controlados y producción real.

## 19. Threats to Validity

### Internal validity

El observador, el orden de ejecución, GC, scheduler, builds, fixtures generados y diferencias de tooling pueden explicar parte de las diferencias. Se mitigó con copias, snapshots, datasets equivalentes, warm-up, repeticiones y checks, pero no se eliminan.

### External validity

Las conclusiones solo cubren el dominio Operations Hub, el patrón de capas, las escalas y los entornos medidos. El resultado no representa todos los proyectos React/Angular.

### Construct validity

Blast radius, archivos inspeccionados y distancia son proxies razonables de superficie estructural, pero no de experiencia psicológica. INP/TBT son proxies de UX del browser, no satisfacción de usuarios ni rendimiento extremo de dispositivos reales.

### Reproducibility

Las transformaciones de dominio, generación de grafos, imports y snapshots son principalmente deterministas. Runtime, Lighthouse, long tasks e INP dependen del entorno y requieren repetir con la misma metodología y configuración.

## 20. Final Conclusions

1. La arquitectura limpia preservó invariantes y localizó cambios en el dominio estudiado.
2. Los contratos explícitos y el ownership centralizado hicieron visibles breaking changes y permitieron migración gradual sin segunda fuente de verdad.
3. El coupling feature→feature y la duplicación añaden deuda medible; tests verdes no la eliminan.
4. `density != depth != consumers`: profundidad y consumidores explicaron perfiles diferentes de debugging y blast radius en F20.
5. El crecimiento observado fue lineal hasta 30 features; no se observó superlinealidad hasta esa escala, sin poder extrapolar más allá.
6. React y Angular fueron arquitectónicamente comparables en las tareas y grafos medidos; no se justifica un ganador global.
7. Sí hubo diferencias de runtime por régimen: Angular penalizó más el montaje grande; React acumuló más coste incremental bajo CPU limitada.
8. Lighthouse confirmó que parte de esas diferencias puede llegar a INP/TBT, especialmente bajo throttling, pero las conclusiones siguen limitadas al entorno experimental.
9. Las decisiones defendibles son principalmente arquitectónicas y de medición: single source of truth, contratos, límites de dependencia, control de consumidores/profundidad y benchmarks separados por régimen.
10. El laboratorio queda cerrado en F1–F20. No se crea ni se propone una Fase 21 experimental en este cierre.
