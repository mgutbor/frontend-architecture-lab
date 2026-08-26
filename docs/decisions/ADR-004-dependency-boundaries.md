# ADR-004 — Límites de dependencias entre capas y features

- **Estado:** Accepted
- **Fecha:** 2026-08-26
- **Decisión relacionada:** Complementa [ADR-003](./ADR-003-domain-ownership-and-public-contracts.md) y la arquitectura descrita en [`docs/architecture/frontend-architecture.md`](../architecture/frontend-architecture.md).

## Contexto

La arquitectura actual mantiene aplicaciones React y Angular independientes, organizadas por features, que consumen `@operations-hub/domain`. Las fases F8, F11–F20 verificaron 0 imports feature→feature en los estados limpios y midieron el efecto del acoplamiento inducido, la profundidad y los consumidores.

## Problema

Una dependencia directa entre features puede convertir un cambio local en un cambio transitivo, aumentar el blast radius y alargar la distancia entre un síntoma y su causa. Una dependencia invertida desde el dominio hacia una app o feature mezcla ownerships y hace que la frontera compartida dependa de una implementación concreta.

## Decisión

La dirección normal de dependencias es:

```text
apps / framework
        ↓
     features
        ↓
packages/domain
```

- Las features pueden consumir contratos y API pública del dominio.
- Se prohíben los imports directos entre features de la misma aplicación.
- React y Angular no se importan entre sí.
- `packages/domain` no importa `apps`, features, componentes ni servicios de framework.
- Se prohíben las dependencias circulares.
- Los imports profundos a internals no sustituyen a la API pública del dominio.
- Una dependencia compartida es válida cuando tiene ownership arquitectónico claro, contrato explícito y consumidores definidos.
- No se crea un `shared` genérico únicamente para ocultar ownership o evitar decidir dónde vive una regla.
- Una capa o paquete de infraestructura compartida puede existir si responde a una necesidad real y mantiene un ownership explícito; no puede convertirse en owner accidental de reglas de negocio.
- Cualquier excepción feature→feature debe estar justificada, acotada y documentada antes de introducirse.

## Alternativas consideradas

1. **Permitir imports feature→feature libremente:** descartado por el coste de debugging y blast radius observado en F18–F20.
2. **Centralizar toda reutilización en `shared`:** descartado; una carpeta genérica puede ocultar ownership y crear un nuevo hub sin límites.
3. **Prohibir toda dependencia compartida:** descartado; una infraestructura con ownership claro puede ser legítima.
4. **Compartir implementación entre React y Angular:** descartado para UI y estado de framework; ADR-002 permite expresiones nativas distintas.

## Consecuencias

### Positivas

- Menor acoplamiento accidental entre features.
- Blast radius y consumidores más trazables.
- Menor profundidad accidental del grafo.
- Independencia entre React y Angular.
- Ownership explícito de las dependencias compartidas.

### Negativas

- Una interacción entre features debe expresarse mediante un contrato o capa permitida.
- Puede haber más coordinación al diseñar una API compartida.
- La regla no elimina el coste de cambios sobre contratos o hubs con muchos consumidores.
- Sin una guardia automática, la decisión depende de revisión y disciplina hasta que se implemente tooling específico.

## Evidencia

- **F8:** aislamiento de features y 0 imports entre features al crecer el producto.
- **F11–F12:** evolución y migración de contratos sin acoplamiento entre features.
- **F17:** la profundidad de bugs multicapa amplió el espacio de búsqueda.
- **F18:** el acoplamiento inducido aumentó distancia y blast radius de debugging.
- **F19:** el coste de cambios centrales creció con consumidores y la profundidad del grafo.
- **F20:** `density != depth != consumers`; profundidad predijo debugging y consumidores transitivos predijeron blast radius.

## Limitaciones

Los grafos de F19–F20 incluyen features generadas y alcanzan 30 features. No se establece un umbral universal de número de features, densidad o profundidad. La prohibición protege una propiedad arquitectónica observada, pero cualquier excepción legítima debe evaluarse por ownership y necesidad, no solo por el texto de esta regla.

## Related Decisions

- [ADR-001 — Paquete de dominio compartido](./ADR-001-shared-domain-package.md)
- [ADR-002 — Gestión de estado en React y Angular](./ADR-002-state-management-react-angular.md)
- [ADR-003 — Ownership del dominio compartido y contratos públicos](./ADR-003-domain-ownership-and-public-contracts.md)
- [ADR-005 — Compatibilidad temporal y migración de contratos](./ADR-005-contract-compatibility-and-migration.md)
