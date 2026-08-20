# ADR-002 — Gestión de estado en React y Angular (Fase 2)

- **Estado:** Accepted
- **Fecha:** 2026-08-20
- **Decisión relacionada:** `docs/architecture/frontend-architecture.md` §9, contrato funcional TSK-STATUS (`docs/architecture/functional-contract.md`).

## Contexto

La Fase 2 crea dos aplicaciones (React Monolith y Angular Monolith) que consumen el mismo `@operations-hub/domain`. Ambas necesitan mantener el estado de dominio (el `Dataset` y sus mutaciones), estado derivado (informes) y estado de UI (selecciones). El laboratorio busca comparar arquitecturas propias de cada framework, no imponer un modelo de estado idéntico. La especificación prohíbe librerías de estado externas (NgRx, Redux, Zustand, TanStack Query) en esta fase.

## Decisión

Distinguir tres tipos de estado y resolverlos con los mecanismos nativos de cada framework:

1. **Estado de dominio** — el `Dataset` mutable solo a través de mutaciones validadas por el dominio:
   - **React**: store externo mínimo propio (patrón `useSyncExternalStore`), sin librería.
   - **Angular**: servicio `providedIn: 'root'` con un `signal` escribible privado expuesto como `asReadonly()`.
2. **Estado derivado** — nunca se almacena; se computa desde el estado de dominio:
   - React: `useMemo` (o directamente en render).
   - Angular: `computed` sobre los signals.
3. **Estado de UI** — selecciones locales:
   - React: `useState`.
   - Angular: `signal` local del componente.

En ambos casos, las mutaciones delegan las reglas de negocio en `@operations-hub/domain` (`canTransitionProject`, `canTransitionTask`); ninguna aplicación reimplementa la máquina de estados ni los cálculos de informes.

## Alternativas consideradas

1. **Misma solución de estado en ambas apps** — descartado: contradice el objetivo del laboratorio de comparar arquitecturas propias (la equivalencia es funcional, no de implementación).
2. **Librería de estado externa en React (Redux/Zustand) o Angular (NgRx)** — descartado: prohibido por la especificación de la Fase 2; el estado necesario es pequeño y los mecanismos nativos son suficientes (principio 5).
3. **Estado global en un objeto compartido fuera del framework** — descartado: añade una capa ajena a ambos frameworks sin beneficios sobre los mecanismos nativos (principio 1).

## Justificación

- `useSyncExternalStore` es el mecanismo nativo de React 18+ para consumir estado externo; el store mínimo (suscribir + snapshot) cubre exactamente la necesidad actual.
- Los signals son el modelo de estado moderno de Angular 21 (zoneless) y ofrecen reactividad granular con `computed` sin dependencias.
- Mantener el estado de dominio separado del estado de UI permite sustituir el origen de datos (fixture → API) sin tocar la presentación.
- Las reglas de negocio siguen centralizadas en el dominio: el store solo orquesta la mutación y la notificación.

## Consecuencias

- Cada app expone su estado de forma distinta; la documentación de arquitectura (`frontend-architecture.md`) describe ambos modelos explícitamente.
- No hay abstracción compartida de estado entre apps; si una necesidad común surgiera, se evaluará si pertenece al dominio (principio 6).
- Los tests de cada app verifican la interacción transición → estado sin re-testear el dominio (que ya tiene su propia suite).

## Trade-offs

- Soluciones nativas por framework implican que la lógica de orquestación del estado se expresa dos veces (una por app) — aceptado: el dominio sigue siendo la única fuente de reglas y el duplicado es solo de integración (principio 7).
- `useSyncExternalStore` exige snapshots inmutables; el store reemplaza el `Dataset` completo en cada mutación (estructura pequeña, coste despreciable).
