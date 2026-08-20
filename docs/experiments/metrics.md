# Metodología de métricas

- **Estado:** Aprobado (Fase 0.1 — Specification Hardening)
- **Documentos relacionados:** [Scorecard](../comparisons/scorecard.md), [Contrato funcional](../architecture/functional-contract.md), [Dataset común](../architecture/dataset.md)

Este documento define **cómo** se miden y evalúan los experimentos. Las métricas se dividen en **dos categorías que no se mezclan**:

- **A. Métricas objetivas:** mediciones reproducibles (tamaño de bundle, tiempos, Lighthouse, conteos).
- **B. Criterios cualitativos:** evaluación por rúbrica con indicadores observables (mantenibilidad, DX, autonomía, complejidad).

Nunca se presenta un juicio cualitativo como si fuera una medición objetiva (ver [Scorecard](../comparisons/scorecard.md) §3).

---

## 1. Enfoque general

El laboratorio produce **mediciones comparativas de ingeniería**, no benchmarks científicamente exactos. Por eso:

- Se documentan el entorno, el procedimiento y las limitaciones de cada medición.
- Se reporta mediana y rango de varias ejecuciones, no un único valor puntual.
- No se hacen afirmaciones de exactitud científica.

## 2. Entorno de referencia

Toda medición registra el entorno real en que se tomó. Para que una comparación sea válida, el entorno debe ser **constante entre experimentos**:

| Variable           | Requisito                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Hardware           | Misma máquina para todos los experimentos de una comparación (o el mismo tipo de runner de CI). Se documentan CPU, RAM y SO. |
| Node.js            | Misma versión (documentada; se recomienda la versión LTS fijada en CI).                                                      |
| Gestor de paquetes | pnpm, versión documentada.                                                                                                   |
| Dataset            | Misma versión del fixture (`operations-hub-v1.json`) para todos los experimentos.                                            |
| Modo de build      | Producción en todos los casos.                                                                                               |
| Navegador          | Chromium, versión documentada.                                                                                               |
| Supuestos de red   | Mediciones locales sin red para datos (TR-1); Lighthouse con su throttling simulado por defecto.                             |
| Procedimiento      | El mismo procedimiento de captura para todos los experimentos (sección 6).                                                   |

Si no se puede mantener la igualdad exacta (p. ej. runner distinto), se **documenta la limitación** y se marca la comparación como afectada.

## 3. A. Métricas objetivas

Para cada métrica se define: qué se mide, por qué importa, cómo se mide, cuándo, qué entorno y sus limitaciones.

### 3.1 Tamaño de bundle

| Aspecto      | Definición                                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Tamaño de los activos JavaScript de producción generados por el build de producción.                                                                                                                                                                                                   |
| Por qué      | Coste de descarga; revela el peso estructural de cada arquitectura (frameworks, runtime, code splitting).                                                                                                                                                                              |
| Cómo         | Ejecutar el build de producción del experimento y recolectar los activos JS emitidos. Se reporta: total sin comprimir, total gzip y desglose por activo (p. ej. entrada principal, vendor, chunks). El comando exacto se fija en la implementación de cada experimento y se documenta. |
| Cuándo       | Una vez por ciclo de comparación, cuando la implementación está estabilizada.                                                                                                                                                                                                          |
| Entorno      | Entorno de referencia (sección 2).                                                                                                                                                                                                                                                     |
| Limitaciones | El tamaño no representa el rendimiento en runtime; las arquitecturas difieren en estrategias de code splitting; se comparan totales y estructura, no solo el número «mágico».                                                                                                          |

### 3.2 Tiempo de build

| Aspecto      | Definición                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Tiempo de pared del build de producción desde un estado limpio (sin directorio de salida).                                                                                   |
| Por qué      | Fricción de desarrollo y CI; coste de iteración.                                                                                                                             |
| Cómo         | Eliminar la salida previa, ejecutar el build de producción y cronometrar. 3 ejecuciones; se reporta mediana y rango. Se documenta si el build usa cachés (caliente vs frío). |
| Cuándo       | Por ciclo de comparación.                                                                                                                                                    |
| Entorno      | Entorno de referencia.                                                                                                                                                       |
| Limitaciones | Depende del hardware; los sistemas de caché (Turborepo, bundlers) pueden enmascarar diferencias; es una métrica de desarrollo, no de usuario final.                          |

### 3.3 Tiempo de ejecución de pruebas

| Aspecto      | Definición                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Tiempo de pared de la suite de pruebas completa del experimento.                                                           |
| Por qué      | Calidad del bucle de retroalimentación (feedback loop).                                                                    |
| Cómo         | Ejecutar la suite completa (unitarias y e2e **por separado**) en el entorno de referencia; 3 ejecuciones; mediana y rango. |
| Cuándo       | Por ciclo de comparación.                                                                                                  |
| Entorno      | Entorno de referencia; e2e en el navegador fijado.                                                                         |
| Limitaciones | Sensible a la carga de la máquina y al paralelismo configurado; la flakiness debe documentarse.                            |

### 3.4 Lighthouse

