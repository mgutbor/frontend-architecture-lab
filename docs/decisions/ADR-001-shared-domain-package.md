# ADR-001 — Paquete de dominio compartido `@operations-hub/domain`

- **Estado:** Accepted
- **Fecha:** 2026-08-20
- **Decisión relacionada:** PROJECT_SPEC §8 (paquete `packages/domain` previsto), MVP-14 (`docs/architecture/mvp.md`).

## Contexto

El laboratorio compara arquitecturas frontend (React Monolith, Angular Monolith) sobre el mismo dominio ficticio, Operations Hub. Para que la comparación sea válida, ambas implementaciones deben consumir exactamente el mismo contrato de dominio y el mismo conjunto de datos determinista. Sin un artefacto compartido, cada experimento reimplementaría tipos, reglas de negocio, máquinas de estado y datos con riesgo de divergencia silenciosa (violando los principios 6 y 8 de PROJECT_SPEC).

## Decisión

Crear el paquete de workspace `packages/domain` (nombre público `@operations-hub/domain`) con las siguientes responsabilidades:

- Tipos del dominio (User, Team, Project, Task) y conceptos derivados (Report).
- Reglas de negocio BR-1…BR-7, incluidas las máquinas de estado de Project y Task.
- Validadores de input puros para formularios (sin librería de validación).
- Cálculo de Reports como funciones puras (vistas derivadas; nunca persistidos).
- Carga y validación del fixture determinista `fixtures/operations-hub-v1.json` (`loadFixture`).

**Qué NO contiene:** React, Angular, componentes UI, routing, estado de UI, servicios de framework, HTTP, backend, persistencia ni lógica de presentación. Es independiente del framework y **sin dependencias runtime**.

El fixture `operations-hub-v1.json` pertenece al dominio de demostración: es un dato de benchmark versionado y congelado, no datos de producción. React y Angular consumirán el paquete (y el fixture) como única fuente de datos.

## Alternativas consideradas

1. **Código de dominio duplicado en cada aplicación** — descartado: garantiza la divergencia entre experimentos y rompe la equivalencia de datos y reglas.
2. **Paquete compartido de propósito general (`@fal/domain`)** — descartado en esta fase: no existe todavía una necesidad de paquete genérico del laboratorio; el prefijo `@operations-hub` refleja que este paquete pertenece al dominio del producto (principio 1: simplicidad).
3. **Librería de validación externa** — descartada: las restricciones son pocas y simples; una librería añadiría dependencia sin justificación (principio 5).

## Justificación

- Materializa el límite de propiedad del código compartido (principio 6): una sola fuente de verdad de dominio.
- El fixture único y versionado garantiza que los experimentos nunca comparen datasets distintos.
- Funciones puras y sin dependencias hacen el paquete trivial de testear y portable entre bundlers (Vite, Angular).
- Cumple el criterio MVP-14 (decisiones de las fases del MVP registradas en ADR).

## Consecuencias

- Los experimentos deben consumir `@operations-hub/domain` y no reimplementar tipos ni reglas.
- Cualquier cambio de dominio (entidad, campo, enum, regla, transición o dataset) requiere ADR y nueva versión del fixture; el dominio está congelado para el MVP.
- La API pública se controla mediante el mapa `exports` del paquete (no se permiten imports profundos).

## Trade-offs

- Un paquete compartido añade una capa de indirección frente a duplicar código; se acepta porque el coste de divergencia entre experimentos es mayor.
- Los consumidores dependen del build del paquete (`dist`); el flujo de desarrollo requiere `pnpm build` (orquestado por Turborepo) antes de consumirlo desde las aplicaciones.
