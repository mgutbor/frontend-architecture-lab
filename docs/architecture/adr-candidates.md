# Candidatos de ADR tras el cierre F1–F20

## 1. Contexto

El laboratorio `frontend-architecture-lab` quedó cerrado tras F1–F20. Este documento no abre una nueva fase experimental, no modifica código de producción y no convierte automáticamente todas las observaciones del laboratorio en decisiones formales.

El objetivo es separar tres niveles:

- **Observación:** algo medido en un experimento.
- **Conclusión:** interpretación defendible dentro de los límites del laboratorio.
- **Decisión arquitectónica:** regla que el proyecto adopta para proteger su evolución futura.

La fuente principal de evidencia es [`docs/experiments/final-report.md`](../experiments/final-report.md), contrastada con la arquitectura actual, [`docs/architecture/frontend-architecture.md`](./frontend-architecture.md), los ADR existentes y el código.

## 2. Resultado ejecutivo

Se recomienda crear **tres ADR nuevos**, no uno por cada fase ni uno por cada hipótesis:

1. **Ownership del dominio compartido y contratos públicos.**
2. **Límites de dependencia entre capas y features.**
3. **Compatibilidad temporal y migración de contratos.**

La duplicación de reglas queda cubierta por los dos primeros ADRs y no necesita un ADR separado. La elección React/Angular, las métricas de rendimiento y la observabilidad del grafo deben permanecer como documentación o políticas operativas, no como ADRs independientes en este momento.

Los ADR-001 y ADR-002 existentes ya cubren parcialmente el primer y tercer ámbito, respectivamente: el ADR-001 registra el paquete de dominio compartido y el ADR-002 registra el estado específico de cada framework. Por tanto, la primera acción recomendada no es crear ADRs redundantes, sino revisar si los nuevos documentos deben complementar esos ADRs o si, tras aprobación, conviene supersederlos de forma explícita.

**Recomendación conservadora:** preparar tres propuestas `Proposed` y decidir en revisión si el futuro ADR sobre ownership puede complementar ADR-001 o si debe consolidarlo mediante un ADR sucesor. No crear archivos definitivos en esta etapa.

## 3. Principios extraídos de F1–F20

1. Las reglas, tipos y contratos de negocio deben tener un ownership claro en `packages/domain`.
2. React y Angular deben consumir el mismo contrato de dominio, pero pueden expresar estado y composición con mecanismos propios.
3. Las features no deben depender directamente de implementaciones de otras features sin una decisión explícita y una justificación temporal.
4. La duplicación de reglas de negocio no es una alternativa estable a la compartición; un adapter puede transformar forma, no reimplementar negocio.
5. Los breaking changes deben ser visibles y migrables; la compatibilidad temporal debe tener una frontera y una condición de retirada.
6. El blast radius debe analizar consumidores reales, no solo el número total de features o la densidad del grafo.
7. La profundidad del grafo es una señal relevante para debugging; no debe confundirse con densidad.
8. El estado específico de un framework no necesita una abstracción compartida si no existe una necesidad real.
9. Rendimiento de montaje e interacción son regímenes distintos y no justifican, por sí solos, una decisión de framework.
10. Las invariantes y tests protegen la arquitectura, pero no sustituyen el ownership ni eliminan la deuda de acoplamiento.

## 4. Inventario de candidatos