| Aspecto      | Definición                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Puntuaciones de las categorías Performance, Accessibility, Best Practices y SEO.                                                                                                                                                                                                                                                         |
| Por qué      | Señal estandarizada de rendimiento percibido y de calidad web; complementa a las demás métricas.                                                                                                                                                                                                                                         |
| Cómo         | Ejecutar Lighthouse local sobre las vistas principales. **Conjunto mínimo de páginas:** Dashboard y Projects (lista); el conjunto completo se enumera en cada documento de comparación **antes** de medir. **Perfiles:** Performance sobre perfil móvil (throttling simulado); Accessibility, Best Practices y SEO sobre perfil desktop. |
| Cuándo       | Por ciclo de comparación.                                                                                                                                                                                                                                                                                                                |
| Entorno      | Navegador Chromium fijado; sin red para datos.                                                                                                                                                                                                                                                                                           |
| Limitaciones | Condiciones de laboratorio y throttling simulado; no es rendimiento de campo (field data); las puntuaciones pueden variar entre ejecuciones.                                                                                                                                                                                             |

### 3.5 Número de dependencias

| Aspecto      | Definición                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Conteo de dependencias: directas de producción, directas de desarrollo y total transitivas.                                                          |
| Por qué      | Superficie de suministro (supply chain), coste de mantenimiento y de auditoría.                                                                      |
| Cómo         | Contar desde el lockfile del workspace (o `pnpm list` con profundidad completa), separando runtime y dev. Se reportan los tres conteos por separado. |
| Cuándo       | Por ciclo de comparación, sobre el estado del repositorio en `main`.                                                                                 |
| Entorno      | No aplica (análisis estático).                                                                                                                       |
| Limitaciones | El conteo no equivale a riesgo ni complejidad; las dependencias opcionales/peer varían según el ecosistema.                                          |

### 3.6 Número de paquetes

| Aspecto      | Definición                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Qué          | Número de paquetes de workspace (aplicaciones y paquetes) del monorepo.                                                                |
| Por qué      | Complejidad estructural del monorepo y de su orquestación.                                                                             |
| Cómo         | Contar los `package.json` miembros del workspace bajo `apps/` y `packages/`.                                                           |
| Cuándo       | Por ciclo de comparación.                                                                                                              |
| Entorno      | No aplica (análisis estático).                                                                                                         |
| Limitaciones | Un número mayor no es necesariamente peor: las arquitecturas de microfrontends añaden paquetes por diseño; se interpreta con contexto. |

## 4. B. Criterios cualitativos

Se evalúan con una **rúbrica** (ver [Scorecard](../comparisons/scorecard.md)) sobre **indicadores observables**. En esta fase se definen los indicadores; las puntuaciones se asignan durante la evaluación, nunca de forma arbitraria.

### 4.1 Mantenibilidad

Indicadores observables:

- Acoplamiento: dirección y número de dependencias entre módulos.
- Separación de responsabilidades: módulos con responsabilidad única y límites claros.
- Límites de dependencia: ausencia de dependencias circulares; las capas dependen en una sola dirección.
- Facilidad de modificar una funcionalidad: nº de archivos y módulos que hay que tocar para un cambio de referencia (p. ej. añadir un filtro).
- Descubribilidad del código: estructura predecible; un desarrollador nuevo localiza una funcionalidad sin ayuda.
- Testabilidad: capacidad de probar unidades y flujos sin infraestructura externa.

### 4.2 Experiencia de desarrollo (DX)

Indicadores observables:

- Tiempo de onboarding: pasos documentados y funcionales para ejecutar el experimento localmente.
- Bucle de retroalimentación: tiempos de build y pruebas (cruzados con métricas objetivas 3.2 y 3.3).
- Soporte de tooling: autocompletado, depuración, errores claros (lenguaje del framework y sus herramientas).
- Claridad de errores: mensajes de compilación y runtime accionables.

### 4.3 Autonomía de equipo

Indicadores observables:

- Límites de propiedad: un equipo puede cambiar su área sin coordinación con otros equipos.
- Independencia de despliegue: capacidad de publicar cambios de forma independiente (relevante sobre todo en microfrontends).
- Superficie de coordinación: número de contratos compartidos que un cambio debe respetar.

### 4.4 Complejidad arquitectónica

Indicadores observables:

- Número de conceptos a aprender para contribuir (runtime, estado, routing, tooling).
- Capas de indirección: cuántos saltos hay entre un evento de UI y el cambio de estado resultante.
- Complejidad de la gestión de estado: mecanismos y tamaño del código de estado.
- Carga de configuración: cantidad y dificultad de la configuración de build/tooling del experimento.

## 5. Reglas de captura y reporte

1. Todas las mediciones de una comparación se toman **en la misma sesión y entorno**, en una ventana corta de tiempo.
2. Se reporta **mediana y rango** de 3 ejecuciones (o más si se documenta).
3. Se registra el **entorno de referencia** completo en cada documento de comparación.
4. Toda métrica incluye su **limitación** explícita.
5. Los valores se vinculan a **evidencia** (salida de build, logs, capturas, archivos de resultados) según la estructura de evidencia del [Scorecard](../comparisons/scorecard.md).
6. Si un experimento no puede producir una métrica, se documenta el motivo; no se omite en silencio.
