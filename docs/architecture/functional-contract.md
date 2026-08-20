# Contrato funcional — Operations Hub

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Versión:** 1.0
- **Documentos relacionados:** [Modelo de dominio](./domain-model.md), [Dataset común](./dataset.md)

Este documento define el **contrato funcional** que debe satisfacer cada experimento: las capacidades que la aplicación debe ofrecer y sus **criterios de aceptación**. Es la base de las pruebas e2e y de la comparación entre arquitecturas.

---

## 1. Definición de equivalencia funcional

Dos implementaciones son **funcionalmente equivalentes** cuando satisfacen el mismo contrato funcional: todas las capacidades de este documento existen y son operativas, y todos los criterios de aceptación son verificables y se cumplen.

**No** se exige que las implementaciones compartan:

- árboles de componentes idénticos
- implementación de routing idéntica
- gestión de estado idéntica
- CSS idéntico
- arquitectura interna idéntica
- APIs de framework idénticas

El propósito del laboratorio es permitir diferencias arquitectónicas manteniendo funcionalidad comparable.

## 2. Supuestos transversales

| ID   | Supuesto                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TR-1 | Los datos se sirven de forma **estática** desde el fixture embebido; la aplicación no requiere backend ni red para funcionar.                                                                                                                          |
| TR-2 | Al cargar la aplicación, el estado de datos se inicializa **siempre** desde el dataset canónico (v1). Las mutaciones del usuario (crear, editar, cambiar estado, asignar) son **de sesión**: se aplican a la sesión actual y se descartan al recargar. |
| TR-3 | **Sin paginación:** las listas renderizan el conjunto completo de registros.                                                                                                                                                                           |
| TR-4 | Orden por defecto de las listas: **ascendente por `id`**. Los filtros y búsquedas no alteran este orden salvo que el criterio lo indique.                                                                                                              |
| TR-5 | Navegación persistente entre áreas funcionales (ver NAV).                                                                                                                                                                                              |
| TR-6 | Nivel de referencia de accesibilidad: **WCAG 2.2 AA** (ver sección 6).                                                                                                                                                                                 |
| TR-7 | Los valores numéricos de informes y dashboard son **deterministas** y coinciden con la tabla de valores derivados del dataset (§6 de `dataset.md`).                                                                                                    |

## 3. Áreas funcionales y criterios de aceptación

Los criterios de aceptación son verificables de forma automática (Playwright) y/o manual. Se referencian por ID en las pruebas y en las comparativas.

### 3.1 Navegación (NAV)

| ID    | Criterio de aceptación                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| NAV-1 | Cada área funcional (Dashboard, Projects, Teams, Tasks, Reports, Settings) es alcanzable mediante navegación persistente visible en todas las vistas. |
| NAV-2 | El área activa está indicada visualmente.                                                                                                             |
| NAV-3 | Todos los controles de navegación son operables con teclado y tienen nombre accesible.                                                                |

### 3.2 Projects

**Lista (PRJ-LIST)**

| ID         | Criterio de aceptación                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| PRJ-LIST-1 | La vista muestra los 6 proyectos del dataset.                                           |
| PRJ-LIST-2 | Cada fila muestra nombre, estado, propietario y equipo.                                 |
| PRJ-LIST-3 | Orden por defecto ascendente por `id` (`project-001` primero).                          |
| PRJ-LIST-4 | Cuando no hay resultados (tras buscar o filtrar), se muestra un estado vacío explícito. |

**Búsqueda (PRJ-SEARCH)**

| ID           | Criterio de aceptación                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| PRJ-SEARCH-1 | El campo de búsqueda es enfocable con teclado y tiene etiqueta accesible.                                                       |
| PRJ-SEARCH-2 | La búsqueda filtra por nombre con coincidencia de subcadena **sin distinguir mayúsculas**.                                      |
| PRJ-SEARCH-3 | Los resultados se actualizan conforme se escribe, sin necesidad de enviar un formulario.                                        |
| PRJ-SEARCH-4 | «incident» muestra `project-001`; «report» muestra `project-003`; «zzzz» no muestra ningún proyecto y presenta el estado vacío. |
| PRJ-SEARCH-5 | La búsqueda se combina con el filtro de estado (conjunción AND).                                                                |

**Filtrado (PRJ-FILTER)**

| ID           | Criterio de aceptación                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| PRJ-FILTER-1 | Selector de estado (all / planned / active / completed) operable con teclado. |
| PRJ-FILTER-2 | `active` muestra `project-001`, `project-003`, `project-006`.                 |
| PRJ-FILTER-3 | `completed` muestra `project-002`, `project-005`.                             |
| PRJ-FILTER-4 | `planned` muestra `project-004`.                                              |
| PRJ-FILTER-5 | El filtro se combina con la búsqueda (AND).                                   |

