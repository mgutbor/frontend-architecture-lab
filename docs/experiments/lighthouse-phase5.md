# Fase 5.9 — Lighthouse / Chromium: evaluación de H8

## 1. Objetivo

Evaluar la hipótesis H8 con Lighthouse real sobre los builds de producción de **React Monolith** (Fase 4) y **Angular Monolith** (Fase 5), que implementan exactamente el mismo contrato funcional.

Esta fase desbloquea la evaluación de accesibilidad y rendimiento percibido que había quedado pendiente en Fases 4.1 y 5.1 por el bloqueo del navegador headless. No se modifica ningún código funcional: solo se sirven los builds de producción existentes y se ejecuta Lighthouse sobre ellos.

## 2. H8 original

> **H8 — Accesibilidad**: Ambas implementaciones deberían poder alcanzar resultados equivalentes de accesibilidad porque implementan exactamente el mismo contrato ACC-1…8.
>
> Estado previo: _pendiente debido al bloqueo de Chrome headless documentado en Fase 4.1_.

Enunciado operativo de esta fase (Fase 5.9): _React y Angular ofrecen resultados equivalentes en accesibilidad y rendimiento percibido cuando implementan exactamente el mismo contrato funcional._

Criterio de validación (definido en el enunciado de la fase):

- **CONFIRMADA**: resultados suficientemente equivalentes; sin diferencia material consistente; accesibilidad equivalente.
- **REFUTADA**: diferencia material, reproducible y atribuible al framework/implementación (especialmente Performance o Accessibility consistentes).
- **NO CONCLUYENTE**: resultados inestables, entorno no controlable, diferencias demasiado pequeñas para separar de ruido, o cobertura insuficiente.

## 3. Entorno

| Componente       | Valor                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Máquina          | Apple M1, 8 núcleos, 16 GB RAM, macOS darwin-arm64                                                                                                       |
| Node             | v25.3.0                                                                                                                                                  |
| Builds evaluados | React `apps/react-app/dist` (233 547 B JS raw, verificado) · Angular `apps/angular-app/dist/angular-app/browser` (179 634 B JS raw, verificado)          |
| Servidores       | Estáticos equivalentes: misma implementación Node `http`, puertos distintos (React 4173, Angular 4174), fallback SPA a `index.html`                      |
| Navegador        | `chrome-headless-shell` (Chrome for Testing 151.0.7922.34) desde el cache de Playwright (`~/Library/Caches/ms-playwright/chromium_headless_shell-1234/`) |
| Lighthouse       | 13.4.1 (CLI localizado en el cache de npx, sin instalación nueva)                                                                                        |

### 3.1 Desbloqueo del entorno Chromium (resolución del bloqueo de Fases 4.1/5.1)

El bloqueo histórico se reproduce y se diagnostica:

1. El binario **completo** de Chrome (`/Applications/Google Chrome.app`) con `--headless` produce el DOM correcto pero **no termina el proceso** (se cuelga tras escribir la salida), con el aviso _"Trying to load the allocator multiple times"_ — mismo patrón documentado en Fases 4.1/5.1. Lighthouse con este binario falla con _"Chrome prevented page load with an interstitial"_.
2. El binario **`chrome-headless-shell`** (el que usan Lighthouse/Playwright, presente en el cache de `ms-playwright`) **funciona correctamente**: `--dump-dom` sobre HTTP termina solo, y Lighthouse completa ejecuciones completas sobre ambas aplicaciones.

Conclusión del diagnóstico: el bloqueo de Fases 4.1/5.1 era una **limitación del binario Chrome completo en este entorno**, no de las aplicaciones ni de la metodología. Se resuelve usando el binario que Lighthouse busca por defecto. No se ha modificado ninguna aplicación para sortearlo.

## 4. Versiones

