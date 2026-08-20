# Metodología de scorecard

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Documentos relacionados:** [Métricas](../experiments/metrics.md), [Contrato funcional](../architecture/functional-contract.md)

Este documento define cómo se construyen los **scorecards** de las comparativas. Su objetivo es impedir puntuaciones arbitrarias («React = 91, Angular = 87») sin evidencia: toda puntuación debe ser trazable a una fuente, una rúbrica y una evidencia.

---

## 1. Escala

Se usa una escala **1–5** con anclas descriptivas:

| Puntuación | Significado               |
| ---------- | ------------------------- |
| 1          | Problemas significativos  |
| 2          | Por debajo de lo esperado |
| 3          | Aceptable                 |
| 4          | Sólido                    |
| 5          | Excelente                 |

**Por qué 1–5:** es simple, de granularidad suficiente para decisiones arquitectónicas y evita la falsa precisión de escalas 0–10 o 0–100, que sugieren una exactitud que la medición no tiene. Cinco anclas con descripción reducen la dispersión entre evaluadores.

## 2. Separación estricta de categorías

El scorecard tiene **dos secciones claramente separadas**, nunca mezcladas:

| Sección                       | Contenido                                                                                                   | Naturaleza                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- |
| **A. Mediciones objetivas**   | Resultados de las métricas de `metrics.md` §3 (bundle, builds, pruebas, Lighthouse, dependencias, paquetes) | Medición reproducible      |
| **B. Evaluación cualitativa** | Puntuaciones por rúbrica de los criterios de `metrics.md` §4 (mantenibilidad, DX, autonomía, complejidad)   | Juicio experto documentado |

Regla: **nunca se presenta un juicio cualitativo como medición objetiva**, ni viceversa. Una fila de la sección B siempre se etiqueta como evaluación por rúbrica; una fila de la sección A siempre va acompañada de su método y su evidencia.

## 3. Estructura de cada fila del scorecard

Cada criterio puntuado (sección B) o medido (sección A) se documenta con:

| Campo                    | Descripción                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Criterio                 | Qué se evalúa (p. ej. Mantenibilidad — límites de dependencia).                                                                            |
| Fuente de medición       | De dónde sale el dato: métrica objetiva (indicar cuál), revisión de código, documento del experimento, pruebas.                            |
| Rúbrica aplicada         | Para la sección B: ancla 1–5 con justificación de la puntuación elegida. Para la sección A: no aplica rúbrica, se reporta el valor medido. |
| Confianza / limitaciones | Nivel de confianza de la puntuación y limitaciones conocidas.                                                                              |
| Evidencia                | Enlace o referencia concreta: archivo, log, captura, commit, salida de build.                                                              |

## 4. Ponderación

**Decisión: no se usa ponderación ni nota global.**

Justificación:

- El propósito del laboratorio es el **entendimiento arquitectónico**, no la gamificación.
- Cualquier ponderación sería arbitraria y ocultaría trade-offs en un número único.
- Una nota global (p. ej. «React 8.2/10») no comunica _por qué_ una arquitectura conviene para un contexto concreto.

En su lugar, cada comparativa presenta los criterios **por separado**, con sus evidencias, y una sección de **interpretación** que discute los trade-offs. Si en el futuro se necesitara agregar, se hará mediante ADR, con pesos definidos, justificados y documentados.

## 5. Estructura de evidencia

Todo documento de comparación se construye sobre esta estructura por métrica o criterio:

```text
Métrica / Criterio: <nombre>
Resultado:        <valor medido o puntuación>
Método:           <procedimiento seguido, enlace a metrics.md>
Evidencia:        <archivo, log, captura, commit>
Interpretación:   <qué significa para la comparación>
Limitaciones:     <limitaciones explícitas>
```

## 6. Plantilla de documento de comparación

Los documentos de comparación (en `docs/comparisons/`) siguen esta estructura:

1. **Contexto** — qué se compara, qué versión del dataset y de los experimentos, fecha.
2. **Entorno de medición** — entorno de referencia completo (ver `metrics.md` §2).
3. **Contrato funcional cumplido** — lista de capacidades verificadas y desviaciones documentadas.
4. **Sección A — Mediciones objetivas** — tabla con la estructura de evidencia por métrica.
5. **Sección B — Evaluación cualitativa** — tabla de scorecard 1–5 con fuente, rúbrica, confianza y evidencia.
6. **Interpretación** — discusión de trade-offs; sin nota global.
7. **Limitaciones de la comparación** — qué no se pudo mantener constante.
8. **Conclusiones** — hallazgos accionables y recomendaciones para decisiones.

## 7. Reglas de uso

1. Un scorecard solo se publica si cada fila tiene **evidencia** trazable.
2. Las puntuaciones de la sección B se asignan **después** de completar la sección A, para no contaminar las mediciones con juicios.
3. Si dos evaluadores difieren más de 1 punto en un criterio, se resuelve documentando la discrepancia; no se promedia en silencio.
4. Los criterios y la rúbrica se revisan con ADR si cambian; los scorecards no se reescriben retroactivamente.
