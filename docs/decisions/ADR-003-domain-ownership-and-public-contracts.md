# ADR-003 — Ownership del dominio compartido y contratos públicos

- **Estado:** Accepted
- **Fecha:** 2026-08-26
- **Decisión relacionada:** Complementa [ADR-001](./ADR-001-shared-domain-package.md) y [ADR-002](./ADR-002-state-management-react-angular.md).

## Contexto

El proyecto mantiene dos aplicaciones frontend equivalentes, React y Angular, sobre el dominio Operations Hub. `packages/domain`, publicado como `@operations-hub/domain`, ya contiene los tipos, contratos, reglas, validadores, transiciones, informes y fixture compartidos.

ADR-001 decidió crear ese paquete. Las fases posteriores F6 y F11–F20 aportaron evidencia adicional sobre evolución, breaking changes, migración gradual, mantenibilidad, debugging, acoplamiento y escalabilidad. Esa evidencia confirma que el valor arquitectónico no está solo en compartir un paquete, sino en mantener un ownership único y explícito de las reglas de negocio.

## Problema

Si las aplicaciones o sus features reimplementan reglas, contratos o invariantes del dominio, pueden aparecer divergencias entre React y Angular, cambios parcialmente aplicados y un blast radius difícil de identificar. Si los consumidores acceden a internals, la API del dominio deja de ser una frontera estable.

## Decisión

- `packages/domain` es el único owner de los modelos, contratos públicos, invariantes, reglas de negocio, transiciones y validaciones de dominio.
- React y Angular consumen el mismo contrato público de `@operations-hub/domain`.
- Las aplicaciones no duplican reglas de negocio ni crean una segunda fuente de verdad en la UI, stores o features.
- La UI puede contener presentación, composición y estado de UI, pero no decisiones de negocio que deban ser compartidas.
- El dominio permanece independiente de React, Angular, componentes UI, routing, estado de framework, HTTP, backend y persistencia.
- Los consumidores utilizan la API pública del paquete; los imports profundos a internals no forman parte del contrato.
- Una transformación de forma puede vivir en una frontera explícita, siempre que no reimplemente reglas de negocio.

## Alternativas consideradas

1. **Duplicar dominio en cada aplicación:** descartado por el riesgo de divergencia y por la pérdida de una fuente única de verdad.
2. **Compartir únicamente tipos y duplicar reglas:** descartado; compartir tipos no evita inconsistencias semánticas.
3. **Crear una abstracción de estado común para ambos frameworks:** descartado por ADR-002; el estado puede expresarse con mecanismos nativos mientras las reglas permanecen compartidas.
4. **Permitir acceso a internals del paquete:** descartado porque acopla consumidores a detalles que no son contratos públicos.

## Consecuencias

### Positivas

- Un único ownership para reglas e invariantes.
- Breaking changes visibles para los consumidores mediante TypeScript.
- Reutilización y testing independiente del framework.
- Menor riesgo de divergencia entre React y Angular.
- Blast radius identificable por consumidores reales.

### Negativas

- Un cambio compartido puede afectar a varios consumidores y requerir coordinación.
- El paquete de dominio añade una frontera y exige mantener su API pública.
- Los adapters de forma requieren revisión para evitar que acumulen lógica de negocio.

## Evidencia

- **F6:** reglas compartidas y 0 duplicación entre aplicaciones.
- **F11:** TypeScript localizó consumidores de breaking changes y el dominio siguió siendo la fuente única.
- **F12:** React y Angular coexistieron durante una migración V1/V2 con compatibilidad localizada y sin duplicar reglas.
- **F17–F18:** los bugs multicapa y el acoplamiento mostraron el coste de dispersar ownership.
- **F19–F20:** consumidores y estructura del grafo explicaron el blast radius; la arquitectura limpia mantuvo las invariantes.
- **ADR-001/ADR-002:** decisiones existentes sobre el paquete compartido y el estado específico de cada framework.

## Limitaciones

Esta decisión se apoya en un dominio, dos aplicaciones y las escalas medidas en F1–F20. No establece que todos los proyectos deban usar el mismo número de paquetes ni que toda lógica deba trasladarse al dominio. La frontera debe revisarse si cambia el contexto del producto.

## Related Decisions

- [ADR-001 — Paquete de dominio compartido](./ADR-001-shared-domain-package.md)
- [ADR-002 — Gestión de estado en React y Angular](./ADR-002-state-management-react-angular.md)
- [ADR-004 — Límites de dependencias entre capas y features](./ADR-004-dependency-boundaries.md)
- [ADR-005 — Compatibilidad temporal y migración de contratos](./ADR-005-contract-compatibility-and-migration.md)