| Herramienta           | Versión                          | Cómo se obtuvo                                         |
| --------------------- | -------------------------------- | ------------------------------------------------------ |
| Node                  | v25.3.0                          | `node --version`                                       |
| Lighthouse            | 13.4.1                           | cache de npx (`~/.npm/_npx/*/node_modules/lighthouse`) |
| chrome-headless-shell | Chrome for Testing 151.0.7922.34 | cache de Playwright                                    |
| React                 | (sin cambios)                    | build existente `apps/react-app`                       |
| Angular               | (sin cambios)                    | build existente `apps/angular-app`                     |

No se ha instalado ni añadido ninguna dependencia al repositorio.

## 5. Metodología

Siguiendo `metrics.md §3.4` (metodología aprobada):

- **Performance / Core Web Vitals**: perfil **móvil** (viewport 412×823, DPR 3, throttling simulado por defecto de Lighthouse).
- **Accessibility / Best Practices / SEO**: perfil **desktop** (preset `desktop`).
- **3 ejecuciones por aplicación y perfil** (12 ejecuciones totales); se reporta **mediana y rango**.
- Ambas aplicaciones servidas desde sus **builds de producción oficiales** por servidores estáticos equivalentes (misma implementación, puertos distintos).
- Misma máquina, misma sesión, mismo Node, mismo binario de Chrome, misma configuración de Lighthouse.

Métricas recogidas por ejecución: Performance, Accessibility, Best Practices y SEO (score 0–1); FCP, LCP, Speed Index, TBT, CLS y TTI (numericValue); audits de accesibilidad fallidos; errores de runtime de Lighthouse.

## 6. Configuración Lighthouse

```text
lighthouse <url> --quiet --output=json --output-path=<archivo>
  perfil móvil:   --chrome-flags=--no-sandbox --disable-gpu          (default mobile)
  perfil desktop: --preset=desktop --chrome-flags=--no-sandbox --disable-gpu
CHROME_PATH=<chrome-headless-shell>
```

Ejecución reproducida por `scripts/run-lighthouse-phase5.mjs` (cero dependencias: solo built-ins de Node; localiza Lighthouse y el headless-shell automáticamente, levanta los servidores estáticos, ejecuta las 12 mediciones y escribe el JSON de evidencia).

## 7. URLs evaluadas

| Aplicación       | URL                      | Build                                       |
| ---------------- | ------------------------ | ------------------------------------------- |
| React Monolith   | `http://127.0.0.1:4173/` | `apps/react-app/dist`                       |
| Angular Monolith | `http://127.0.0.1:4174/` | `apps/angular-app/dist/angular-app/browser` |

Ambas sirven la ruta raíz (Dashboard) — el mismo punto de entrada del contrato, misma estructura semántica (landmarks, navegación, contenido del dashboard).

## 8. React — resultados

### Móvil (3 ejecuciones)

| Métrica     |   Ej. 1 |   Ej. 2 |   Ej. 3 |     Mediana |     Rango |
| ----------- | ------: | ------: | ------: | ----------: | --------: |
| Performance |    0.97 |    0.97 |    0.97 |    **0.97** | 0.97–0.97 |
| FCP         | 2147 ms | 2101 ms | 2101 ms | **2101 ms** | 2101–2147 |
| LCP         | 2147 ms | 2101 ms | 2101 ms | **2101 ms** | 2101–2147 |
| Speed Index | 2147 ms | 2101 ms | 2101 ms | **2101 ms** | 2101–2147 |
| TBT         |    0 ms |    0 ms |    0 ms |    **0 ms** |       0–0 |
| CLS         |       0 |       0 |       0 |       **0** |       0–0 |
| TTI         | 2147 ms | 2101 ms | 2101 ms | **2101 ms** | 2101–2147 |

### Desktop (3 ejecuciones)