| ID  | Candidato                                 | Evidencia F1–F20                     | Decisión implícita                                                             | Impacto                                                      | ¿ADR?                                                      |
| --- | ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
| C1  | Single source of truth del dominio        | F6, F11, F12, F18, F20; ADR-001      | Mantener reglas, tipos y contratos de negocio en `packages/domain`             | Alto: afecta cualquier cambio de dominio                     | **Sí, obligatorio**, aunque debe coordinarse con ADR-001   |
| C2  | Límites entre features                    | F8, F11–F20; especialmente F18–F20   | Evitar imports directos feature→feature                                        | Alto: define dependencias futuras y blast radius             | **Sí, obligatorio**                                        |
| C3  | Dominio como contrato común React/Angular | F6, F11, F12, F17–F20; ADR-001/002   | Ambas apps consumen la API pública del dominio                                 | Alto, pero parcialmente cubierto por ADR-001                 | **Sí, recomendable**, como ampliación o sucesor de ADR-001 |
| C4  | Separación dominio/UI                     | F6, F8, F11–F20; arquitectura actual | No poner reglas de negocio, UI ni servicios de framework en el dominio         | Alto y transversal                                           | **Sí**, combinado con C1, no separado                      |
| C5  | Prohibición de duplicar reglas            | F11, F12, F18, F20                   | Las features delegan reglas al dominio                                         | Alto: evita divergencia silenciosa                           | **No separado**; incluir en C1/C2                          |
| C6  | Compatibilidad/versionado                 | F11–F12                              | Para cambios breaking, permitir compatibilidad temporal localizada y retirarla | Medio/alto: añade deuda temporal controlada                  | **Sí, recomendable**                                       |
| C7  | Dirección de dependencias                 | Arquitectura actual; F8, F11–F20     | `apps/features → domain`; domain no depende de apps                            | Alto: límite formal del sistema                              | **Sí**, combinado con C2/C4                                |
| C8  | React vs Angular                          | F6–F20                               | No elegir framework por una conclusión global no demostrada                    | Estratégico, pero no prescribe una arquitectura nueva        | **No**; mantener en informe y criterios de decisión        |
| C9  | Performance                               | F9–F16                               | Medir montaje, incremental y E2E por separado                                  | Operativo; no una regla arquitectónica suficiente            | **No**; documentación de medición                          |
| C10 | Métricas de grafo                         | F17–F20                              | Vigilar consumidores y profundidad                                             | Útil como tooling/policy, pero aún no define una restricción | **No ahora**; documentación o futura política              |
| C11 | Estado por framework                      | ADR-002, F13–F16                     | React y Angular pueden usar mecanismos nativos distintos                       | Ya decidido y registrado                                     | **No nuevo**                                               |
| C12 | Shared genérico                           | F8, F11–F20 y arquitectura actual    | No crear `shared` sin ownership o reutilización real                           | Evita sobrearquitectura                                      | **No**; basta documentación de arquitectura                |

### Lectura de los candidatos

- **C1/C3/C4/C5** son una misma decisión de ownership y frontera del dominio; separarlos produciría duplicación documental.
- **C2/C7** son una misma decisión de grafo permitido; la regla feature→feature es un caso concreto de dirección de dependencias.
- **C6** sí tiene un ciclo de vida distinto: solo aplica cuando un contrato no puede cambiarse atómicamente.
- **C8/C9/C10/C12** son conclusiones, criterios o documentación operativa, no decisiones formales nuevas suficientemente delimitadas.

## 5. Clasificación A/B/C/D

| Candidato                                                 | Clasificación                           | Motivo                                                                                                          |
| --------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ownership del dominio, contratos y separación de UI       | **A. ADR obligatorio**                  | Define ownership, límites de código y una regla que futuros cambios podrían romper                              |
| Dependencias permitidas y prohibición de coupling directo | **A. ADR obligatorio**                  | Define el grafo arquitectónico válido y protege contra deuda estructural medida                                 |
| Compatibilidad temporal de contratos                      | **B. ADR recomendable**                 | F12 la respalda, pero no todos los cambios necesitan versionado; debe formalizarse como estrategia condicionada |
| Duplicación de reglas                                     | **B. ADR recomendable dentro de C1/C2** | Merece una regla explícita, pero un ADR independiente sería redundante                                          |
| Estado nativo por framework                               | **C. Documentación normal / ADR-002**   | Ya existe ADR-002 y no se ha identificado una decisión nueva                                                    |
| React frente a Angular                                    | **D. No convertir en decisión**         | No hay superioridad global defendible                                                                           |
| Rendimiento, INP, TBT y throttling                        | **C. Documentación normal**             | Son criterios de medición y resultados dependientes del régimen, no una regla de diseño suficiente              |
| Densidad, profundidad y consumers                         | **C. Documentación normal**             | Son señales para análisis y tooling; fijar umbrales no está respaldado                                          |
| `shared` genérico                                         | **C. Documentación normal**             | La arquitectura ya documenta que no se crea sin necesidad real                                                  |

## 6. ADR frente a la arquitectura actual

