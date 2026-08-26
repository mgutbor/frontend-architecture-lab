# ADR-005 — Compatibilidad temporal y migración de contratos

- **Estado:** Accepted
- **Fecha:** 2026-08-26
- **Decisión relacionada:** Complementa [ADR-001](./ADR-001-shared-domain-package.md) y [ADR-003](./ADR-003-domain-ownership-and-public-contracts.md).

## Contexto

Los cambios de contrato del dominio pueden afectar a varios consumidores. F11 mostró que TypeScript hace visibles los consumidores de un breaking change. F12 demostró que, cuando una migración atómica no es conveniente, React y Angular pueden coexistir temporalmente con V1/V2, migrarse de forma progresiva y retirar la compatibilidad después.

## Problema

Una migración simultánea puede no ser viable cuando existen consumidores que deben actualizarse en momentos distintos. Sin una estrategia explícita, la compatibilidad puede dispersarse por las features, duplicar reglas de negocio o convertirse en una segunda arquitectura permanente.

## Decisión

La compatibilidad y el versionado son herramientas temporales, no una obligación para todos los cambios.

Cuando un cambio breaking no pueda hacerse de forma atómica:

- introducir el nuevo contrato de forma explícita;
- mantener el contrato anterior solo durante la ventana de migración necesaria;
- localizar la adaptación en la frontera responsable del contrato;
- mantener las reglas de negocio en el modelo canónico del dominio;
- migrar consumidores progresivamente y registrar qué consumidores siguen en la versión anterior;
- evitar adapters distribuidos por las features;
- retirar contratos, adapters, exports, fixtures, tests y referencias obsoletas cuando no queden consumidores funcionales;
- verificar que la retirada no deja una segunda fuente de verdad ni código muerto.

Cuando un cambio sea compatible o pueda hacerse atómicamente con bajo riesgo, no se introduce versionado por defecto.

## Alternativas consideradas

1. **Actualizar todos los consumidores en una única operación:** preferible cuando sea viable, pero insuficiente para despliegues o equipos que no puedan coordinarse atómicamente.
2. **Mantener varias versiones permanentemente:** descartado por el coste de compatibilidad y el riesgo de divergencia.
3. **Colocar un adapter en cada feature:** descartado porque dispersa ownership y transforma una compatibilidad temporal en deuda estructural.
4. **Definir semantic versioning obligatorio para todos los cambios internos:** descartado; añade proceso sin estar respaldado por la necesidad del proyecto.

## Consecuencias

### Positivas

- Permite migraciones graduales cuando la migración atómica no es viable.
- Hace visible el progreso y los consumidores pendientes.
- Mantiene las reglas centralizadas.
- Permite retirar explícitamente la deuda temporal.
- Reduce la necesidad de cambiar todos los consumidores simultáneamente.

### Negativas

- Durante la transición existen más tipos, exports, tests y rutas de compatibilidad.
- La compatibilidad requiere ownership, seguimiento y una condición clara de retirada.
- Un adapter mal ubicado puede duplicar reglas o perpetuarse.
- El blast radius de un contrato compartido sigue siendo real aunque la migración sea gradual.

## Evidencia

- **F11:** el breaking change de dominio fue detectado por TypeScript en los consumidores reales.
- **F12:** coexistencia real React V2 + Angular V1, migración independiente de cada app, compatibilidad localizada, 100% de migración y retirada de V1.
- **F18:** la duplicación y el acoplamiento pueden dejar deuda aunque el comportamiento inicial parezca equivalente.

## Limitaciones

La evidencia cubre una migración de contrato en un sandbox con dos aplicaciones. No define una estrategia para APIs públicas externas, persistencia distribuida, versionado de bases de datos o despliegues independientes. La decisión no obliga a usar V1/V2 cuando un cambio atómico sea más sencillo.

## Related Decisions

- [ADR-001 — Paquete de dominio compartido](./ADR-001-shared-domain-package.md)
- [ADR-002 — Gestión de estado en React y Angular](./ADR-002-state-management-react-angular.md)
- [ADR-003 — Ownership del dominio compartido y contratos públicos](./ADR-003-domain-ownership-and-public-contracts.md)
- [ADR-004 — Límites de dependencias entre capas y features](./ADR-004-dependency-boundaries.md)