| Métrica        |             Mediana |     Rango |
| -------------- | ------------------: | --------: |
| Performance    |            **1.00** |       1–1 |
| Accessibility  |            **1.00** |       1–1 |
| Best Practices |            **1.00** |       1–1 |
| SEO            |            **0.82** | 0.82–0.82 |
| FCP / LCP      | **441 ms** / 441 ms |   441–500 |

## 9. Angular — resultados

### Móvil (3 ejecuciones)

| Métrica     |   Ej. 1 |   Ej. 2 |   Ej. 3 |     Mediana |     Rango |
| ----------- | ------: | ------: | ------: | ----------: | --------: |
| Performance |    0.99 |    0.99 |    0.99 |    **0.99** | 0.99–0.99 |
| FCP         | 1710 ms | 1710 ms | 1710 ms | **1710 ms** | 1710–1710 |
| LCP         | 1860 ms | 1860 ms | 1860 ms | **1860 ms** | 1860–1860 |
| Speed Index | 1710 ms | 1710 ms | 1710 ms | **1710 ms** | 1710–1710 |
| TBT         |    1 ms |    0 ms |    0 ms |    **0 ms** |       0–1 |
| CLS         |       0 |       0 |       0 |       **0** |       0–0 |
| TTI         | 1889 ms | 1860 ms | 1860 ms | **1860 ms** | 1860–1889 |

### Desktop (3 ejecuciones)

| Métrica        |             Mediana |             Rango |
| -------------- | ------------------: | ----------------: |
| Performance    |            **1.00** |               1–1 |
| Accessibility  |            **1.00** |               1–1 |
| Best Practices |            **1.00** |               1–1 |
| SEO            |            **0.82** |         0.82–0.82 |
| FCP / LCP      | **361 ms** / 401 ms | 360–420 / 400–460 |

## 10. Comparación

### Scores (mediana de 3)

| Métrica        |  Perfil |    React |  Angular | Δ Angular−React |
| -------------- | ------: | -------: | -------: | --------------: |
| Performance    |   móvil |     0.97 | **0.99** |           +0.02 |
| Accessibility  | desktop | **1.00** | **1.00** |               0 |
| Best Practices | desktop | **1.00** | **1.00** |               0 |
| SEO            | desktop |     0.82 |     0.82 |               0 |
| Performance    | desktop |     1.00 |     1.00 |               0 |

### Core Web Vitals móvil (mediana)

| Métrica     |   React |     Angular | Δ Angular−React |
| ----------- | ------: | ----------: | --------------: |
| FCP         | 2101 ms | **1710 ms** |         −391 ms |
| LCP         | 2101 ms | **1860 ms** |         −241 ms |
| Speed Index | 2101 ms | **1710 ms** |         −391 ms |
| TBT         |    0 ms |        0 ms |            0 ms |
| CLS         |       0 |           0 |               0 |
| TTI         | 2101 ms | **1860 ms** |         −241 ms |

### Observaciones de la comparación

- **Accesibilidad, Best Practices, SEO y rendimiento desktop: idénticos** (1.00/1.00/0.82/1.00 en ambos).
- La única diferencia observada es **Performance móvil: Angular 0.99 vs React 0.97**, consistente en las 3 ejecuciones, asociada a un FCP ~390 ms más temprano.
- En React, FCP = LCP = SI = TTI (~2101 ms): todo el contenido se pinta en un único momento tras ejecutar el JS. En Angular, FCP (1710 ms) precede a LCP (1860 ms): el elemento LCP se pinta algo después del primer pintado.
- La diferencia es **reproducible** (3/3 idénticas por app), pero **pequeña** (2 puntos de score; ambos en zona verde ≥ 90). No se considera **material** según el criterio de la fase: no cambiaría una decisión, y el experimento solo cubre primera carga estática en localhost.

## 11. Accessibility audits

