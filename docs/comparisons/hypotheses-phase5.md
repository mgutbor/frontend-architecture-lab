# Fase 5 — Hipótesis de comparación Angular vs React

- **Estado:** Pendiente de validación (hipótesis formuladas antes de implementar/completar el Angular Monolith)
- **Evidencia de referencia:** [baseline-phase2](../experiments/baseline-phase2.md) y [results/baseline-phase2.json](../experiments/results/baseline-phase2.json) · [react-monolith-phase4](../experiments/react-monolith-phase4.md) y [results/react-monolith-phase4.json](../experiments/results/react-monolith-phase4.json)
- **Documentos relacionados:** [Metodología de métricas](../experiments/metrics.md) · [Scorecard](./scorecard.md) · [Arquitectura frontend](../architecture/frontend-architecture.md) · [ADR-001](../decisions/ADR-001-shared-domain-package.md) · [ADR-002](../decisions/ADR-002-state-management-react-angular.md)

## 1. Objetivo

Estas hipótesis se formulan **antes** de implementar/completar el Angular Monolith (Fase 5). Su finalidad es fijar por adelantado qué afirmaciones la Fase 5 deberá validar o refutar mediante evidencia medida con la misma metodología de [metrics.md](../experiments/metrics.md) (mediana y rango de 3 ejecuciones, entorno de referencia registrado, limitaciones explícitas).

El propósito del laboratorio es **comparar ambos enfoques con evidencia**, no demostrar que uno sea superior al otro. Una hipótesis refutada es un resultado válido del experimento, no un fallo. Ninguna de las afirmaciones siguientes debe leerse como conclusión anticipada: son afirmaciones comprobables, con criterios de confirmación/refutación definidos en la sección 3.

## 2. Reglas de interpretación

1. Una hipótesis puede ser confirmada, parcialmente confirmada o refutada.
2. Ninguna métrica aislada determina qué framework es mejor.
3. Las comparaciones deben usar las mismas condiciones y metodología del baseline.
4. No interpretar como mejora una variación que esté dentro del rango/ruido de medición.
5. Diferenciar coste absoluto de coste incremental.
6. No confundir LOC, número de tests o número de dependencias con calidad arquitectónica.
7. Toda conclusión debe apoyarse en datos medidos.
8. Si una métrica no puede obtenerse, documentar explícitamente el motivo.

## 3. Hipótesis

### H1 — Dependencias

**Hipótesis:**

Angular podrá implementar el contrato funcional completo sin añadir dependencias runtime nuevas, del mismo modo que React.

**Criterio:**

- Confirmada si delta de dependencias runtime = 0.
- Refutada si necesita nuevas dependencias runtime.
- Diferenciar claramente dependencias propias de Angular/toolchain de nuevas dependencias introducidas durante la Fase 5.

**Métrica:** `dependencies` (runtime / dev / transitivas, mismas heurísticas que el baseline).

### H2 — Bundle

**Hipótesis:**

El incremento de bundle producido por completar Angular Monolith será inferior o comparable al incremento observado en React (+25 kB raw), debido en parte a la compilación AOT de templates.

> IMPORTANTE: presentado como hipótesis, no como hecho. El +25 kB raw de React es un resultado ya medido en la Fase 4 (24 985 B raw sobre un baseline de 208 562 B); qué ocurra en Angular solo lo dirá la medición.

**Criterio:**

Comparar delta absoluto y porcentual respecto al baseline Angular existente (136 621 B raw / 43 930 B gzip en Fase 2), con su rango de medición.

**Métrica:** `build.assets` (raw / gzip / brotli, nº de chunks).

### H3 — Build

**Hipótesis:**

Angular tendrá un coste de build absoluto superior a React, pero el incremento producido por completar el contrato será razonable y reproducible.

> No concluir que Angular «escala peor» salvo que los datos lo demuestren.

**Criterio:**

Comparar:

- baseline Angular
- Angular Monolith
- React baseline
- React Monolith

Usar mediana y rango de 3 ejecuciones (build en frío, mismo procedimiento que el baseline).

**Métrica:** `build.time`.

### H4 — Tests

**Hipótesis:**

Angular podrá alcanzar una cobertura funcional equivalente con un número de tests similar, aunque el coste temporal por test podría ser superior al de React.

**Criterio:**

Comparar:

- número de tests
- tiempo total
- tiempo/test
- naturaleza de los tests

No utilizar tiempo/test como métrica de calidad.

**Métrica:** `quality.tests`.

### H5 — Arquitectura

**Hipótesis:**

Angular mantendrá las mismas fronteras arquitectónicas que React:

- 0 imports entre features
- 1 adapter de dominio
- estado encapsulado
- dominio compartido
- ausencia de una capa shared innecesaria

Además, medir explícitamente el coste de duplicación deliberada derivado de ADR-002.

**Métrica:** `architecture` (imports entre features, importadores del adapter, imports de dominio por capa, directorios compartidos, pares de duplicación deliberada).

### H6 — Developer Experience

**Hipótesis:**

El coste observable de implementar una feature equivalente será comparable entre React y Angular, aunque la distribución de archivos y responsabilidades pueda ser diferente.

Comparar específicamente:

- número de archivos creados/modificados
- pasos necesarios
- wiring
- tests
- template/component
- integración con estado
- integración con dominio