**Detalle (PRJ-VIEW)**

| ID         | Criterio de aceptación                                                                       |
| ---------- | -------------------------------------------------------------------------------------------- |
| PRJ-VIEW-1 | El detalle muestra nombre, descripción, estado, propietario y equipo.                        |
| PRJ-VIEW-2 | El detalle lista las tareas del proyecto con su estado y prioridad.                          |
| PRJ-VIEW-3 | `project-006` muestra un estado vacío explícito en su lista de tareas (proyecto sin tareas). |

**Creación (PRJ-CREATE)**

| ID           | Criterio de aceptación                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRJ-CREATE-1 | El formulario pide: `name` (requerido), `description` (opcional), `team` (select requerido), `owner` (select requerido, limitado a los usuarios del equipo seleccionado). |
| PRJ-CREATE-2 | Los errores de validación se muestran inline (nombre vacío, selecciones pendientes).                                                                                      |
| PRJ-CREATE-3 | Al enviar con datos válidos, el nuevo proyecto aparece en la lista de proyectos con el siguiente `id` del patrón (`project-007`).                                         |
| PRJ-CREATE-4 | No se puede crear un proyecto sin nombre.                                                                                                                                 |

**Edición (PRJ-EDIT)**

| ID         | Criterio de aceptación                                                                      |
| ---------- | ------------------------------------------------------------------------------------------- |
| PRJ-EDIT-1 | Permite editar `name`, `description` y `status`.                                            |
| PRJ-EDIT-2 | Los cambios se reflejan en la lista y en el detalle.                                        |
| PRJ-EDIT-3 | Solo se ofrecen transiciones de estado válidas (p. ej. no se ofrece `completed → planned`). |
| PRJ-EDIT-4 | La validación de edición es la misma que la de creación.                                    |

### 3.3 Teams

| ID           | Criterio de aceptación                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| TEA-LIST-1   | La vista lista los 3 equipos con nombre, número de miembros y número de proyectos (valores derivados).               |
| TEA-LIST-2   | Los valores coinciden con el dataset: `team-001` (3 miembros, 2 proyectos), `team-002` (3, 2), `team-003` (2, 2).    |
| TEA-VIEW-1   | El detalle de un equipo muestra sus miembros y sus proyectos.                                                        |
| TEA-ASSIGN-1 | Permite añadir un miembro seleccionándolo de la lista de usuarios existentes.                                        |
| TEA-ASSIGN-2 | Permite quitar un miembro del equipo.                                                                                |
| TEA-ASSIGN-3 | Un usuario pertenece a **exactamente un** equipo: al asignarlo a otro equipo, deja de pertenecer al anterior (BR-3). |
| TEA-ASSIGN-4 | Los contadores de miembros se actualizan tras la asignación.                                                         |
| TEA-ASSIGN-5 | La asignación de miembros es operable con teclado.                                                                   |

### 3.4 Tasks

**Lista (TSK-LIST)**

| ID         | Criterio de aceptación                                                                    |
| ---------- | ----------------------------------------------------------------------------------------- |
| TSK-LIST-1 | La vista lista las 30 tareas con título, proyecto, estado, prioridad y asignado.          |
| TSK-LIST-2 | Filtros de **estado** y **prioridad**, combinables entre sí y con la búsqueda por título. |
| TSK-LIST-3 | Un conjunto de filtros sin coincidencias muestra un estado vacío explícito.               |
| TSK-LIST-4 | Las tareas sin asignado se representan explícitamente (p. ej. «Sin asignar»).             |

**Creación (TSK-CREATE)**

| ID           | Criterio de aceptación                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TSK-CREATE-1 | El formulario pide: `title` (requerido), `project` (select requerido), `priority` (default `medium`), `assignee` (opcional) y `description` (opcional). |
| TSK-CREATE-2 | Los errores de validación se muestran inline.                                                                                                           |
| TSK-CREATE-3 | Al crear, la tarea aparece en la lista de tareas y en el detalle de su proyecto.                                                                        |

**Edición (TSK-EDIT)**

| ID         | Criterio de aceptación                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TSK-EDIT-1 | Permite editar `title`, `description`, `priority` y `assignee` en **cualquier** estado (incluidos `completed` y `cancelled`). |
| TSK-EDIT-2 | Los cambios se reflejan en las vistas que muestran la tarea.                                                                  |