- **Audits fallidos: 0 en ambas aplicaciones** (en las 12 ejecuciones). Accessibility = 100 en ambas.
- React y Angular pasan todos los audits de accesibilidad de Lighthouse (Lighthouse 13.4.1): landmarks, nombres accesibles, contraste, aria, orden de tabulación, etc.
- Esto es coherente con la implementación del contrato ACC-1…8 en ambas apps y con los tests de accesibilidad estática ya existentes.

## 12. Performance

- Ambas aplicaciones obtienen scores verdes altos (React 0.97, Angular 0.99 móvil; 1.00 ambas en desktop).
- TBT = 0 ms y CLS = 0 en ambas: sin bloqueo del hilo principal ni desplazamiento de layout medibles en la primera carga.
- La diferencia FCP (~390 ms) es consistente pero pequeña y dentro del mismo orden de magnitud. **No se atribuye causalidad**: es una hipótesis razonable que el bundle menor de Angular (179,6 kB vs 233,5 kB raw) reduzca el tiempo de parse/ejecución, pero este experimento no aísla esa causa (requeriría un experimento controlado tipo Fase 5.5/5.6 sobre JS, no sobre HTML).

## 13. Variabilidad entre ejecuciones

- **React**: 3/3 ejecuciones idénticas en score y CWV por perfil (determinista en este entorno).
- **Angular**: 3/3 idénticas en score y CWV por perfil (TBT varió 0–1 ms en una ejecución móvil; TTI 1860–1889 ms).
- La variabilidad es **nula o mínima** (≤ 1 ms en una métrica). Las diferencias entre frameworks son > 10× mayores que la variabilidad intra-framework, por lo que la diferencia observada (0.97 vs 0.99) no es ruido de medición — pero sigue siendo pequeña en magnitud.

## 14. Limitaciones

1. **Solo primera carga estática**: no se miden interacciones (navegación por estado, CRUD de tareas/proyectos, formularios), que son donde podrían aparecer diferencias de rendimiento de framework.
2. **localhost sin red real**: sin latencia ni ancho de banda reales; el throttling de Lighthouse es simulado.
3. **Sin data loading real**: ambas apps usan el fixture en memoria; no se mide fetching ni rendering de datos remotos.
4. **Un solo punto de entrada** (Dashboard). El resto de áreas comparten runtime y solo difieren en features no medidas.
5. **SEO no evaluable en este entorno**: el score 0.82 idéntico en ambas se debe a artefactos del servidor estático (sin `meta description`, `/robots.txt` servido como HTML), no al framework. Dato secundario.
6. **Entorno de un solo binario**: solo se probó `chrome-headless-shell` 151 (el único headless funcional). No hay comparación multi-navegador.

## 15. Amenazas a la validez

- **Orden de ejecución**: React se midió primero en todas las sesiones; aunque los procesos se matan entre ejecuciones, no se puede descartar completamente calentamiento del sistema. El orden se mantuvo constante y las ejecuciones fueron deterministas, lo que sugiere efecto despreciable.
- **Throttling simulado**: el rendimiento absoluto (ms) depende del modelo de simulación de Lighthouse; la comparación relativa entre frameworks es válida porque usan el mismo modelo.
- **Atribución de la diferencia de perf**: la diferencia FCP podría deberse al tamaño de bundle, a la estrategia de render (CSR puro en ambos), o a diferencias de toolchain. **No está aislada**; solo se reporta el hecho medido.
- **Cobertura de interacción nula**: cualquier conclusión sobre "rendimiento percibido" queda limitada a primera carga.

## 16. Estado de H8

**H8: CONFIRMADA** (con limitaciones documentadas).

- **Accesibilidad**: equivalente — 100/100 en ambas, 0 audits fallidos en 12 ejecuciones. Criterio cumplido de forma idéntica.
- **Rendimiento percibido (primera carga)**: suficientemente equivalente — ambas en zona verde alta (0.97 / 0.99 móvil; 1.00 / 1.00 desktop). La diferencia de 2 puntos es reproducible pero **pequeña y no material** según el criterio de la fase (no es una diferencia que invalide la equivalencia ni que pueda atribuirse a una causa concreta con la evidencia disponible).
- No hay ninguna diferencia **material y atribuible** que justifique REFUTADA; los resultados son estables, no ruidosos, y el entorno es controlado, por lo que tampoco procede NO CONCLUYENTE.

