# Modelo de dominio — Operations Hub

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Versión:** 1.0
- **Documento relacionado:** [Contrato funcional](./functional-contract.md), [Dataset común](./dataset.md)

Este documento define el **modelo de dominio** de Operations Hub: entidades, campos, tipos, relaciones, estados, transiciones y reglas. Es la referencia única para todas las implementaciones. Las reglas aquí definidas están **congeladas** para el MVP: ningún experimento puede añadir, eliminar ni reinterpretar entidades o reglas sin un ADR y aprobación explícita.

> Notación: se usa notación tipo TypeScript en bloques de código solo como ayuda visual. **No** se crean archivos fuente TypeScript en esta fase.

---

## 1. Convenciones

- **Identificadores:** cadenas deterministas con patrón `<entidad>-NNN` (p. ej. `user-001`, `task-014`). Sin UUIDs aleatorios. Ver [Dataset común](./dataset.md).
- **Timestamps:** valores ISO 8601 fijos incrustados en el dataset (deterministas). Nunca se generan con `Date.now()` para datos del dataset.
- **Enums:** valores en minúscula con guion, definidos en este documento. Los experimentos no pueden añadir valores nuevos.
- **Datos derivados** (informes, contadores de listas) se calculan a partir del dataset; nunca se almacenan como datos propios.

## 2. Vista general de relaciones

```text
Team 1 ────────── N User
Team 1 ────────── N Project
User 1 ────────── N Project   (como owner / propietario)
Project 1 ─────── N Task
User 0..1 ─────── N Task      (como assignee / asignado)
Report (derivado) ── 1 Project | 1 Team | global
```

### Cardinalidades

| Relación                | Cardinalidad | Descripción                                                                                             |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| Team → User             | 1 a N        | Un usuario pertenece a **exactamente un** equipo; un equipo tiene muchos usuarios.                      |
| Team → Project          | 1 a N        | Un proyecto pertenece a **exactamente un** equipo.                                                      |
| User → Project (owner)  | 1 a N        | Un proyecto tiene **exactamente un** propietario; un usuario puede ser propietario de varios proyectos. |
| Project → Task          | 1 a N        | Una tarea pertenece a **exactamente un** proyecto.                                                      |
| User → Task (assignee)  | 0..1 a N     | Una tarea tiene **como máximo un** asignado; el asignado es opcional.                                   |
| Report → Project / Team | N a 1        | Los informes son **vistas derivadas**, no entidades persistidas (ver sección 7).                        |

## 3. Entidades

El dominio se compone de **4 entidades persistidas**: User, Team, Project y Task; de ellas, **solo Project y Task tienen estado**. Report se documenta en esta sección como **concepto derivado** (vista calculada), no como entidad persistida: no tiene `id`, ni estado, ni operaciones CRUD (ver §3.5).

### 3.1 User (usuario)

**Propósito:** persona que pertenece a un equipo y puede ser propietaria de proyectos o asignada a tareas.

```ts
interface User {
  id: string // "user-NNN"
  name: string
  email: string
  teamId: string // referencia a Team (obligatorio)
  createdAt: string // ISO 8601 fijo
  updatedAt: string // ISO 8601 fijo
}
```

| Campo       | Tipo     | Requerido | Reglas                                             |
| ----------- | -------- | --------- | -------------------------------------------------- |
| `id`        | `string` | Sí        | Identificador determinista `user-NNN`.             |
| `name`      | `string` | Sí        | No vacío; longitud ≤ 100.                          |
| `email`     | `string` | Sí        | Formato de email válido; **único** entre usuarios. |
| `teamId`    | `string` | Sí        | Debe referenciar un `Team` existente.              |
| `createdAt` | `string` | Sí        | ISO 8601 fijo.                                     |
| `updatedAt` | `string` | Sí        | ISO 8601 fijo.                                     |

**Estados:** User no tiene estado propio.

### 3.2 Team (equipo)

**Propósito:** grupo de usuarios que trabajan en proyectos.

```ts
interface Team {
  id: string // "team-NNN"
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}
```

| Campo         | Tipo     | Requerido | Reglas                                 |
| ------------- | -------- | --------- | -------------------------------------- |
| `id`          | `string` | Sí        | Identificador determinista `team-NNN`. |
| `name`        | `string` | Sí        | No vacío; longitud ≤ 100.              |
| `description` | `string` | No        | `null` si no hay descripción.          |
| `createdAt`   | `string` | Sí        | ISO 8601 fijo.                         |
| `updatedAt`   | `string` | Sí        | ISO 8601 fijo.                         |

**Estados:** Team no tiene estado propio.

### 3.3 Project (proyecto)

**Propósito:** unidad de trabajo con un propietario, dentro de un equipo, que contiene tareas.

```ts
interface Project {
  id: string // "project-NNN"
  name: string
  description: string | null
  status: 'planned' | 'active' | 'completed'
  ownerId: string // referencia a User (obligatorio)
  teamId: string // referencia a Team (obligatorio)
  createdAt: string
  updatedAt: string
}
```