**Cambio de estado (TSK-STATUS)**

| ID           | Criterio de aceptación                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| TSK-STATUS-1 | Las transiciones válidas de la máquina de estados están disponibles en la UI (p. ej. `todo → in-progress`, `in-progress → completed`). |
| TSK-STATUS-2 | Las transiciones inválidas **no** se ofrecen (p. ej. no `todo → completed`, no `completed → todo`).                                    |
| TSK-STATUS-3 | Realizar una transición válida actualiza el estado de la tarea y los valores derivados (informes, contadores).                         |

**Asignación (TSK-ASSIGN)**

| ID           | Criterio de aceptación                                   |
| ------------ | -------------------------------------------------------- |
| TSK-ASSIGN-1 | Permite asignar y desasignar el `assignee` de una tarea. |
| TSK-ASSIGN-2 | El selector de asignado lista los usuarios existentes.   |

### 3.5 Reports

| ID            | Criterio de aceptación                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| RPT-SUMMARY-1 | La vista de resumen global muestra: 30 tareas (12 completed, 7 in-progress, 9 todo, 2 cancelled) y `completionRate` 42.9%.         |
| RPT-SUMMARY-2 | La vista de resumen global muestra 6 proyectos y 3 equipos.                                                                        |
| RPT-PROJECT-1 | Al seleccionar un proyecto se muestran sus métricas según la tabla de valores derivados (`project-002`: 100%; `project-006`: n/a). |
| RPT-TASK-1    | La vista de métricas de tareas muestra la distribución por estado y por prioridad, con filtro opcional por proyecto.               |
| RPT-TASK-2    | Los valores coinciden con el dataset (p. ej. prioridad `high` = 10 en el alcance global).                                          |

### 3.6 Dashboard

| ID    | Criterio de aceptación                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DSH-1 | El dashboard muestra el resumen operativo: proyectos por estado (3 active, 2 completed, 1 planned), tareas por estado y `completionRate` global 42.9%. |
| DSH-2 | Los valores son deterministas y coherentes con los de Reports.                                                                                         |

### 3.7 Settings

| ID    | Criterio de aceptación                                                                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| SET-1 | Existe una preferencia «Mostrar tareas completadas en las listas de tareas» (booleana, activada por defecto).          |
| SET-2 | Desactivarla oculta las tareas `completed` de las listas de tareas de forma inmediata.                                 |
| SET-3 | La preferencia persiste al navegar entre vistas dentro de la misma sesión.                                             |
| SET-4 | Al recargar la aplicación, la preferencia vuelve al valor por defecto junto con el estado canónico del dataset (TR-2). |

---

## 4. Criterios de accesibilidad (ACC)

Se aplican a todas las vistas y controles. Referencia: WCAG 2.2 AA.

| ID    | Criterio de aceptación                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-1 | Todo el contenido interactivo es operable con teclado (sin trampas de foco).                                                                 |
| ACC-2 | El foco de teclado es visible en todo momento.                                                                                               |
| ACC-3 | Todos los campos de formulario tienen etiqueta asociada.                                                                                     |
| ACC-4 | Los mensajes de error y validación están asociados a su campo y se anuncian a tecnologías de asistencia.                                     |
| ACC-5 | La navegación usa puntos de referencia semánticos (header, nav, main).                                                                       |
| ACC-6 | El contraste de texto cumple WCAG 2.2 AA (4.5:1 texto normal, 3:1 texto grande).                                                             |
| ACC-7 | El orden de tabulación sigue un orden lógico de lectura.                                                                                     |
| ACC-8 | Los cambios de estado y resultados de búsqueda/filtro se comunican a tecnologías de asistencia (p. ej. `aria-live` en resultados dinámicos). |

## 5. Verificación

- Cada criterio de aceptación se traduce en una **prueba e2e** (Playwright) que se ejecuta contra cada experimento con el mismo dataset.
- Las pruebas usan los IDs de este documento como referencia (`PRJ-SEARCH-4`, `TSK-STATUS-2`, …).
- Accesibilidad: auditoría automatizada (axe) sobre las vistas principales + verificación manual del recorrido de teclado.
- Cualquier criterio que un experimento no pueda cumplir debe documentarse como **desviación** en la documentación del experimento, con justificación, y no puede atribuirse a datos distintos.

## 6. Fuera del alcance del contrato (MVP)

No forman parte del contrato funcional del MVP: autenticación, backend real, sincronización, notificaciones, colaboración en tiempo real, internacionalización (i18n) ni soporte offline. Los experimentos **no** deben añadir estas capacidades en el MVP.