| ADR candidato                               | Estado actual                                                      | Evidencia en código                                                                                                                 | Gap                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Ownership del dominio y contratos públicos  | **Cumple**                                                         | `packages/domain/src/` contiene tipos, validación, reglas, transiciones, reports y fixture; `packages/domain` exporta API pública   | Formalizar la decisión posterior a ADR-001 y mantenerla vigente fuera del contexto experimental                                  |
| Límites de dependencia entre capas/features | **Cumple en el snapshot actual**                                   | Las features importan `@operations-hub/domain` y sus propios stores/helpers; el escaneo histórico reporta 0 imports feature→feature | No hay todavía un ADR específico ni una guardia dedicada visible en el código; la regla podría romperse sin un control explícito |
| No duplicación de reglas de negocio         | **Cumple**                                                         | Stores y formularios delegan en `canTransition*` y validadores del dominio; los reports se construyen desde el dominio              | Formalizar ownership y revisión; no se justifica añadir una abstracción nueva                                                    |
| Separación dominio/UI/framework             | **Cumple**                                                         | `packages/domain` no contiene React/Angular/UI/routing/servicios de framework; adapters y stores viven en apps                      | Mantener la frontera en un ADR y revisar imports profundos                                                                       |
| Compatibilidad temporal V1/V2               | **No aplica al estado productivo actual / evidencia experimental** | F12 implementó compatibilidad en sandbox; el código principal actual usa el contrato vigente y no muestra consumidores V1 activos   | Definir cuándo se usa versionado, dónde vive el adapter y cómo se retira; no añadir compatibilidad ahora                         |
| Estado por framework                        | **Cumple**                                                         | React usa store externo mínimo; Angular usa service/signals; ambos consumen el dominio                                              | Ya documentado por ADR-002; sin gap material identificado                                                                        |
| React vs Angular como elección              | **No aplicable**                                                   | Ambas apps existen y comparten contrato; los resultados no justifican reemplazo                                                     | No crear decisión de selección de framework                                                                                      |
| Política de performance                     | **No determinada como regla de código**                            | Existen harnesses y resultados históricos, no una política de presupuesto en producción                                             | Mantener como documentación; cualquier presupuesto futuro requeriría una decisión separada y contexto operativo                  |
| Observabilidad del grafo                    | **Parcial**                                                        | Los scripts F18–F20 miden imports, consumidores, profundidad y blast radius                                                         | No imponer umbrales artificiales ni añadir tooling en esta etapa                                                                 |

## 7. ADRs recomendados

### ADR candidato 1 — Ownership del dominio compartido y contratos públicos

- **Número propuesto:** `ADR-003`, sujeto a revisión de la relación con ADR-001.
- **Título:** `Paquete de dominio compartido, ownership de reglas y contratos públicos`.
- **Estado inicial:** `Proposed`.

#### Contexto

React y Angular implementan la misma funcionalidad de Operations Hub. El paquete `@operations-hub/domain` ya contiene tipos, reglas, validadores, transiciones, reports y el fixture. ADR-001 registra la creación del paquete, pero el laboratorio posterior amplió la evidencia sobre evolución, consumidores y migración.

#### Problema

Sin una regla formal de ownership, una feature podría reimplementar una regla o una app podría depender de internals, generando divergencia y haciendo invisible el blast radius real.

#### Decisión propuesta

- `packages/domain` es owner de tipos, contratos, invariantes y reglas de negocio.
- Las apps consumen únicamente la API pública de `@operations-hub/domain`.
- El dominio no depende de React, Angular, UI, routing, estado de framework, HTTP ni persistencia.
- Adapters de forma pueden vivir en una frontera definida, pero no deben duplicar reglas de negocio.
- Los cambios de dominio deben identificar consumidores y actualizar sus tests de contrato.

#### Alternativas consideradas

1. Duplicar reglas en cada app: descartado por riesgo de divergencia observado en F12/F18.
2. Crear una abstracción de estado compartida: descartada por ADR-002 y por ausencia de necesidad real.
3. Permitir imports profundos al dominio: descartado porque debilita la API pública.

#### Consecuencias positivas

- Una fuente de verdad.
- Breaking changes visibles mediante TypeScript.
- Reglas reutilizables y testeables independientemente del framework.
- Menor riesgo de divergencia entre React y Angular.

#### Consecuencias negativas

- Cambios compartidos pueden afectar a muchos consumidores.
- El dominio requiere ownership y revisión.
- Los adapters deben respetar límites y pueden añadir una pequeña capa de indirección.

#### Evidencia F1–F20

F6, F8, F11, F12, F17, F18 y F20; ADR-001 y `frontend-architecture.md`.

#### Limitaciones

La evidencia procede de un dominio, dos apps y escalas experimentales de hasta 30 features. No demuestra que toda organización deba usar exactamente esta distribución.

#### Relación

Complementa ADR-001 y debe ser compatible con ADR-002. Si se decide ampliar materialmente el alcance de ADR-001, crear un ADR sucesor en lugar de reescribirlo.

### ADR candidato 2 — Límites de dependencias entre capas y features

- **Número propuesto:** `ADR-004`.
- **Título:** `Dirección de dependencias y aislamiento entre features`.
- **Estado inicial:** `Proposed`.

#### Contexto

