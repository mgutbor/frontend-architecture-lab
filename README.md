# Frontend Architecture Lab

Laboratorio de arquitecturas frontend para comparar distintos enfoques arquitectónicos utilizando el mismo producto ficticio: **Operations Hub**.

> **Estado actual: Fase 0 — Fundación del repositorio.**
> Este repositorio todavía **no contiene ninguna implementación de aplicación** (ni React, ni Angular, ni Lit, ni Web Components, ni microfrontends). Solo contiene la fundación del repositorio y las herramientas base que permitirán construir los experimentos en fases posteriores.

## ¿Qué es Frontend Architecture Lab?

Frontend Architecture Lab es un laboratorio arquitectónico cuyo objetivo es comparar, de forma objetiva y reproducible, distintas arquitecturas frontend. Cada arquitectura se implementa como un **experimento** que resuelve los **mismos requisitos funcionales** sobre el mismo producto ficticio, de modo que las diferencias observadas sean atribuibles a la arquitectura y no al dominio.

## ¿Por qué existe este proyecto?

Las decisiones de arquitectura frontend suelen tomarse con poca evidencia. Este proyecto existe para:

- Sustituir **suposiciones por evidencia** mediante experimentos comparables.
- Documentar **decisiones arquitectónicas con contexto** y sus trade-offs.
- Establecer una metodología de medición clara para cada comparativa.
- Servir como referencia reutilizable para futuros proyectos.

## El dominio: Operations Hub

**Operations Hub** es el producto ficticio que servirá de dominio para todos los experimentos. El dominio se definirá y congelará en una fase posterior, pero los principios ya establecidos son:

- Todos los experimentos deben implementar **requisitos funcionales equivalentes**.
- La **accesibilidad es un requisito de primera clase**, no un añadido opcional.
- Ningún experimento puede introducir funcionalidad de dominio que no esté definida en la especificación del producto.

## Experimentos futuros

Los experimentos planificados son:

| Experimento      | Descripción                                        |
| ---------------- | -------------------------------------------------- |
| React Monolith   | Aplicación monolítica con React + Vite.            |
| Angular Monolith | Aplicación monolítica con Angular.                 |
| Web Components   | Componentes web nativos.                           |
| Lit              | Componentes web con Lit.                           |
| Microfrontends   | Descomposición de la aplicación en microfrontends. |

Cada experimento se documentará en `docs/experiments/` y las comparativas en `docs/comparisons/`.

## Fase actual

**Fase 0 — Fundación del repositorio** (fase en curso).

Entregables de esta fase:

- Estructura del monorepo (pnpm + Turborepo).
- Configuración base de TypeScript, ESLint, Prettier y EditorConfig.
- Configuración de Git y del editor.
- Scripts básicos de desarrollo y validación.
- Workflow de CI (GitHub Actions).
- Fundación de documentación: README, CONTRIBUTING, PROJECT_SPEC, marco de ADR.

**No forma parte de esta fase** ninguna implementación de aplicación, dominio de negocio, UI, backend, API, base de datos o funcionalidad de IA.

## Stack tecnológico

| Herramienta    | Propósito                                | Estado en Fase 0                |
| -------------- | ---------------------------------------- | ------------------------------- |
| TypeScript     | Lenguaje tipado (configuración estricta) | Configuración base compartida   |
| pnpm           | Gestor de paquetes                       | Activo                          |
| Turborepo      | Orquestador de tareas del monorepo       | Configuración mínima            |
| ESLint         | Linting                                  | Activo (configuración plana)    |
| Prettier       | Formateo                                 | Activo                          |
| Vitest         | Testing unitario                         | Previsto para fases posteriores |
| Playwright     | Testing e2e                              | Previsto para fases posteriores |
| Storybook      | Desarrollo de componentes                | Previsto para fases posteriores |
| GitHub Actions | CI                                       | Workflow de validación activo   |
| Docker         | Entornos reproducibles                   | Previsto para fases posteriores |

## Estructura del repositorio

```text
frontend-architecture-lab/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── apps/                  # Aplicaciones (experimentos) en fases posteriores
├── packages/              # Paquetes compartidos en fases posteriores
├── docs/
│   ├── architecture/      # Documentación de arquitectura
│   ├── decisions/         # ADRs (Architecture Decision Records)
│   ├── experiments/       # Documentación de cada experimento
│   └── comparisons/       # Comparativas entre experimentos
├── scripts/               # Scripts de apoyo del repositorio
├── .editorconfig
├── .gitignore
├── .prettierignore
├── .prettierrc
├── CONTRIBUTING.md
├── LICENSE
├── PROJECT_SPEC.md        # Fuente de verdad técnica del proyecto
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── turbo.json
```

## Requisitos previos

- **Node.js** ≥ 20 (se recomienda una versión LTS).
- **pnpm** 10.x (la versión exacta está fijada en el campo `packageManager` de `package.json`).

El resto de dependencias se instalan con pnpm.

## Instalación

```bash
pnpm install
```

## Validación

Todos los comandos deben ejecutarse correctamente en la fase actual:

| Comando             | Descripción                                           |
| ------------------- | ----------------------------------------------------- |
| `pnpm lint`         | Ejecuta ESLint sobre los archivos del repositorio.    |
| `pnpm format`       | Formatea el repositorio con Prettier.                 |
| `pnpm format:check` | Verifica el formato sin modificar archivos.           |
| `pnpm typecheck`    | Ejecuta la comprobación de tipos de TypeScript.       |
| `pnpm test`         | Ejecuta las pruebas (aún no hay suites en Fase 0).    |
| `pnpm build`        | Compila los paquetes (aún no hay paquetes en Fase 0). |
| `pnpm check`        | Ejecuta toda la cadena de validación.                 |

## Principios de desarrollo

1. Simplicidad sobre abstracción innecesaria.
2. Evidencia sobre suposiciones.
3. Las decisiones de arquitectura deben tener contexto.
4. Los trade-offs deben documentarse.
5. Evitar tecnología por la tecnología misma.
6. El código compartido debe tener un límite de propiedad claro.
7. La duplicación pequeña puede ser preferible al acoplamiento innecesario.
8. Todos los experimentos deben usar requisitos funcionales equivalentes.
9. La accesibilidad es un requisito de primera clase.
10. Las mediciones deben explicar su metodología y sus limitaciones.

Ver el detalle completo en [PROJECT_SPEC.md](./PROJECT_SPEC.md).

## Reglas de idioma

- **Código y configuración**: en inglés (nombres de archivos, directorios, paquetes, variables, scripts, mensajes de commit, comentarios).
- **Documentación**: en español (README, CONTRIBUTING, PROJECT_SPEC, ADRs, documentación de arquitectura y de experimentos).

## Documentación arquitectónica

Las decisiones arquitectónicas se registran como **ADR** (Architecture Decision Records) en `docs/decisions/`. Consulta [docs/decisions/README.md](./docs/decisions/README.md) para conocer el proceso.

## Licencia

MIT — ver [LICENSE](./LICENSE).
