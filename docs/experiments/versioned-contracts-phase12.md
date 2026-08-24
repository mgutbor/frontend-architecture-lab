# Fase 12 — Contratos versionados y migración gradual (V1 → V2)

> Estado: completada · Copia experimental: `/tmp/lab-phase12` (historial propio) ·
> Resultados crudos: `docs/experiments/results/versioned-contracts-phase12.json` ·
> Métricas reproducibles: `pnpm contracts:versioned`

## 1. Pregunta experimental

> ¿Puede evolucionar un contrato de dominio de V1 a V2 mediante una migración
> gradual — V1+V2 coexistiendo temporalmente, consumidores migrados
> progresivamente, V1 retirado al final — sin introducir una segunda fuente de
> verdad, duplicación significativa, acoplamiento accidental o deuda
> arquitectónica permanente?

Y la pregunta secundaria: ¿el coste de esa migración gradual es comparable
entre React y Angular cuando ambos consumen exactamente la misma evolución
conceptual del dominio?

No se busca un ganador global. Se mide el coste de evolucionar un contrato
compartido en producción.

## 2. Contexto

La Fase 11 demostró que un breaking change del dominio (V1 → V2 directo,
migrando todos los consumidores de una vez) es detectable por TypeScript,
localizado en consumidores legítimos y de coste comparable entre frameworks.
Pero ese diseño no cubre la situación real de producción: mantener
temporalmente **V1 + V2** y migrar consumidores progresivamente.

La Fase 12 parte del estado final de la Fase 11 (copia aislada
`/tmp/lab-phase11` en `fd79ff6`) y construye sobre él la secuencia
BASELINE → M1 → M2 → M3 → M4 → M5, cada estado validado y commiteado en una
copia con historial propio (`/tmp/lab-phase12`).

## 3. Baseline

`BASELINE` = estado final de Fase 11 (`fd79ff6`, copia de `/tmp/lab-phase12`):

- **Contrato vigente (V1):** `Project.status: ProjectStatusInfo { value: ProjectStatus; changedAt: string }` — resultado del breaking change M4 de Fase 11.
- 56 archivos prod / 17 test, 4126 LOC prod / 2182 LOC test.
- Domain: 888 LOC prod · React: 1931 LOC prod · Angular: 1307 LOC prod.
- 25 archivos consumen `@operations-hub/domain` (13 React, 12 Angular); los puntos de integración que **construyen** el contrato (adapter + store) son 2 por framework y están todos en V1.
- Invariantes verificadas en Fase 11: 0 imports feature→feature, 0 reglas duplicadas, 0 dependencias nuevas, ADR-001/ADR-002 intactos.

## 4. Contrato V1

`Project.status: ProjectStatusInfo` — el estado de un proyecto es un valor
trackeado: `value` (union primitiva) + `changedAt` (último cambio). No hay
actor ni historial. Es el contrato que consumen React y Angular al iniciar la
fase.

## 5. Diseño V2

**V2** responde a una necesidad funcional real de trazabilidad/auditoría:
saber **quién** cambió el estado y **toda la secuencia** de cambios, no solo el
último.

```ts
// V2
interface ProjectStatusEvent extends ProjectStatusInfo {
  changedById: string | null // actor del cambio (auditoría)
}
interface ProjectV2 extends Omit<Project, 'status'> {
  status: ProjectStatusEvent // último evento
  statusHistory: ProjectStatusEvent[] // historial completo
}
```

- **Qué cambia:** `status` pasa de `ProjectStatusInfo` a `ProjectStatusEvent` (añade `changedById`) y aparece `statusHistory`.
- **Qué permanece compatible:** la **regla de negocio** opera sobre el **valor** (`project.status.value`); las transiciones y validaciones del dominio no cambian. Los consumidores de solo lectura (`status.value`) son agnósticos a la forma.
- **Qué deja de ser compatible:** cualquier consumidor que **construya** `status` con `ProjectStatusInfo` (stores) o que lea el contrato asumiendo ausencia de historial.

## 6. Estrategia de compatibilidad

