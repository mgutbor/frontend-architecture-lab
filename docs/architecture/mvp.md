# Definición de MVP

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Documentos relacionados:** [Contrato funcional](./functional-contract.md), [Dataset común](./dataset.md), [Métricas](../experiments/metrics.md), [Scorecard](../comparisons/scorecard.md)

Este documento define qué significa «Frontend Architecture Lab MVP completo» de forma **objetivamente verificable**.

---

## 1. Definición

El MVP del laboratorio comprende estas fases:

| Fase     | Contenido                                                                                   |
| -------- | ------------------------------------------------------------------------------------------- |
| Fase 0   | Fundación del repositorio (tooling, CI, documentación, ADR).                                |
| Fase 0.1 | Endurecimiento de la especificación (dominio, contrato, dataset, métricas, scorecard, MVP). |
| Fase 1   | Operations Hub: dominio y contratos compartidos (paquete de dominio, fixture determinista). |
| Fase 2   | React Monolith.                                                                             |
| Fase 3   | Angular Monolith.                                                                           |

El MVP **no** requiere las fases posteriores (ver sección 3).

## 2. Criterios de aceptación del MVP

El MVP está completo **solo cuando todos** los criterios siguientes se cumplen. Cada criterio es verificable.

### 2.1 Fundación y especificación

| ID    | Criterio                                                           | Verificación                                                                                                                  |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| MVP-1 | La fundación del repositorio es válida.                            | `pnpm check` en verde y CI en verde en `main`.                                                                                |
| MVP-2 | La especificación está completa y aprobada.                        | `PROJECT_SPEC.md` vigente; los documentos de dominio, contrato, dataset, métricas, scorecard y MVP existen y están aprobados. |
| MVP-3 | No quedan marcadores «pendiente de definición» en ámbitos del MVP. | Revisión de `PROJECT_SPEC.md`; solo permanecen los pendientes explícitamente diferidos (IA).                                  |

### 2.2 Dominio y contratos

| ID    | Criterio                                                   | Verificación                                                                                                                                  |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP-4 | El dominio de Operations Hub está documentado y congelado. | `docs/architecture/domain-model.md` aprobado; sin cambios de entidades/reglas sin ADR.                                                        |
| MVP-5 | Existen los contratos comunes.                             | Paquete compartido de dominio con tipos/validación del modelo; `docs/architecture/functional-contract.md` aprobado.                           |
| MVP-6 | Existe el dataset determinista común.                      | Fixture versionado `operations-hub-v1.json` consumido por ambos experimentos; valida el modelo (schema) y las distribuciones de `dataset.md`. |

### 2.3 Implementaciones

| ID     | Criterio                                                           | Verificación                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP-7  | La implementación React satisface el contrato funcional.           | Suite e2e del contrato en verde contra la app React.                                                                                                                          |
| MVP-8  | La implementación Angular satisface el contrato funcional.         | Suite e2e del contrato en verde contra la app Angular.                                                                                                                        |
| MVP-9  | Ambas implementaciones tienen escenarios funcionales equivalentes. | La misma suite e2e (mismos criterios, mismo dataset) se ejecuta contra ambas sin modificaciones específicas de funcionalidad.                                                 |
| MVP-10 | Existen pruebas.                                                   | Pruebas unitarias y e2e en ambas implementaciones, ejecutables con comandos del monorepo.                                                                                     |
| MVP-11 | Se cumplen los requisitos de accesibilidad.                        | Criterios ACC-1…ACC-8 del contrato funcional verificados (automatizado + recorrido de teclado) en ambas implementaciones; Lighthouse Accessibility registrado como evidencia. |

### 2.4 Medición y decisiones

| ID     | Criterio                                           | Verificación                                                                                                                               |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP-12 | Se pueden recoger las mediciones básicas.          | Tamaño de bundle, tiempo de build y tiempo de pruebas recogidos para ambas implementaciones siguiendo `metrics.md`; Lighthouse registrado. |
| MVP-13 | La metodología de comparación está documentada.    | `docs/comparisons/scorecard.md` aprobado; estructura de evidencia definida.                                                                |
| MVP-14 | Las decisiones arquitectónicas están documentadas. | ADR aprobados para las decisiones de las fases del MVP (p. ej. paquete de dominio compartido, versionado del fixture).                     |

## 3. No-goals del MVP

El MVP **no** incluye, y por tanto no son criterios de salida:

- Despliegue en producción
- Autenticación
- Backend real / API remota
- Infraestructura cloud
- Funcionalidad de IA (incluido el AI Architecture Advisor)
- Microfrontends
- Experimentos Web Components y Lit
- Observabilidad avanzada
- Colaboración en tiempo real
- Internacionalización (i18n)

Estas capacidades pertenecen a fases posteriores y **no** deben añadirse durante el MVP (contrato funcional §6).

## 4. Fases posteriores al MVP

| Fase   | Contenido                    | Requiere                                                        |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| Fase 4 | Web Components y Lit         | ADR y aprobación                                                |
| Fase 5 | Microfrontends               | ADR y aprobación                                                |
| Fase 6 | IA / AI Architecture Advisor | ADR y aprobación explícita (roadmap de IA de `PROJECT_SPEC.md`) |

## 5. Condición de salida

El laboratorio declara el MVP **completo** cuando todos los criterios MVP-1…MVP-14 se cumplen y se registran formalmente (documento de cierre del MVP con la verificación de cada criterio). La transición a fases posteriores al MVP requiere aprobación explícita; **no se avanza automáticamente**.