Matiz importante: la confirmación cubre **accesibilidad (fuerte, evidencia idéntica)** y **rendimiento de primera carga (débil, diferencia pequeña no material y sin aislamiento causal)**. No cubre rendimiento bajo interacción.

## 17. Conclusión crítica

**HECHO MEDIDO**

- Accessibility: 100/100 en ambas, 0 audits fallidos (12/12 ejecuciones).
- Best Practices y SEO: idénticos (1.00 y 0.82 respectivamente; el SEO por artefactos del servidor estático, no del framework).
- Performance móvil: React 0.97, Angular 0.99 (mediana, 3/3 deterministas); FCP 2101 vs 1710 ms; LCP 2101 vs 1860 ms; TBT 0 vs 0; CLS 0 vs 0.
- Performance desktop: 1.00 en ambas; FCP 441 vs 361 ms.

**INFERENCIA**

- La diferencia de Performance móvil es reproducible y su magnitud (>10× la variabilidad intra-framework) indica que no es ruido de medición.
- Es plausible que el menor bundle de Angular reduzca el tiempo hasta el primer pintado, pero **no está demostrado** por este experimento.

**HIPÓTESIS**

- La diferencia FCP podría explicarse por tamaño de JS (179,6 vs 233,5 kB), por la cantidad de trabajo de render inicial, o por diferencias de toolchain. No aislada.

**NO SABEMOS**

- Cómo se comportan ambas bajo interacción (navegación, CRUD, formularios).
- Si la diferencia de perf persiste con red real, con datos remotos, o en otros navegadores.
- Si la diferencia FCP es atribuible al framework o a la implementación concreta (bundle, estructura HTML).

**El bloqueo de Fases 4.1/5.1 queda resuelto** como limitación del binario Chrome completo; con `chrome-headless-shell` la metodología Lighthouse aprobada es ejecutable de forma reproducible en este entorno.

## 18. Reproducibilidad

- **Script**: `scripts/run-lighthouse-phase5.mjs` (cero dependencias nuevas; Node built-ins).
- **Comando**: `pnpm lighthouse:phase5`.
- **Salida**: `docs/experiments/results/lighthouse-phase5.json` — 12 ejecuciones completas (3 móvil + 3 desktop por app), scores, CWV, audits fallidos, entorno y método.
- **Determinismo**: las 12 ejecuciones son byte-deterministas en scores y CWV dentro de cada app/perfil; el script reutiliza artefactos JSON ya válidos si se re-ejecuta (idempotente).
- **Condiciones**: requiere `chrome-headless-shell` en el cache de Playwright y Lighthouse en el cache de npx (ambos detectados automáticamente; el script aborta con instrucciones claras si faltan).

## 19. Próximo experimento recomendado

1. **Rendimiento bajo interacción (user flows)**: ejecutar Lighthouse `user flows` sobre los flujos del contrato (navegación por áreas, crear tarea, transiciones, búsqueda/filtros) en ambas apps. Es la dimensión de rendimiento percibido que este experimento no cubre y la más probable de revelar diferencias reales de framework (estrategias de detección de cambios, reconciliation vs signals).
2. **Evolución del laboratorio (Fase 6)**: coste incremental de añadir una nueva feature/regla/entidad al contrato en ambas arquitecturas — cierra H6/H7 (DX y código) que siguen sin evidencia experimental directa.
3. **Lighthouse en CI/Chromium** (si se quiere robustez multi-entorno): repetir esta metodología en un contenedor Linux para confirmar que la diferencia de perf móvil persiste fuera de esta máquina.