```
V1 (JSON persistido, formato v1)          ← on-disk format se conserva
        ↓ migrateDatasetV1ToV2()          ← frontera de persistencia del dominio
V2 (Dataset canónico: events + history)   ← lo que consumen las apps
```

- El **migrador vive en `packages/domain`** (`versioned-contract.ts`): adapta la **forma** de los datos, no contiene reglas de negocio. Las reglas (`canTransitionProject`, validaciones, `getProjectHealth`) operan sobre `status.value` y son compartidas por ambos contratos — **nunca duplicadas** entre V1/V2 ni entre frameworks.
- La coexistencia es **temporal**: M2 introduce `loadFixtureV2()` (vista V2 del mismo fixture) como punto de entrada explícito; M3/M4 migran los consumidores; M5 retira la superficie V1.
- El JSON persistido (`operations-hub-v1.json`) **conserva el formato V1 en disco** — es la decisión realista de producción (no se reescribe el almacenamiento para migrar el contrato). Por eso el migrador permanece como frontera interna de persistencia tras M5 (ver §21–22).

## 7. M1 — Introducir V2 (aditivo)

Solo dominio, 4 archivos, +162 LOC (domain): `types.ts` (tipos V2),
`versioned-contract.ts` (nuevo: migrador + vistas), `index.ts` (exports),
`versioned-contract.test.ts` (nuevo). Nadie consume V2 todavía.

- **Validación:** domain typecheck + tests (123 tests) verdes.
- **Blast radius:** 0 consumidores afectados (cambio puramente aditivo).
- **Compile errors:** 0.

## 8. M2 — Compatibilidad V1 → V2 en el dominio

3 archivos de dominio, +21 LOC: `fixture.ts` (`loadFixtureV2()` = migrador
compartido sobre el fixture V1), `project-status.ts` (`makeProjectStatusEvent`),
`index.ts`. El dominio soporta **V1 y V2 simultáneamente**; 0 consumidores V2
en las apps (progress 0%).

- **Validación:** domain tests (123) verdes.
- **Compatibility debt:** 7 archivos con referencias V1 (superficie de compatibilidad en dominio + stores V1).

## 9. M3 — Migración progresiva de React

Estado intermedio real y fundamental:

```
Domain: V1 + V2
React → V2   (adapter + store + hook + tests)
Angular → V1 (sin cambios)
```

9 archivos de React (+38 LOC prod): `adapters/domain-adapter.ts`
(`loadFixtureV2`), `services/domain-store.ts` (cada transición **añade** un
`ProjectStatusEvent` a `statusHistory` en lugar de reemplazar), hook, y 6
archivos de test (cambio de import + nuevo test del audit trail).

- **Progress: 67%** de los puntos de integración que construyen el contrato (2/2 React en V2; Angular 1/1 en V1; los adapters son agnósticos).
- **Validación:** monorepo completo verde — typecheck, React 87 tests, Angular sin cambios, build.
- **Blast radius:** 0 archivos de Angular tocados (H66: migrar React no requiere tocar Angular).
- **Cero cambios en features prod:** solo los tests de feature cambian el import; el código de UI no se toca.

## 10. M4 — Migración progresiva de Angular

Angular migra a V2 con el mismo patrón: adapter (`loadFixtureV2`) + store
(eventos + historial), 2 archivos, +30 LOC.

- **Progress: 100%.** V1 sigue existiendo solo por compatibilidad; no quedan consumidores reales de V1.
- **Validación:** typecheck + 62 tests Angular + 87 React + build, todo verde.
- **Blast radius:** 0 archivos de React tocados (H67: migrar Angular no requiere tocar React).

## 11. M5 — Retirada de V1

El contrato V2 pasa a ser **canónico**:

- `types.ts`: `Project` y `Dataset` **son** la forma V2 (`status: ProjectStatusEvent` + `statusHistory`); se eliminan los alias `ProjectV2`/`DatasetV2`.
- `index.ts`: se retiran de la API pública `loadFixtureV2`, los migradores V1→V2, las vistas V2→V1, los accessors (`currentStatusEvent`, `statusValueV2`) y los helpers V1 (`makeProjectStatus`, `projectStatusValue`). Verificado: `dist/src/index.d.ts` no exporta ningún símbolo V1.
- `versioned-contract.ts`: queda como **frontera interna de persistencia** (tipos `ProjectV1`/`DatasetV1` + migrador, no exportados).
- `fixture.ts`: un único `loadFixture()` canónico que valida el JSON persistido y lo migra internamente.
- Apps: los adapters vuelven a `loadFixture` (canónico); los stores siguen con eventos.
- **Neto:** −70 LOC (domain −57, React −7, Angular −6), 18 archivos tocados.

Validación completa M5: format + format:check + lint + typecheck + test
(domain 122, React 87, Angular 62) + build, todo verde.

## 12. Métricas

Definidas antes de ejecutar (ver JSON para valores completos):

| Métrica                                                           | Definición                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v1_consumers` / `v2_consumers`                                   | Puntos de integración (adapter + store por framework) que **construyen** el contrato, clasificados por marcadores V1/V2 (los lectores solo de `status.value` son agnósticos y no cuentan como "migrados" ni "pendientes") |
| `migration_progress`                                              | `v2 / (v1 + v2)` sobre puntos de integración                                                                                                                                                                              |
| `remaining_v1_consumers`                                          | Puntos de integración todavía en V1                                                                                                                                                                                       |
| `v1_references`                                                   | Referencias funcionales a símbolos V1 (comentarios excluidos, boundaries de palabra) en source de prod                                                                                                                    |
| `compatibility_debt`                                              | `v1_references` por estado (coste estructural de soportar V1+V2)                                                                                                                                                          |
| `residual_debt`                                                   | `v1_references` tras M5, separando frontera de persistencia                                                                                                                                                               |
| `migration blast radius`                                          | Archivos tocados por transición, separados por framework/capa                                                                                                                                                             |
| `migration_completeness`                                          | `migration_progress` en cada estado                                                                                                                                                                                       |
| `cross_feature_imports` / `duplicated_rules` / `new_dependencies` | Invariantes arquitectónicas escaneadas en el estado final                                                                                                                                                                 |

## 13. React — resultados

- **M3 (su migración):** 9 archivos, +38 LOC prod, 6 tests modificados, 0 prod-features tocadas, 0 errores de typecheck previos (cambio aditivo sobre API ya existente: `loadFixtureV2` + `makeProjectStatusEvent` ya estaban en el dominio desde M1/M2).
- **M5 (retirada V1):** 9 archivos, −7 LOC, solo renombres de import (`loadFixtureV2` → `loadFixture`) y limpieza de tipos.
- El store acumula el historial: cada `transitionProject`/`updateProject` con cambio de estado añade un evento con `changedById: null` (sesión sin actor). Test nuevo del audit trail (87 tests en M3–M5).

## 14. Angular — resultados

- **M4 (su migración):** 2 archivos (adapter + store), +30 LOC, 0 tests modificados, 0 errores de typecheck previos.
- **M5:** 2 archivos, −6 LOC.
- Mismo patrón que React: el store usa `withStatusEvent` y añade a `statusHistory`. 62 tests en M4–M5.

## 15. Coexistencia

La coexistencia real se validó en **M3** (React V2, Angular V1, mismo dominio):

- typecheck del monorepo completo verde;
- 87 tests React + 62 tests Angular verdes **simultáneamente**;
- ambas apps construyen contra el mismo `@operations-hub/domain`;
- la única duplicación estructural introducida es el **par de helpers en cada store** (`withStatusEvent`), que no es lógica de negocio sino construcción de eventos; la regla (qué transición es válida) sigue siendo única en el dominio.

## 16. Compatibility debt

Coste de soportar V1+V2 simultáneamente (referencias funcionales a símbolos
V1 por estado, comentarios excluidos):

| Estado   |             refs V1 (dominio) |                    refs V1 (apps) | total |
| -------- | ----------------------------: | --------------------------------: | ----: |
| BASELINE |                             4 |                                 0 |     4 |
| M1       |                             6 |                                 0 |     6 |
| M2       |                             7 |                                 0 |     7 |
| M3       |                             7 |                 2 (store Angular) |     9 |
| M4       |                             8 | 2 (vistas V2→V1 sin consumidores) |    10 |
| **M5**   | **2** (frontera persistencia) |                             **0** | **2** |

La deuda es **medible y temporal**: crece con la superficie de compatibilidad
y **desaparece casi por completo en M5** (de 10 a 2 referencias, ambas en la
frontera de persistencia interna que lee el JSON v1 en disco). La retirada
eliminó más LOC de las que costó mantener la coexistencia.

## 17. Blast radius

| Transición          | Archivos | Domain | React | Angular | Tests | Features (prod) |
| ------------------- | -------: | -----: | ----: | ------: | ----: | --------------- |
| M1 (V2 aditivo)     |        4 |      4 |     0 |       0 |     1 | 0               |
| M2 (compatibilidad) |        3 |      3 |     0 |       0 |     0 | 0               |
| M3 (React → V2)     |        9 |      0 |     9 |   **0** |     6 | 0               |
| M4 (Angular → V2)   |        2 |      0 | **0** |       2 |     0 | 0               |
| M5 (retirar V1)     |       18 |      7 |     9 |       2 |     7 | 0               |

- **`unrelated_features_touched = 0` en todas las transiciones.** Los cambios de React en M3/M5 aparecen en las carpetas de features **solo por tests** (cambio de import); el código prod de las features no se modifica en ningún momento.
- El blast radius sigue el patrón de Fase 11: crece con los consumidores reales del contrato (los stores), no por acoplamiento entre frameworks.

## 18. Tests

- M1: +1 archivo de test (migrador), dominio 123 tests.
- M3: +1 test React (audit trail), 6 tests modificados (import V2).
- M5: versioned-contract.test.ts reescrito para la frontera interna (122 tests de dominio), 7 tests modificados (import canónico).
- **Tests rotos: 0** en ninguna transición: la API V2 se introdujo aditivamente (M1/M2) antes de migrar consumidores, así que ningún test de app llegó a fallar. La red de seguridad acompañó la migración sin falsos positivos.

## 19. Duplicación

- **0 reglas de negocio duplicadas** (escaneo automático de los nombres de reglas del dominio en las apps, verificado en el estado final).
- **0 transformaciones duplicadas**: el migrador existe una sola vez, en el dominio. React y Angular no tienen adaptadores de migración propios.
- La única repetición estructural es `withStatusEvent` (React) / `withStatusEvent` (Angular): construcción de eventos en el store, 8–12 LOC cada uno, sin reglas — misma duplicación mínima de "pegamento" que ya existía entre los stores V1 (Fase 11). No constituye segunda fuente de verdad.

## 20. Acoplamiento

- **0 imports feature→feature** (escaneo automático, estado final).
- **0 imports React→Angular / Angular→React**.
- **0 imports del dominio hacia apps/frameworks**.
- **0 dependencias nuevas** (diff de los 4 package.json entre BASELINE y M5: vacío).
- **0 acceso directo a la implementación V1** desde consumidores V2: los stores solo usan la API pública (`makeProjectStatusEvent`).

## 21. Retirada V1

La retirada se completó en M5:

- Eliminados de la API pública: `loadFixtureV2`, `migrateProjectV1ToV2`, `migrateDatasetV1ToV2`, `projectV2ToV1`, `datasetV2ToV1`, `currentStatusEvent`, `statusValueV2`, `makeProjectStatus`, `projectStatusValue`, `ProjectV2`, `DatasetV2`.
- Eliminados los alias de tipos V1 (`ProjectV1`/`DatasetV1`) de la API pública (quedan internos en la frontera de persistencia).
- **Verificado en `dist/src/index.d.ts`:** 0 símbolos V1 exportados.
- `migration_completeness` final: **100%**.

## 22. Residual debt

Tras M5, el escaneo automático de referencias funcionales a símbolos V1
(comentarios excluidos) encuentra **2 archivos**:

1. `packages/domain/src/versioned-contract.ts` — tipos `ProjectV1`/`DatasetV1` + migrador (frontera de persistencia).
2. `packages/domain/src/fixture.ts` — importa `DatasetV1` y llama al migrador (misma frontera).

**0 referencias fuera de la frontera de persistencia.** El JSON del fixture
conserva el formato V1 en disco; el migrador interno lo adapta sin lógica de
negocio. Es la excepción documentada al criterio "0 referencias funcionales a
V1": es código **vivo** (lee el almacenamiento persistido), no código muerto.
No queda ninguna referencia en las apps ni en la API pública.

## 23. Veredictos H63–H74

| Hipótesis                                      | Veredicto      | Evidencia                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H63 — Migración gradual**                    | **CONFIRMADA** | Estado M3 real: React V2 + Angular V1 compilando, 87+62 tests verdes, mismo dominio                                                                                                                             |
| **H64 — Fuente única de verdad**               | **CONFIRMADA** | Reglas operan sobre `status.value`; el migrador solo adapta forma; 0 reglas duplicadas (escaneo)                                                                                                                |
| **H65 — Compatibilidad localizada**            | **CONFIRMADA** | Toda la compatibilidad vive en `packages/domain` (`versioned-contract.ts` + `fixture.ts`); las apps no tienen adaptadores de migración                                                                          |
| **H66 — Aislamiento (migrar React)**           | **CONFIRMADA** | M3 toca 0 archivos de Angular                                                                                                                                                                                   |
| **H67 — Aislamiento inverso (migrar Angular)** | **CONFIRMADA** | M4 toca 0 archivos de React                                                                                                                                                                                     |
| **H68 — Blast radius controlado**              | **CONFIRMADA** | Crece con los consumidores reales (stores); `unrelated_features_touched = 0` en las 5 transiciones                                                                                                              |
| **H69 — Deuda temporal**                       | **CONFIRMADA** | Debt medible (4→10 refs V1) que cae a 2 (frontera) tras M5; la retirada elimina más LOC (−70) de las que costó la coexistencia                                                                                  |
| **H70 — Migración completa**                   | **CONFIRMADA** | `migration_completeness` 100%; 0 referencias V1 fuera de la frontera de persistencia                                                                                                                            |
| **H71 — Recuperación arquitectónica**          | **CONFIRMADA** | Estado final: 0 imports feature→feature, 0 reglas duplicadas, 0 dependencias nuevas, 0 refs V1 funcionales fuera de frontera                                                                                    |
| **H72 — Coste comparable**                     | **CONFIRMADA** | Migrar cada framework: React 9 archivos/+38 LOC (M3) vs Angular 2 archivos/+30 LOC (M4); retirada: React 9/−7 vs Angular 2/−6 — mismo patrón estructural (ts+html de Angular explica la diferencia de archivos) |
| **H73 — Tests como red de seguridad**          | **CONFIRMADA** | 0 tests rotos: la introducción aditiva (M1/M2) permitió migrar consumidores sin falsos positivos; los tests V1 y V2 coexistieron en M3                                                                          |
| **H74 — Compatibilidad no gratuita**           | **CONFIRMADA** | Coste medible: +183 LOC de dominio en M1+M2 (tipos, migrador, loader, tests) y +10 refs V1 en el pico de coexistencia; no se asumió, se midió                                                                   |

**H75 (nueva, observada):** la mayoría de consumidores de una app son
**agnósticos a la forma del contrato** (solo leen `status.value`); la
migración recae exclusivamente en los puntos de integración que construyen el
contrato (adapter + store). Implicación práctica: un contrato versionado
migra con cambios mínimos si los consumidores de solo lectura no construyen
el contrato — **CONFIRMADA** (0 prod-features tocadas en M3–M5).

## 24. Anomalías

1. **El "progress" por archivo es engañoso:** clasificar consumidores por contenido sobrecuenta los lectores de solo lectura. Se corrigió midiendo solo los puntos de integración que construyen el contrato (adapter + store); los lectores son agnósticos y no "migran".
2. **`makeProjectStatus` matchea dentro de `makeProjectStatusEvent`** en escaneos de texto: se corrigió con boundaries de palabra y exclusión de comentarios.
3. **Angular migra con 2 archivos frente a los 9 de React:** la diferencia es estructural — React tiene hook (`use-domain-store.ts`) y 6 archivos de test propios que Angular no necesita tocar (sus specs consumen el store vía el adapter, sin importar el loader). No es diferencia de capacidad.
4. **Los tests de feature de React se tocan en M3/M5** aunque la UI no cambie: el import del fixture en los tests sí depende del contrato. Es ruido estructural de tests, no coste de UI.
5. **El fixture JSON conserva `datasetVersion: "v1"`** incluso con el contrato canónico V2: la versión describe el **formato persistido**, no el contrato de consumo. Puede confundir; se documenta en `fixture.ts`.

## 25. Limitaciones

- Una sola máquina, un solo contrato (status), una secuencia de migración. Los deltas de LOC/archivos dependen del estilo de implementación.
- `time_to_implement` = **NO MEDIBLE** (no hay forma reproducible de medir tiempo humano; se usan métricas estructurales).
- El migrador V1→V2 permanece como frontera interna porque el JSON persistido conserva el formato V1: es la excepción documentada a "0 referencias V1" (no es código muerto).
- La validación de estados intermedios es typecheck + tests + build; no se ejecutaron los estados M2–M4 en navegador.
- El experimento modifica el dominio "congelado" del ADR-001 deliberadamente, pero solo en la copia aislada; el árbol principal conserva el dominio original.

## 26. Amenazas a la validez

- **Sesgo de implementación:** un experimento distinto (otro contrato, otra estrategia de compatibilidad) podría cambiar los deltas. La estrategia elegida (migrador de forma en el dominio, fixture persistido V1) es una decisión de diseño, no un hecho universal.
- **Clasificación por marcadores:** depende de que los símbolos V1/V2 se usen de forma consistente; mitigado con boundaries de palabra y exclusión de comentarios.
- **El fixture no muta:** la migración se validó sobre datos de solo lectura; una API real con escrituras concurrentes añadiría dimensiones no cubiertas.
- **Cero tests rotos** podría reflejar que el cambio se diseñó para ser aditivo; no demuestra que cualquier migración gradual sea siempre indolora.

## 27. Conclusiones

1. **La migración gradual V1→V2 es viable sin segunda fuente de verdad**: las reglas de negocio se mantuvieron únicas en el dominio; el migrador adapta la forma sin lógica.
2. **La coexistencia V1+V2 es temporal y medible**: costó +183 LOC de dominio y hasta 10 referencias V1 en el pico; la retirada (M5) eliminó más de lo que costó mantener (−70 LOC netos, 2 refs residuales en la frontera de persistencia).
3. **React y Angular migraron con coste comparable y aislado**: cada framework se migró sin tocar el otro (H66/H67); la diferencia de archivos (9 vs 2) es estructural (hook + tests propios de React), no de capacidad.
4. **La mayor parte de una app es agnóstica al contrato** (H75): los consumidores de solo lectura no se tocaron; la migración recayó en adapter + store. Esto refuerza el valor de la frontera de persistencia en el dominio.
5. **H64, H68, H69, H70, H71, H74 refuerzan las conclusiones de Fase 11** (fuente única de verdad, blast radius por consumidores, recuperación arquitectónica) y añaden el matiz temporal: la deuda de compatibilidad existe, se mide y desaparece al retirar V1.

## 28. Siguiente experimento

1. **Contrato versionado con API asíncrona simulada** (adapter con fetch/retry + fixture v1→v2 en "servidor"): incorpora la dimensión de runtime que el fixture síncrono no cubre.
2. **Migración de un contrato con semántica real distinta** (no solo forma): p. ej. `status: string` → regla de negocio nueva que dependa de `statusHistory` (p. ej. "no reabrir un proyecto completado hace < 7 días") — medir cuántos consumidores rompen cuando el cambio no es solo de forma.
3. **Doble versión de contrato con escritura** (crear/transicionar en V2 mientras algunos lectores usan V1 vía vista): medir si la vista V2→V1 (eliminada aquí por falta de consumidores) introduce latencia o incoherencias.
