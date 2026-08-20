# Documentación de arquitectura

Este directorio contiene la documentación de arquitectura del proyecto: principios, especificaciones de dominio y análisis por experimento.

> Regla: toda la documentación de este directorio se escribe en español.

## Documentos

| Documento                                              | Contenido                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [domain-model.md](./domain-model.md)                   | Modelo de dominio de Operations Hub: entidades, campos, relaciones, estados, transiciones y reglas BR-1…BR-7.                       |
| [dataset.md](./dataset.md)                             | Dataset determinista común (`operations-hub-v1.json`): registros, escenarios y valores derivados esperados.                         |
| [functional-contract.md](./functional-contract.md)     | Contrato funcional equivalente: capacidades, criterios de aceptación y definición de equivalencia funcional.                        |
| [mvp.md](./mvp.md)                                     | Definición del MVP, criterios de aceptación (MVP-1…MVP-14) y no-goals.                                                              |
| [frontend-architecture.md](./frontend-architecture.md) | Arquitectura de la Fase 2: qué pertenece al dominio, a React y a Angular, flujo del dato, estado y sustitución del fixture por API. |
