# Dataset común — Operations Hub

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Versión del dataset:** v1 (congelada para el MVP)
- **Documento relacionado:** [Modelo de dominio](./domain-model.md), [Contrato funcional](./functional-contract.md)

Este documento especifica el **dataset común y determinista** que deben consumir todos los experimentos. Garantiza que la comparación nunca compare conjuntos de datos distintos: mismos registros, mismas relaciones, mismo estado inicial.

> En esta fase **no** se crea el archivo de datos. El fixture real se materializa en la Fase 1 a partir de esta especificación.

---

## 1. Principios del dataset

1. **Determinista:** mismos identificadores, mismos valores, mismas relaciones en cada carga.
2. **Versionado:** el fixture tiene una versión; cualquier cambio incrementa la versión y requiere ADR.
3. **Reproducible:** los timestamps son valores fijos; nada se genera con el reloj del sistema.
4. **Independiente del framework:** el fixture es un único archivo JSON consumible por cualquier implementación.
5. **Pequeño para desarrollo, suficiente para ejercitar:** búsqueda, filtrado, relaciones y renderizado.
6. **Único artefacto:** existe **un solo** archivo de fixture canónico; todos los experimentos cargan ese mismo artefacto (o una copia idéntica en build time).

## 2. Tamaño del dataset

| Concepto | Cantidad                                                              |
| -------- | --------------------------------------------------------------------- |
| Users    | 8                                                                     |
| Teams    | 3                                                                     |
| Projects | 6                                                                     |
| Tasks    | 30                                                                    |
| Reports  | 0 (los informes son **vistas derivadas**, ver modelo de dominio §3.5) |

## 3. Identificadores

Patrón determinista por entidad, sin UUIDs:

| Entidad | Patrón        | Rango                         |
| ------- | ------------- | ----------------------------- |
| User    | `user-NNN`    | `user-001` … `user-008`       |
| Team    | `team-NNN`    | `team-001` … `team-003`       |
| Project | `project-NNN` | `project-001` … `project-006` |
| Task    | `task-NNN`    | `task-001` … `task-030`       |

## 4. Enumeración completa

### 4.1 Teams

| id         | name             | description                          |
| ---------- | ---------------- | ------------------------------------ |
| `team-001` | Core Platform    | Plataforma y sistemas centrales.     |
| `team-002` | Data Insights    | Análisis, informes y datos.          |
| `team-003` | Customer Success | Incorporación y soporte de clientes. |

### 4.2 Users

| id         | name              | email                                | teamId     |
| ---------- | ----------------- | ------------------------------------ | ---------- |
| `user-001` | Ada Lovelace      | ada.lovelace@operations-hub.dev      | `team-001` |
| `user-002` | Alan Turing       | alan.turing@operations-hub.dev       | `team-001` |
| `user-003` | Grace Hopper      | grace.hopper@operations-hub.dev      | `team-001` |
| `user-004` | Katherine Johnson | katherine.johnson@operations-hub.dev | `team-002` |
| `user-005` | Margaret Hamilton | margaret.hamilton@operations-hub.dev | `team-002` |
| `user-006` | Edsger Dijkstra   | edsger.dijkstra@operations-hub.dev   | `team-002` |
| `user-007` | Barbara Liskov    | barbara.liskov@operations-hub.dev    | `team-003` |
| `user-008` | Linus Torvalds    | linus.torvalds@operations-hub.dev    | `team-003` |

### 4.3 Projects

| id            | name                     | status      | ownerId    | teamId     |
| ------------- | ------------------------ | ----------- | ---------- | ---------- |
| `project-001` | Incident Response Portal | `active`    | `user-001` | `team-001` |
| `project-002` | Alerting Pipeline        | `completed` | `user-002` | `team-001` |
| `project-003` | Reporting Dashboard      | `active`    | `user-004` | `team-002` |
| `project-004` | Data Ingest Service      | `planned`   | `user-005` | `team-002` |
| `project-005` | Customer Onboarding      | `completed` | `user-007` | `team-003` |
| `project-006` | Legacy Migration         | `active`    | `user-008` | `team-003` |

### 4.4 Tasks