| Campo         | Tipo     | Requerido | Reglas                                                           |
| ------------- | -------- | --------- | ---------------------------------------------------------------- |
| `id`          | `string` | Sí        | Identificador determinista `project-NNN`.                        |
| `name`        | `string` | Sí        | No vacío; longitud ≤ 100.                                        |
| `description` | `string` | No        | `null` si no hay descripción.                                    |
| `status`      | enum     | Sí        | `planned` \| `active` \| `completed`. Transiciones en sección 6. |
| `ownerId`     | `string` | Sí        | Debe referenciar un `User` existente.                            |
| `teamId`      | `string` | Sí        | Debe referenciar un `Team` existente.                            |
| `createdAt`   | `string` | Sí        | ISO 8601 fijo.                                                   |
| `updatedAt`   | `string` | Sí        | ISO 8601 fijo.                                                   |

**Estados:** `planned`, `active`, `completed` (ver sección 6.1).

### 3.4 Task (tarea)

**Propósito:** unidad de trabajo dentro de un proyecto, con estado, prioridad y asignado opcional.

```ts
interface Task {
  id: string // "task-NNN"
  title: string
  description: string | null
  status: 'todo' | 'in-progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  assigneeId: string | null // referencia opcional a User
  projectId: string // referencia a Project (obligatorio)
  createdAt: string
  updatedAt: string
}
```

| Campo         | Tipo     | Requerido | Reglas                                                                              |
| ------------- | -------- | --------- | ----------------------------------------------------------------------------------- |
| `id`          | `string` | Sí        | Identificador determinista `task-NNN`.                                              |
| `title`       | `string` | Sí        | No vacío; longitud ≤ 120.                                                           |
| `description` | `string` | No        | `null` si no hay descripción.                                                       |
| `status`      | enum     | Sí        | `todo` \| `in-progress` \| `completed` \| `cancelled`. Transiciones en sección 6.2. |
| `priority`    | enum     | Sí        | `low` \| `medium` \| `high`.                                                        |
| `assigneeId`  | `string` | No        | `null` si no está asignada; debe referenciar un `User` existente.                   |
| `projectId`   | `string` | Sí        | Debe referenciar un `Project` existente.                                            |
| `createdAt`   | `string` | Sí        | ISO 8601 fijo.                                                                      |
| `updatedAt`   | `string` | Sí        | ISO 8601 fijo.                                                                      |

**Estados:** `todo`, `in-progress`, `completed`, `cancelled` (ver sección 6.2).

### 3.5 Report (informe) — concepto derivado, no entidad persistida

**Propósito:** resumen numérico derivado del estado del dominio. Un informe **no es una entidad persistida**: es una **vista calculada** sobre los datos en el momento de generarse. No tiene `id`, ni estado, ni operaciones CRUD. Se identifica por su **alcance** y, cuando aplica, su **objetivo**.

```ts
interface Report {
  scope: 'global' | 'project' | 'team'
  targetId: string | null // projectId o teamId según scope; null si scope = "global"
  asOf: string // timestamp de generación (solo informativo)
  metrics: ReportMetrics
}

interface ReportMetrics {
  totalTasks: number
  todoTasks: number
  inProgressTasks: number
  completedTasks: number
  cancelledTasks: number
  completionRate: number | null // ver definición
  // scope = "team": además
  projectsCount?: number
  membersCount?: number
}
```

**Definición de `completionRate`:** porcentaje de tareas completadas sobre tareas «accionables»:

```
completionRate = completedTasks / (totalTasks - cancelledTasks) * 100
```

- Resultado redondeado a **un decimal**.
- Si `totalTasks - cancelledTasks = 0` (no hay tareas accionables, p. ej. proyecto sin tareas), `completionRate = null` y el informe muestra «n/a» junto a los recuentos brutos.

**Alcances:**

| Alcance   | Objetivo    | Métricas                                                                                                   |
| --------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `global`  | —           | Recuentos y `completionRate` sobre **todas** las tareas del dataset.                                       |
| `project` | `projectId` | Recuentos y `completionRate` de las tareas del proyecto.                                                   |
| `team`    | `teamId`    | Recuentos y `completionRate` de las tareas de los proyectos del equipo + `projectsCount` + `membersCount`. |

---

## 4. Estados y transiciones

### 4.1 Project

```
planned ──► active ──► completed
               ▲          │
               └──────────┘   (completed ─► active: reapertura permitida)
```

| Transición              | Permitida | Nota                                        |
| ----------------------- | --------- | ------------------------------------------- |
| `planned` → `active`    | Sí        | Inicio del trabajo.                         |
| `active` → `completed`  | Sí        | Finalización.                               |
| `completed` → `active`  | Sí        | Reapertura, **explicitamente permitida**.   |
| `planned` → `completed` | No        | Debe pasar por `active`.                    |
| `active` → `planned`    | No        | Un proyecto iniciado no vuelve a `planned`. |
| `completed` → `planned` | No        | Solo puede reabrirse a `active`.            |

