# Experimentos

Este directorio contiene la documentación de cada experimento de arquitectura frontend y de la metodología de medición del laboratorio.

> Reglas: documentación en español; todos los experimentos deben implementar requisitos funcionales equivalentes del dominio Operations Hub.

## Documentos

| Documento                                  | Contenido                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| [metrics.md](./metrics.md)                 | **Metodología de métricas** (aprobada en Fase 0.1): qué se mide, cómo, entorno de referencia y reglas de captura/reporte.            |
| [baseline-phase2.md](./baseline-phase2.md) | **Baseline de Fase 2**: primer ciclo de medición (React, Angular y Domain) con resultados, limitaciones, interpretación y evidencia. |
| [results/](./results/)                     | Evidencia cruda de los ciclos de medición (JSON generado por `pnpm measure`).                                                        |

## Experimentos planificados

- React Monolith (implementado: Fase 2; **contrato funcional completo: Fase 4**)
- Angular Monolith (implementado: Fase 2; contrato completo en fases posteriores)
- Web Components
- Lit
- Microfrontends

Cada experimento documentará, como mínimo: alcance funcional, decisiones específicas del enfoque, metodología de medición y limitaciones.