| id         | title                           | projectId     | status        | priority | assigneeId |
| ---------- | ------------------------------- | ------------- | ------------- | -------- | ---------- |
| `task-001` | Define incident severity levels | `project-001` | `completed`   | `high`   | `user-001` |
| `task-002` | Build incident intake form      | `project-001` | `completed`   | `high`   | `user-001` |
| `task-003` | Implement status timeline       | `project-001` | `in-progress` | `high`   | `user-002` |
| `task-004` | Add SLA counters                | `project-001` | `in-progress` | `medium` | `user-003` |
| `task-005` | Create escalation rules         | `project-001` | `todo`        | `medium` | `user-002` |
| `task-006` | Design notification templates   | `project-001` | `todo`        | `low`    | `user-003` |
| `task-007` | Write incident documentation    | `project-001` | `todo`        | `low`    | —          |
| `task-008` | Archive resolved incidents      | `project-001` | `cancelled`   | `low`    | `user-001` |
| `task-009` | Set up alert routing            | `project-002` | `completed`   | `high`   | `user-002` |
| `task-010` | Configure alert thresholds      | `project-002` | `completed`   | `medium` | `user-002` |
| `task-011` | Build alert deduplication       | `project-002` | `completed`   | `high`   | `user-003` |
| `task-012` | Add silence windows             | `project-002` | `completed`   | `medium` | `user-001` |
| `task-013` | Export alert history            | `project-002` | `completed`   | `low`    | `user-003` |
| `task-014` | Migrate alert storage           | `project-002` | `completed`   | `medium` | `user-001` |
| `task-015` | Design report layouts           | `project-003` | `completed`   | `high`   | `user-004` |
| `task-016` | Build task metrics widget       | `project-003` | `in-progress` | `high`   | `user-005` |
| `task-017` | Build project metrics widget    | `project-003` | `in-progress` | `medium` | `user-004` |
| `task-018` | Add completion rate card        | `project-003` | `todo`        | `medium` | `user-006` |
| `task-019` | Style report tables             | `project-003` | `todo`        | `low`    | `user-005` |
| `task-020` | Export report as PDF            | `project-003` | `todo`        | `low`    | —          |
| `task-021` | Define ingestion schema         | `project-004` | `todo`        | `high`   | `user-005` |
| `task-022` | Build ingestion worker          | `project-004` | `todo`        | `high`   | `user-006` |
| `task-023` | Add retry logic                 | `project-004` | `in-progress` | `medium` | `user-006` |
| `task-024` | Write ingestion tests           | `project-004` | `cancelled`   | `medium` | `user-004` |
| `task-025` | Create onboarding checklist     | `project-005` | `completed`   | `high`   | `user-007` |
| `task-026` | Build welcome email             | `project-005` | `completed`   | `medium` | `user-007` |
| `task-027` | Add guided tour                 | `project-005` | `completed`   | `low`    | `user-008` |
| `task-028` | Collect customer feedback       | `project-005` | `in-progress` | `medium` | `user-008` |
| `task-029` | Build support handoff           | `project-005` | `in-progress` | `medium` | `user-007` |
| `task-030` | Measure activation rate         | `project-005` | `todo`        | `low`    | `user-008` |

### 4.5 Distribuciones resultantes

| Dimensión         | Valores                                               | Totales |
| ----------------- | ----------------------------------------------------- | ------- |
| Estado (Task)     | completed 12 · in-progress 7 · todo 9 · cancelled 2   | 30      |
| Prioridad (Task)  | high 10 · medium 12 · low 8                           | 30      |
| Asignación (Task) | asignadas 28 · sin asignar 2 (`task-007`, `task-020`) | 30      |
| Estado (Project)  | active 3 · completed 2 · planned 1                    | 6       |

### 4.6 Timestamps

`createdAt` y `updatedAt` son **valores ISO 8601 fijos** incrustados en el fixture (nunca generados en runtime). Reglas de coherencia:

- `createdAt(task) ≥ createdAt(project)` para toda tarea y su proyecto.
- `updatedAt ≥ createdAt` para todo registro.
- Los valores concretos se fijan una sola vez al crear el fixture y quedan congelados en la versión v1.

---

## 5. Escenarios de datos soportados

Cada escenario existe para ejercitar un criterio del contrato funcional o una medición. No se añaden escenarios sin uso.