El estado actual mantiene 0 imports feature→feature y las apps consumen el dominio. F18 mostró que el coupling inducido aumenta el espacio de búsqueda y la distancia de debugging; F19/F20 demostraron que profundidad y consumidores afectan al coste de forma diferente.

#### Problema

Un import directo entre features puede crear dependencias transitivas, aumentar blast radius y hacer que una modificación local atraviese partes no relacionadas. El dominio también debe permanecer independiente de las apps.

#### Decisión propuesta

- Una feature puede depender de su propia implementación y de contratos públicos de las capas permitidas.
- Las dependencias de aplicación deben apuntar hacia `packages/domain`, no al revés.
- Se prohíben imports directos entre features de la misma app y entre React y Angular.
- Una excepción requiere justificar ownership, alcance y carácter temporal en la revisión correspondiente.
- No se crea una capa `shared` genérica por defecto; solo una frontera con ownership y reutilización real.

Diagrama de referencia:

```text
apps / framework
        ↓
     features
        ↓
packages/domain
```

`shared/infrastructure`, si aparece en el futuro, no puede asumir reglas de negocio ni invertir la dirección hacia las apps.

#### Alternativas consideradas

1. Permitir coupling porque reduce archivos inmediatos: descartado; F18 mostró deuda de debugging.
2. Centralizar todo en `shared`: descartado por riesgo de cajón de sastre y por F8/F11–F20.
3. Prohibición absoluta sin excepciones documentadas: no recomendada; puede impedir una dependencia legítima y acotada.

#### Consecuencias positivas

- Blast radius más localizado.
- Menor profundidad accidental del grafo.
- Debugging más trazable.
- Independencia entre frameworks.

#### Consecuencias negativas

- Puede requerir mover una interacción a un contrato o capa permitida.
- El número total de features no garantiza coste constante para cambios compartidos.
- Requiere análisis de imports en revisión o tooling.

#### Evidencia F1–F20

F8, F11–F14, F17–F20, especialmente F18 (coupling), F19 (tamaño) y F20 (densidad/profundidad/consumidores).

#### Limitaciones

El experimento no mide todos los estilos de modularidad ni establece un umbral universal de densidad, profundidad o número de features.

#### Relación

Complementa el candidato 1 y la arquitectura descrita en `frontend-architecture.md`. No modifica ADR-002.

### ADR candidato 3 — Compatibilidad temporal y migración de contratos

- **Número propuesto:** `ADR-005`.
- **Título:** `Estrategia de compatibilidad temporal para cambios breaking de contratos`.
- **Estado inicial:** `Proposed`.

#### Contexto

F11 mostró que TypeScript localiza consumidores de un breaking change. F12 demostró que un contrato puede evolucionar de V1 a V2 con coexistencia real, migración progresiva de React y Angular, compatibilidad localizada y retirada de V1.

#### Problema

No todos los consumidores pueden migrarse simultáneamente. Sin una estrategia explícita, se puede duplicar la lógica de negocio, repartir adapters por las apps o dejar compatibilidad permanente.

#### Decisión propuesta

Cuando un cambio de contrato no pueda ser atómico:

- introducir V2 de forma explícita;
- mantener V1 solo durante la ventana de migración necesaria;
- localizar la adaptación en la frontera responsable del contrato;
- mantener las reglas de negocio en el dominio canónico;
- migrar consumidores progresivamente y registrar el progreso;
- retirar V1, adapters y fixtures obsoletos cuando no queden consumidores funcionales;
- no usar versionado por defecto para cambios compatibles o triviales.

#### Alternativas consideradas

1. Cambiar todos los consumidores en una única operación: válido cuando sea viable, pero no cubre despliegues graduales.
2. Mantener dos modelos permanentemente: descartado por deuda y riesgo de doble fuente de verdad.
3. Adaptar en cada feature: descartado porque dispersa compatibilidad.

#### Consecuencias positivas

- Migración gradual y reversible durante la ventana definida.
- Menor coordinación simultánea.
- Deuda temporal visible y retirable.
- Reglas sin duplicación.

#### Consecuencias negativas

- Más tipos, tests, exports y referencias durante la transición.
- La retirada debe formar parte del trabajo, no quedar implícita.
- Un adapter mal ubicado puede convertirse en una segunda implementación.

#### Evidencia F1–F20

F11 y F12, con apoyo de F18 sobre duplicación y recuperación arquitectónica.

#### Limitaciones

La evidencia cubre un contrato y una migración en un sandbox. No define una estrategia de compatibilidad de APIs externas, persistencia distribuida o despliegues independientes.

#### Relación