> NO crear una puntuación subjetiva de DX.

**Métrica:** flujo observable documentado (mismo escenario de feature que el Anexo A de `baseline-phase2.md` y la sección 9 de `react-monolith-phase4.md`).

### H7 — Código

**Hipótesis:**

Angular probablemente requerirá más LOC de producción por feature debido a componentes, decoradores/templates y separación HTML/TS, pero esto no implica peor arquitectura.

Comparar:

- LOC producción
- LOC tests
- ratio tests/código
- archivos por feature

No convertir LOC en una métrica de calidad.

**Métrica:** `code` (mismas heurísticas de conteo que el baseline).

### H8 — Accesibilidad

**Hipótesis:**

Ambas implementaciones deberían poder alcanzar resultados equivalentes de accesibilidad porque implementan exactamente el mismo contrato ACC-1…8.

> IMPORTANTE: no afirmar ningún resultado hasta poder ejecutar Lighthouse.

**Estado:** pendiente debido al bloqueo de Chrome headless documentado en Fase 4.1 ([react-monolith-phase4.md](../experiments/react-monolith-phase4.md) §8): Chrome headless se cuelga al cargar URLs HTTP en este entorno, por lo que Lighthouse no pudo ejecutarse sobre React. El motivo queda registrado (regla 8); la hipótesis no se evalúa hasta disponer de un entorno donde Lighthouse funcione.

**Métrica:** Lighthouse accessibility, cuando el entorno permita obtenerla.

## 4. Tabla resumen

| ID  | Hipótesis                                                                                       | Métrica                      | Criterio de validación                                                                              | Estado    |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| H1  | Implementar el contrato completo sin dependencias runtime nuevas                                | dependencies                 | delta de dependencias runtime = 0 (distinguiendo toolchain de dependencias nuevas de Fase 5)        | Pendiente |
| H2  | Incremento de bundle inferior o comparable al de React (+25 kB raw)                             | build.assets                 | delta absoluto y porcentual vs baseline Angular, con rango de medición                              | Pendiente |
| H3  | Coste de build absoluto superior a React, con incremento razonable y reproducible               | build.time                   | mediana y rango de 3 ejecuciones en los 4 escenarios                                                | Pendiente |
| H4  | Cobertura funcional equivalente con nº de tests similar (posible mayor coste temporal por test) | quality.tests                | nº de tests, tiempo total, tiempo/test y naturaleza de los tests                                    | Pendiente |
| H5  | Mismas fronteras arquitectónicas que React + coste de duplicación deliberada (ADR-002)          | architecture                 | 0 imports entre features, 1 adapter, estado encapsulado, dominio compartido, sin shared innecesaria | Pendiente |
| H6  | Coste observable de una feature equivalente comparable entre React y Angular                    | flujo observable documentado | nº de archivos, pasos, wiring, tests, template/component, integración con estado y dominio          | Pendiente |
| H7  | Más LOC de producción por feature, sin implicar peor arquitectura                               | code                         | LOC producción/tests, ratio tests/código, archivos por feature                                      | Pendiente |
| H8  | Resultados de accesibilidad equivalentes (contrato ACC-1…8)                                     | Lighthouse accessibility     | ejecución de Lighthouse; bloqueado por Chrome headless (Fase 4.1)                                   | Pendiente |

## 5. Comparación que deberá realizar Fase 5

La Fase 5 debe producir exactamente estas comparaciones:

1. **Angular baseline → Angular Monolith**: coste de completar el contrato funcional en Angular.
2. **React baseline → React Monolith**: coste ya medido en la Fase 4, reutilizado como referencia (evidencia inmutable: `results/react-monolith-phase4.json`).
3. **Incremento Angular vs incremento React**: comparación de los dos deltas anteriores (el objeto central de la hipótesis).

En cada comparación, separar siempre:

- **valor absoluto** (cada escenario por separado),
- **delta** (variación absoluta),
- **porcentaje** (variación relativa),
- **rango de medición** (min–max de las ejecuciones, para no interpretar ruido como cambio real).

## 6. Qué NO se pretende demostrar

Este laboratorio NO pretende demostrar:

- que React sea mejor que Angular;
- que Angular sea mejor que React;
- que menos LOC sea mejor;
- que menos dependencias sea automáticamente mejor;
- que menor bundle implique mejor arquitectura;
- que menor build time implique mejor DX;
- que más tests implique mayor calidad.

## 7. Resultado esperado de Fase 5

La Fase 5 deberá terminar con una matriz de evidencia con la siguiente estructura:

| Hipótesis | Métrica        | Resultado                           | Confirmada / Refutada / Parcial           | Evidencia                                     | Limitaciones                |
| --------- | -------------- | ----------------------------------- | ----------------------------------------- | --------------------------------------------- | --------------------------- |
| H1…H8     | métrica medida | valores absolutos, delta, % y rango | veredicto según criterios de la sección 3 | archivo de resultados / sección del documento | limitaciones de la medición |

Cada fila debe seguir la estructura de evidencia de [scorecard.md](./scorecard.md) §5 (métrica, resultado, método, evidencia, interpretación, limitaciones) y las reglas de interpretación de la sección 2. No se añaden recomendaciones finales en este documento.