| Escenario                         | Dónde                                                                                                      | Ejercita                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Proyecto con muchas tareas        | `project-001` (8 tareas, 4 estados, 3 prioridades)                                                         | Renderizado de listas, filtrado, informes de proyecto. |
| Proyecto sin tareas               | `project-006` (0 tareas)                                                                                   | Estado vacío, `completionRate = n/a`.                  |
| Equipo con varios miembros        | `team-001` (3), `team-002` (3), `team-003` (2)                                                             | Lista y detalle de equipos, asignación de miembros.    |
| Tarea con asignado                | 28 de 30 tareas                                                                                            | Detalle de tarea, contadores.                          |
| Tarea sin asignar                 | `task-007`, `task-020`                                                                                     | Asignación/desasignación, representación de opcional.  |
| Tarea completada                  | 12 tareas (todas las de `project-002`)                                                                     | Transición a `completed`, informes.                    |
| Tarea en curso                    | 7 `in-progress` + 9 `todo`                                                                                 | Transiciones activas, filtros de estado.               |
| Tarea cancelada                   | `task-008`, `task-024`                                                                                     | Estado `cancelled`, `completionRate`.                  |
| Resultado de búsqueda vacío       | término sin coincidencias (p. ej. «zzzz»)                                                                  | Representación explícita de vacío.                     |
| Búsqueda con resultados concretos | «incident» → `project-001` (+ `task-008`); «report» → `project-003` (+ `task-015`, `task-019`, `task-020`) | Búsqueda por nombre/título estable y predecible.       |
| Datos suficientes para filtrado   | estados y prioridades distribuidos; `team-001` con un proyecto `active` y uno `completed`                  | Filtros por estado/prioridad combinables con búsqueda. |

## 6. Valores derivados esperados (informes)

Estos valores son **deterministas** y sirven como expectativas de los criterios de aceptación de Reports y Dashboard.

| Alcance       | totalTasks | completed | in-progress | todo | cancelled | completionRate                |
| ------------- | ---------- | --------- | ----------- | ---- | --------- | ----------------------------- |
| `global`      | 30         | 12        | 7           | 9    | 2         | 42.9%                         |
| `project-001` | 8          | 2         | 2           | 3    | 1         | 28.6%                         |
| `project-002` | 6          | 6         | 0           | 0    | 0         | 100%                          |
| `project-003` | 6          | 1         | 2           | 3    | 0         | 16.7%                         |
| `project-004` | 4          | 0         | 1           | 2    | 1         | 0%                            |
| `project-005` | 6          | 3         | 2           | 1    | 0         | 50%                           |
| `project-006` | 0          | 0         | 0           | 0    | 0         | n/a                           |
| `team-001`    | 14         | 8         | 2           | 3    | 1         | 61.5% (projects 2, members 3) |
| `team-002`    | 10         | 1         | 3           | 5    | 1         | 11.1% (projects 2, members 3) |
| `team-003`    | 6          | 3         | 2           | 1    | 0         | 50% (projects 2, members 2)   |

## 7. Consistencia entre experimentos

1. **Mismo artefacto:** todos los experimentos consumen el fixture canónico `packages/domain/fixtures/operations-hub-v1.json` (creado en Fase 1).
2. **Mismo estado inicial:** al cargar la aplicación, el estado de datos se inicializa **siempre** desde el fixture; las mutaciones del usuario son de **sesión** (ver contrato funcional §2) y se descartan al recargar.
3. **Mismo orden:** el orden por defecto de las listas es **ascendente por `id`** (p. ej. `project-001` antes que `project-002`). Los filtros y búsquedas no cambian este orden salvo que el contrato lo defina.
4. **Sin paginación:** las listas renderizan el conjunto completo (dataset pequeño, decisión explícita).
5. **Versionado:** el nombre del archivo incrusta la versión (`operations-hub-v1.json`). Cambiar cualquier registro, relación o regla del dataset **incrementa la versión** y requiere ADR; las comparativas fijan la versión que usan.

## 8. Formato del fixture (Fase 1)

- **Formato:** JSON único, schema-validado, independiente del framework.
- **Ubicación prevista:** `packages/domain/fixtures/operations-hub-v1.json`.
- **Contenido:** los cinco arreglos (`users`, `teams`, `projects`, `tasks`) con los campos del modelo de dominio, más `datasetVersion: "v1"`.
- **Validación:** el fixture debe cumplir el modelo de dominio (tipos, enums, relaciones, reglas BR-1…BR-7) y las distribuciones de la sección 4.5.