### 4.2 Task

```
todo ──────► in-progress ──────► completed
  ▲               ▲  │                ▲
  │               │  │                │
  └── reabrir ────┘  └── reabrir ─────┘

cancelar: todo ► cancelled · in-progress ► cancelled
reabrir:  cancelled ► todo · in-progress ► todo · completed ► in-progress
```

| Transición                  | Permitida | Nota                                      |
| --------------------------- | --------- | ----------------------------------------- |
| `todo` → `in-progress`      | Sí        | Comienzo del trabajo.                     |
| `todo` → `cancelled`        | Sí        | Cancelación antes de empezar.             |
| `in-progress` → `todo`      | Sí        | Devuelta al backlog.                      |
| `in-progress` → `completed` | Sí        | Finalización.                             |
| `in-progress` → `cancelled` | Sí        | Cancelación en curso.                     |
| `completed` → `in-progress` | Sí        | Reapertura, **explicitamente permitida**. |
| `cancelled` → `todo`        | Sí        | Reapertura de una tarea cancelada.        |
| `todo` → `completed`        | No        | Debe pasar por `in-progress`.             |
| `completed` → `todo`        | No        | Debe pasar por `in-progress`.             |
| `completed` → `cancelled`   | No        | Una tarea completada no se cancela.       |
| `cancelled` → `in-progress` | No        | Solo puede reabrirse a `todo`.            |
| `cancelled` → `completed`   | No        | Debe reabrirse primero.                   |

**Regla de edición de metadatos:** `title`, `description`, `priority` y `assigneeId` pueden modificarse en **cualquier estado**, incluidos `completed` y `cancelled`. Solo el cambio de `status` está restringido por la máquina de estados.

---

## 5. Reglas de negocio

| ID   | Regla                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| BR-1 | Una tarea debe pertenecer a un proyecto (`projectId` obligatorio).                                                       |
| BR-2 | Un proyecto debe tener un propietario (`ownerId` obligatorio) y pertenecer a un equipo (`teamId` obligatorio).           |
| BR-3 | Un usuario debe pertenecer a exactamente un equipo (`teamId` obligatorio).                                               |
| BR-4 | El asignado de una tarea, si existe, debe referenciar un usuario existente.                                              |
| BR-5 | El propietario de un proyecto debe pertenecer al equipo del proyecto.                                                    |
| BR-6 | Los cambios de estado solo pueden realizarse mediante transiciones válidas (sección 4).                                  |
| BR-7 | Los informes se calculan siempre a partir de los datos actuales; nunca se almacenan ni se cachean como datos de dominio. |

## 6. Reglas de validación (formularios y mutaciones)

Se aplican a las operaciones de creación y edición (ver [Contrato funcional](./functional-contract.md)):

- Campos requeridos no vacíos (tras recortar espacios): `User.name`, `User.email`, `Team.name`, `Project.name`, `Task.title`.
- Longitudes máximas: `name` 100, `title` 120, descripciones 500.
- `email` con formato válido y único.
- Valores de enum dentro de los conjuntos definidos.
- Transición de estado según sección 4 (las transiciones inválidas no se ofrecen en la UI).
- Referencias válidas: `teamId`, `ownerId`, `projectId`, `assigneeId` deben apuntar a registros existentes; el propietario debe pertenecer al equipo del proyecto (BR-5).

---

## 7. Decisiones de diseño

| Decisión                                                                                                         | Justificación                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| El dominio es intencionadamente pequeño (4 entidades persistidas, 2 con estado; Report es un concepto derivado). | Principio 1 (simplicidad); el laboratorio compara arquitecturas, no riqueza de dominio.                           |
| `Report` es una vista derivada, no una entidad persistida.                                                       | Evita una entidad sin operaciones propias; los informes son deterministas dado el dataset.                        |
| Sin paginación en el MVP.                                                                                        | El dataset es pequeño; la paginación añadiría ambigüedad de comparación sin valor (ver dataset y contrato).       |
| Sin fechas de vencimiento (`dueDate`).                                                                           | No lo exige el contrato funcional; se evita complejidad y reglas nuevas (principio 1).                            |
| Asignado de tarea: solo se exige existencia del usuario, no pertenencia al mismo equipo.                         | Alternativa más simple y suficiente; la restricción por equipo se descartó para no añadir validación innecesaria. |
| Reaperturas permitidas (`completed → active` en Project; `completed → in-progress` en Task).                     | Regla explícita y acotada: evita estados terminales irreversibles sin abrir transiciones arbitrarias.             |
| Timestamps fijos en el dataset.                                                                                  | Requisito de determinismo: los timestamps generados en runtime romperían la reproducibilidad.                     |