Depende del ownership y los contratos del candidato 1. Puede complementar ADR-001; no reemplaza ADR-002.

## 8. ADRs descartados o absorbidos

### React vs Angular como ADR de selección

**Descartado.** El laboratorio no demostró superioridad arquitectónica global. Las diferencias de runtime fueron dependientes del régimen: Angular en montaje grande y React en trabajo incremental bajo CPU limitada. No se debe convertir un resultado contextual en una política de framework.

### ADR de performance/INP/TBT

**Documentación normal por ahora.** F9–F16 justifican medir mount, incremental y E2E por separado, pero no establecen un presupuesto de producción ni una decisión irreversible. La política adecuada, si algún día fuese necesaria, debe nacer de requisitos de producto y observabilidad real.

### ADR de densidad del grafo

**Descartado como ADR independiente.** F20 demuestra que densidad no basta: `density != depth != consumers`. El principio útil es vigilar consumidores y profundidad, que ya queda cubierto por el ADR de dependencias; no se propone un umbral numérico artificial.

### ADR de duplicación de reglas

**Absorbido.** Es una regla esencial, pero pertenece al ownership del dominio y a los límites de dependencia. Un ADR separado repetiría contexto y decisión.

### ADR de estado por framework

**No crear.** Ya existe ADR-002 y el código lo cumple. F13–F16 no aportan una decisión nueva que superseda la existente.

### ADR de capa `shared`

**No crear.** La ausencia de una necesidad de `shared` genérico es una aplicación de simplicidad, no una arquitectura que requiera un registro separado.

## 9. Orden recomendado de creación

1. Revisar ADR-001 y aprobar una ampliación o crear `ADR-003` como sucesor sobre ownership, contratos y separación de dominio/UI.
2. Crear `ADR-004` sobre dirección de dependencias y aislamiento entre features.
3. Crear `ADR-005` sobre compatibilidad temporal, solo si el proyecto prevé cambios graduales de contratos fuera del laboratorio.
4. Actualizar `docs/decisions/README.md` únicamente cuando los ADR hayan sido aprobados y creados.

No implementar reglas ESLint, CI, refactors ni nuevos paquetes como parte de esta etapa.

## 10. Dependencias entre ADRs

```text
ADR-003 ownership del dominio y contratos
          ↓
ADR-004 dependencias y aislamiento
          ↓
ADR-005 compatibilidad temporal y retirada
```

ADR-002 permanece paralelo: define cómo cada framework gestiona su estado, mientras que el candidato 1 define qué pertenece al dominio y el candidato 2 define hacia dónde pueden apuntar las dependencias.

## 11. Riesgos de sobrearquitectura

- Crear un ADR independiente para cada hipótesis o métrica.
- Repetir ADR-001 sin decidir si se complementa o supersede.
- Convertir `density`, `depth` o `blast radius` en umbrales universales sin evidencia suficiente.
- Añadir una capa `shared` solo para evitar una decisión de ownership.
- Crear una abstracción de estado común contra la decisión de ADR-002.
- Convertir diferencias de runtime contextual en una elección global de framework.
- Exigir versionado para cualquier cambio, incluso cuando un cambio atómico sea más simple.
- Confundir documentación de medición con una restricción arquitectónica.

## 12. Respuestas al criterio de éxito

1. **Decisiones aprendidas:** ownership del dominio, contratos públicos, dependencias dirigidas y compatibilidad temporal localizada.
2. **Decisiones que merecen ADR:** tres ámbitos; el primero debe coordinarse con ADR-001.
3. **Decisiones que no lo merecen:** selección React/Angular, métricas de rendimiento, densidad numérica, capa `shared` genérica y duplicación como ADR independiente.
4. **Número real recomendado:** 2 ADRs nuevos como mínimo; 3 si se prevén migraciones graduales reales.
5. **Qué ya cumple el código:** dominio compartido, separación UI/dominio, estado por framework, ausencia observada de coupling y ausencia de duplicación de reglas.
6. **Gaps:** falta formalizar los límites feature→feature y revisar la relación entre el futuro ADR de ownership y ADR-001; no hay una política dedicada visible que impida una futura regresión.
7. **Qué implementar después:** solo tras aprobar los ADRs, añadir las guardias mínimas que se justifiquen —por ejemplo, checks de imports— sin introducir abstracciones ni restricciones no respaldadas.

## 13. Estado de esta etapa

- No se crean ADRs definitivos.
- No se modifica código de producción.
- No se modifican resultados F1–F20.
- No se crean experimentos nuevos.
- El documento es una propuesta para revisión arquitectónica.
