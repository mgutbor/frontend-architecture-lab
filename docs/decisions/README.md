# ADR — Architecture Decision Records

Este directorio contiene los **ADR** (Architecture Decision Records) del proyecto: registros de decisiones arquitectónicas.

> En la **Fase 0** no hay ADR publicados, y no se crean ADR «de demostración». La plantilla está disponible en [templates/ADR-TEMPLATE.md](./templates/ADR-TEMPLATE.md).

## ¿Qué es un ADR?

Un ADR es un documento breve que registra **una** decisión arquitectónica: el contexto en el que se tomó, la decisión en sí, las alternativas consideradas, su justificación y sus consecuencias. Captura el _porqué_ de la decisión para que cualquier persona del futuro pueda entenderla — o impugnarla con conocimiento.

## ¿Cuándo se requiere un ADR?

Se requiere un ADR cuando la decisión:

- Cambia materialmente la arquitectura del proyecto o de un experimento.
- Introduce una nueva tecnología, framework o patrón estructural.
- Modifica decisiones registradas previamente.
- Crea o elimina un límite de propiedad de código compartido.
- Define o cambia el dominio compartido (Operations Hub) o los requisitos funcionales equivalentes.

No se requiere un ADR para cambios puramente internos, de estilo, de configuración de tooling sin impacto arquitectónico, o de documentación sin decisiones nuevas.

## ¿Cómo se proponen las decisiones?

1. **Identifica** el problema o la decisión pendiente.
2. **Explora** las alternativas viables y sus trade-offs.
3. **Redacta** el ADR con la plantilla: contexto, decisión, alternativas consideradas, justificación, consecuencias y trade-offs.
4. **Abre** la pull request con el ADR como parte del cambio que implementa la decisión (o como PR independiente si la decisión precede a la implementación).

La numeración es secuencial: `ADR-001`, `ADR-002`, ... El título se escribe en español, conciso y descriptivo (p. ej. `ADR-001 — Uso de pnpm como gestor de paquetes`).

## ¿Cómo se revisan las decisiones?

- El ADR se revisa en la pull request por al menos una persona mantenedora.
- La revisión evalúa: contexto suficiente, alternativas consideradas de forma honesta, trade-offs documentados y coherencia con `PROJECT_SPEC.md`.
- Los ADR que cambian materialmente la arquitectura requieren **aprobación explícita** antes de implementarse.
- Las decisiones **no se toman en silencio**: si hay una contradicción o ambigüedad, se explica el problema y se propone una solución en lugar de decidir implícitamente.

## ¿Cómo se supersede una decisión?

Una decisión puede quedar obsoleta. Para supercederla:

1. Se crea un **nuevo ADR** que reemplace al anterior.
2. El nuevo ADR indica en su contexto qué ADR supercede (p. ej. «Supercede a ADR-003»).
3. El ADR anterior se marca como **`Superceded by ADR-XXX`** en su estado; no se elimina ni se reescribe la historia.

Estados posibles de un ADR:

| Estado       | Significado                                          |
| ------------ | ---------------------------------------------------- |
| `Accepted`   | Aprobado y vigente.                                  |
| `Proposed`   | Propuesto, en revisión.                              |
| `Deprecated` | Ya no se aplica (se indica el ADR que lo reemplaza). |
