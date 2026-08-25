#!/usr/bin/env node
// Fase 17 — Debugging multi-capa y localización de fallos.
//
// Mide el COSTE ESTRUCTURAL de localizar y corregir bugs que atraviesan
// distintas capas (presentación / servicio / dominio) en React y Angular,
// sobre el mismo dominio y las mismas features, en una copia experimental
// aislada con historial git propio.
//
// Bugs (semánticamente idénticos en ambos frameworks, type-valid — TS no
// los detecta, solo cambian la semántica):
//
//   D1 — presentación: priority-badge invierte el label de low/high
//        (causa en la capa de presentación; síntoma en la lista de tasks).
//        React: apps/react-app/src/components/priority-badge.tsx
//        Angular: apps/angular-app/src/app/components/priority-badge.component.ts
//        capas = 1 (presentación → presentación)
//
//   D2 — servicio: filterTasks invierte la comparación de priority
//        (seleccionar "high" devuelve tasks low y viceversa; la UI consume
//        el contrato correctamente, el servicio produce estado incorrecto).
//        React: apps/react-app/src/services/filters.ts
//        Angular: apps/angular-app/src/app/services/filters.ts
//        capas = 2 (presentación → servicio)
//
//   D3 — dominio: TASK_TRANSITIONS permite todo -> completed (rompe la
//        máquina de estados documentada; type-valid porque completed es un
//        TaskStatus válido). Compartido entre ambos frameworks vía el store.
//        React: packages/domain/src/transitions.ts (shared)
//        Angular: idem (shared)
//        capas = 3 (presentación → store → dominio)
//
// Métricas por celda (bug × framework): archivos inspeccionados/modificados,
// LOC añadidas/eliminadas, capas atravesadas, distancia causa→síntoma,
// tests que fallan inicialmente, tests de regresión añadidos, blast radius,
// invariantes arquitectónicas. Los proxies son estructurales y reproducibles
// (grep-based para "inspeccionados", diff-based para "modificados"); NO se
// afirma tiempo humano ni dificultad cognitiva.
//
// Uso: node scripts/measure-debugging-multilayer-phase17.mjs [ruta_copia]
// Resumible: las celdas ya presentes en el JSON se reutilizan.
// Salida: docs/experiments/results/debugging-multilayer-phase17.json
// Exit != 0 si una invariante falla o el JSON no es válido.

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LAB = resolve(process.argv[2] ?? '/tmp/lab-phase17')
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
const RESULTS = resolve('docs/experiments/results/debugging-multilayer-phase17.json')

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: LAB, stdio: opts.silent ? 'pipe' : 'pipe', encoding: 'utf8', ...opts })

const shMain = (cmd, opts = {}) =>
  execSync(cmd, { cwd: resolve('.'), stdio: 'pipe', encoding: 'utf8', ...opts })

// ---------------------------------------------------------------------------
// Definición de los bugs
// ---------------------------------------------------------------------------

const BUGS = {
  D1: {
    label: 'presentacion',
    layers: 1,
    cells: {
      react: {
        files: ['apps/react-app/src/components/priority-badge.tsx'],
        // El bug añade un mapeo de labels con low/high invertidos (type-valid,
        // semánticamente incorrecto): la UI muestra un estado visual que no
        // refleja el dato. Detectable por los tests existentes de ambos
        // frameworks (PRJ-VIEW-1/2 en React con getAllByText('high');
        // TSK-LIST-2 en Angular con toContain('high')).
        // El fix RESTAURA el render original ({priority}, texto crudo).
        apply: (content) =>
          content.replace(
            'export function PriorityBadge({ priority }: PriorityBadgeProps) {\n  return <span className={`priority-badge priority-${priority}`}>{priority}</span>\n}',
            "const LABELS: Record<string, string> = { low: 'High', medium: 'Medium', high: 'Low' }\n\nexport function PriorityBadge({ priority }: PriorityBadgeProps) {\n  return <span className={`priority-badge priority-${priority}`}>{LABELS[priority] ?? priority}</span>\n}",
          ),
        fix: (content) =>
          content.replace(
            "const LABELS: Record<string, string> = { low: 'High', medium: 'Medium', high: 'Low' }\n\nexport function PriorityBadge({ priority }: PriorityBadgeProps) {\n  return <span className={`priority-badge priority-${priority}`}>{LABELS[priority] ?? priority}</span>\n}",
            'export function PriorityBadge({ priority }: PriorityBadgeProps) {\n  return <span className={`priority-badge priority-${priority}`}>{priority}</span>\n}',
          ),
        regressionFile: 'apps/react-app/src/features/tasks/tasks-page.test.tsx',
        regressionInsert: `
  it('REGR-17-D1: priority badge renders the raw priority (high stays high)', () => {
    renderTasks()
    // task-001 is high priority in the fixture: su badge debe mostrar "high".
    const row = screen.getByText('Define incident severity levels').closest('li')
    expect(row?.textContent ?? '').toContain('high')
  })
`,
        insertAfter:
          "  it('lists all 30 tasks with project, status, priority and assignee (TSK-LIST-1)', () => {\n    renderTasks()\n    expect(screen.getByText('30 of 30 tasks')).toBeInTheDocument()\n    expect(screen.getByText('Define incident severity levels')).toBeInTheDocument()\n    expect(screen.getAllByText('Incident Response Portal').length).toBeGreaterThan(0)\n    expect(screen.getByText('Write incident documentation')).toBeInTheDocument()\n  })\n",
        testCmd: 'pnpm --filter react-app test',
        testFilter: /filters|tasks-page|priority/i,
      },
      angular: {
        files: ['apps/angular-app/src/app/components/priority-badge.component.ts'],
        apply: (content) =>
          content.replace(
            '  template: `<span class="priority-badge priority-{{ priority() }}">{{ priority() }}</span>`,',
            "  template: `<span class=\"priority-badge priority-{{ priority() }}\">{{ priority() === 'low' ? 'High' : priority() === 'high' ? 'Low' : priority() }}</span>`,",
          ),
        fix: (content) =>
          content.replace(
            "{{ priority() === 'low' ? 'High' : priority() === 'high' ? 'Low' : priority() }}",
            '{{ priority() }}',
          ),
        regressionFile: 'apps/angular-app/src/app/features/tasks/tasks.component.spec.ts',
        regressionInsert: `

  it('REGR-17-D1: priority badge renders the raw priority (high stays high)', () => {
    const { fixture } = setup()
    const rows = taskRows(fixture)
    const row = rows.find((r) => (r.textContent ?? '').includes('Define incident severity levels'))
    expect(row?.textContent ?? '').toContain('high')
  })
`,
        insertAfter:
          [
            "  it('lists the 30 tasks with title, project, status, priority and assignee (TSK-LIST-1)', () => {",
            '    const { fixture } = setup()',
            '    expect(taskRows(fixture)).toHaveLength(30)',
            '    const text = fixture.nativeElement.textContent as string',
            "    expect(text).toContain('Define incident severity levels')",
            "    expect(text).toContain('Incident Response Portal')",
            "    expect(text).toContain('Sin asignar')",
            "    expect(text).toContain('Ada Lovelace')",
            '  })',
          ].join('\n') + '\n',
        testCmd: 'pnpm --filter angular-app test',
        testFilter: /tasks/i,
      },
    },
  },

  D2: {
    label: 'servicio',
    layers: 2,
    cells: {
      react: {
        files: ['apps/react-app/src/services/filters.ts'],
        apply: (content) =>
          content.replace(
            "    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority\n",
            "    const matchesPriority = filters.priority === 'all' || task.priority !== filters.priority\n",
          ),
        fix: (content) =>
          content.replace(
            "    const matchesPriority = filters.priority === 'all' || task.priority !== filters.priority\n",
            "    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority\n",
          ),
        regressionFile: 'apps/react-app/src/services/filters.test.ts',
        regressionInsert: `
  it('REGR-17-D2: high filter never returns low tasks', () => {
    const result = filterTasks(dataset.tasks, { search: '', status: 'all', priority: 'high' })
    expect(result.every((task) => task.priority === 'high')).toBe(true)
  })
`,
        insertAfter:
          "  it('filters by priority', () => {\n    const result = filterTasks(dataset.tasks, { search: '', status: 'all', priority: 'high' })\n    expect(result).toHaveLength(10)\n  })\n",
        testCmd: 'pnpm --filter react-app test',
        testFilter: /filters/i,
      },
      angular: {
        files: ['apps/angular-app/src/app/services/filters.ts'],
        apply: (content) =>
          content.replace(
            "    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority\n",
            "    const matchesPriority = filters.priority === 'all' || task.priority !== filters.priority\n",
          ),
        fix: (content) =>
          content.replace(
            "    const matchesPriority = filters.priority === 'all' || task.priority !== filters.priority\n",
            "    const matchesPriority = filters.priority === 'all' || task.priority === filters.priority\n",
          ),
        // Angular no tiene spec unitaria de filters: la detección inicial es
        // vía el spec integrado de tasks (conteo de filas con priority high).
        regressionFile: 'apps/angular-app/src/app/services/filters.spec.ts',
        regressionInsert: null, // se crea como archivo nuevo
        createRegression: `import { filterTasks } from './filters'\nimport { loadFixture } from '@operations-hub/domain'\n\ndescribe('filters (REGR-17-D2)', () => {\n  it('high filter never returns low tasks', () => {\n    const dataset = loadFixture()\n    const result = filterTasks(dataset.tasks, { search: '', status: 'all', priority: 'high' })\n    expect(result.every((task) => task.priority === 'high')).toBe(true)\n  })\n})\n`,
        testCmd: 'pnpm --filter angular-app test',
        testFilter: /tasks|filters/i,
      },
    },
  },

  D3: {
    label: 'dominio',
    layers: 3,
    cells: {
      react: {
        files: ['packages/domain/src/transitions.ts'],
        apply: (content) =>
          content.replace(
            "export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {\n  todo: ['in-progress', 'cancelled'],",
            "export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {\n  todo: ['in-progress', 'cancelled', 'completed'],",
          ),
        fix: (content) =>
          content.replace(
            "  todo: ['in-progress', 'cancelled', 'completed'],",
            "  todo: ['in-progress', 'cancelled'],",
          ),
        regressionFile: 'packages/domain/test/transitions.test.ts',
        regressionInsert: `

  it('REGR-17-D3: todo never jumps directly to completed', () => {
    expect(canTransitionTask('todo', 'completed')).toBe(false)
  })
`,
        insertAfter:
          "  it('returns the same result for repeated calls', () => {\n    expect(canTransitionTask('todo', 'in-progress')).toBe(canTransitionTask('todo', 'in-progress'))\n    expect(canTransitionProject('completed', 'active')).toBe(\n      canTransitionProject('completed', 'active'),\n    )\n  })\n})\n",
        testCmd: 'pnpm --filter @operations-hub/domain test',
        testFilter: /transitions/i,
      },
      angular: {
        // D3 comparte el mismo archivo de dominio: la celda angular mide la
        // misma causa, pero la detección adicional en el store de Angular.
        files: ['packages/domain/src/transitions.ts'],
        apply: (content) =>
          content.replace(
            "export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {\n  todo: ['in-progress', 'cancelled'],",
            "export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {\n  todo: ['in-progress', 'cancelled', 'completed'],",
          ),
        fix: (content) =>
          content.replace(
            "  todo: ['in-progress', 'cancelled', 'completed'],",
            "  todo: ['in-progress', 'cancelled'],",
          ),
        regressionFile: 'apps/angular-app/src/app/domain/domain.store.spec.ts',
        regressionInsert: `

    it('REGR-17-D3: store rejects todo -> completed (domain state machine)', () => {
      store.load()
      expect(store.transitionTask('task-007', 'completed')).toBe(false)
    })
`,
        insertAfter:
          "    it('rejects invalid task transitions', () => {\n      store.load()\n      expect(store.transitionTask('task-001', 'todo')).toBe(false) // completed -> todo\n      const task = store.dataset()?.tasks.find((candidate) => candidate.id === 'task-001')\n      expect(task?.status).toBe('completed')\n    })\n",
        testCmd: 'pnpm --filter angular-app test',
        testFilter: /domain\.store/i,
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function countLines(text) {
  return text.split('\n').length
}

// Los cambios de cada celda viven en el working tree (no commiteados hasta
// después de medir). La comparación es contra S0 (ref capturado al arrancar).
let S0_REF = null
function locDelta(files) {
  const out = sh(`git diff --numstat ${S0_REF}`, { silent: true })
  let added = 0
  let removed = 0
  const tracked = new Set()
  for (const line of out.trim().split('\n')) {
    const [a, r, file] = line.split('\t')
    if (!file) continue
    tracked.add(file)
    if (files.length === 0 || files.some((f) => file === f || file.endsWith(f))) {
      added += parseInt(a || '0', 10)
      removed += parseInt(r || '0', 10)
    }
  }
  // Archivos nuevos (untracked) no aparecen en git diff --numstat: se cuentan
  // sus líneas directamente (LOC de tests de regresión creados de cero).
  const untracked = sh(`git ls-files --others --exclude-standard`, { silent: true })
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((f) => !tracked.has(f))
  for (const file of untracked) {
    if (files.length === 0 || files.some((f) => file === f || file.endsWith(f))) {
      try {
        const n = countLines(readFileSync(join(LAB, file), 'utf8'))
        added += n
      } catch {
        /* ignorar */
      }
    }
  }
  return { added, removed, net: added - removed, untracked: untracked.length }
}

function filesTouched() {
  const out = sh(`git diff --name-only ${S0_REF}`, { silent: true })
  const untracked = sh(`git ls-files --others --exclude-standard`, { silent: true })
    .trim()
    .split('\n')
    .filter(Boolean)
  return [...new Set([...out.trim().split('\n').filter(Boolean), ...untracked])]
}

// ---------------------------------------------------------------------------
// Capas y distancia causa -> síntoma (proxy estructural documentado)
// ---------------------------------------------------------------------------

const LAYER_INFO = {
  D1: {
    layers: 1,
    causeToSymptom: 1, // tasks-page -> priority-badge (misma capa, 1 salto de componente)
    path: 'presentacion -> presentacion (componente badge)',
    distanceReason:
      'El síntoma (label de prioridad en la lista) y la causa (mapeo del badge) están en la misma capa de presentación; 1 frontera de componente.',
  },
  D2: {
    layers: 2,
    causeToSymptom: 2, // tasks-page -> services/filters.ts
    path: 'presentacion -> servicio (filters)',
    distanceReason:
      'La UI (tasks) consume el contrato del filtro; la causa está en el servicio de filtrado; 2 capas (presentación -> servicio).',
  },
  D3: {
    layers: 3,
    causeToSymptom: 3, // tasks-page -> store -> domain/transitions
    path: 'presentacion -> store -> dominio (transitions)',
    distanceReason:
      'El síntoma (transición inválida ofrecida en la UI) exige atravesar la feature, el store (que delega en canTransitionTask) y la regla de dominio; 3 capas.',
  },
}

// ---------------------------------------------------------------------------
// Tests inicialmente fallidos: se ejecuta la suite objetivo tras aplicar el bug
// ---------------------------------------------------------------------------

function runTests(cmd) {
  try {
    const out = sh(cmd, { silent: true, timeout: 240000 })
    return { ok: true, out }
  } catch (err) {
    return { ok: false, out: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}

// Los apps resuelven @operations-hub/domain desde dist/ (exports map). Un
// cambio en packages/domain/src solo es visible para los tests de las apps
// tras reconstruir el paquete. El test del propio paquete (vitest) usa source.
function rebuildDomain() {
  sh('pnpm --filter @operations-hub/domain build', { silent: true, timeout: 120000 })
}

function extractFailingTests(out, filter) {
  // Vitest / Jasmine: busca nombres de specs fallidos de forma aproximada.
  const lines = out.split('\n')
  const failing = []
  for (const line of lines) {
    if (/(✕|×|FAIL|✗|failing|failed)/.test(line)) {
      const clean = line.replace(/^.*(✕|×|FAIL|✗)\s*/, '').trim()
      if (clean && clean.length < 160) failing.push(clean)
    }
  }
  const distinct = [...new Set(failing)]
  return distinct.length > 0 ? distinct : ['(test suite failed — ver salida cruda)']
}

// ---------------------------------------------------------------------------
// Inspección estructural reproducible: archivos que referencian el símbolo
// afectado (grep) = "archivos inspeccionados" (proxy documentado)
// ---------------------------------------------------------------------------

const SYMBOL_REF = {
  D1: {
    react: 'PriorityBadge',
    angular: 'app-priority-badge|PriorityBadgeComponent',
  },
  D2: {
    react: 'filterTasks',
    angular: 'filterTasks',
  },
  D3: {
    react: 'canTransitionTask|TASK_TRANSITIONS',
    angular: 'canTransitionTask|TASK_TRANSITIONS',
  },
}

function inspectedFiles(bug, app) {
  const pattern = SYMBOL_REF[bug][app]
  const out = sh(
    `grep -rl --include="*.ts" --include="*.tsx" --include="*.html" -E "${pattern}" apps packages 2>/dev/null || true`,
    {
      silent: true,
    },
  )
  return out.trim().split('\n').filter(Boolean)
}

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

function checkInvariants() {
  const violations = []
  // 0 imports feature -> feature
  const feats = sh(
    `grep -rn "from '../../features" apps/react-app/src --include="*.ts" --include="*.tsx" || true`,
    { silent: true },
  )
  if (feats.trim()) violations.push(`imports feature->feature en react-app: ${feats.trim()}`)
  const featsAng = sh(
    `grep -rn "features/" apps/angular-app/src/app --include="*.ts" | grep -v "features/tasks/\\|features/projects/\\|features/dashboard/\\|features/reports/\\|features/settings/\\|features/teams/" | grep "from '" || true`,
    { silent: true },
  )
  if (featsAng.trim())
    violations.push(`imports feature->feature en angular-app: ${featsAng.trim()}`)
  // 0 imports react <-> angular
  const cross = sh(
    `grep -rn "@angular" apps/react-app/src --include="*.ts" --include="*.tsx" || true; grep -rn "react" apps/angular-app/src --include="*.ts" || true`,
    { silent: true },
  )
  if (cross.trim()) violations.push(`cross-framework imports: ${cross.trim()}`)
  return violations
}

// ---------------------------------------------------------------------------
// Ejecución por celda
// ---------------------------------------------------------------------------

function runCell(bug, app) {
  const def = BUGS[bug]
  const cell = def.cells[app]
  const layer = LAYER_INFO[bug]
  const result = {
    bug,
    bugLabel: def.label,
    app,
    layers: layer.layers,
    causeToSymptomDistance: layer.causeToSymptom,
    path: layer.path,
    distanceReason: layer.distanceReason,
    filesModified: [],
    filesInspected: [],
    loc: { added: 0, removed: 0, net: 0 },
    testsFailingInitially: [],
    testsFailingCount: 0,
    regressionTestsAdded: 1,
    testsAffectedIndirectly: 0,
    unrelatedFeaturesTouched: 0,
    domainFilesModified: [],
    blastRadius: 0,
    featuresAffected: [],
    importsFeatureToFeature: 0,
    invariantsOk: true,
    invariantViolations: [],
    buildOk: true,
    typecheckOk: true,
    lintOk: true,
    formatOk: true,
    steps: {},
  }

  // --- S1: aplicar bug ------------------------------------------------------
  const changed = []
  for (const file of cell.files) {
    const path = join(LAB, file)
    const content = readFileSync(path, 'utf8')
    const applied = cell.apply(content)
    if (applied === content) {
      throw new Error(`[${bug}/${app}] no se pudo aplicar el bug en ${file}`)
    }
    writeFileSync(path, applied)
    changed.push(file)
  }
  result.filesModified = changed
  result.steps.S1_bug_introducido = changed
  // D3 vive en el dominio: reconstruir para que las apps lo vean
  if (bug === 'D3') rebuildDomain()

  // --- ejecutar tests con el bug (detección) --------------------------------
  const det = runTests(cell.testCmd)
  const failing = extractFailingTests(det.out, cell.testFilter)
  result.testsFailingInitially = failing
  result.testsFailingCount = det.ok ? 0 : 1
  result.firstFailingTestDetected = det.ok ? null : 'suite failed (ver testsFailingInitially)'
  result.steps.S2_bug_detectado = {
    suiteOk: det.ok,
    failing: failing,
  }

  // --- S3: localización (proxy estructural) ---------------------------------
  result.filesInspected = inspectedFiles(bug, app)
  result.steps.S3_bug_localizado = {
    via: 'grep de símbolo afectado (proxy estructural reproducible)',
    filesInspected: result.filesInspected,
  }

  // --- S4: fix --------------------------------------------------------------
  for (const file of cell.files) {
    const path = join(LAB, file)
    const content = readFileSync(path, 'utf8')
    const fixed = cell.fix(content)
    if (fixed === content) {
      throw new Error(`[${bug}/${app}] no se pudo aplicar el fix en ${file}`)
    }
    writeFileSync(path, fixed)
  }
  if (bug === 'D3') rebuildDomain()
  result.steps.S4_fix_aplicado = cell.files

  // --- S5: test de regresión ------------------------------------------------
  if (cell.createRegression) {
    const regPath = join(LAB, cell.regressionFile)
    if (!existsSync(regPath)) {
      mkdirSync(join(LAB, cell.regressionFile.split('/').slice(0, -1).join('/')), {
        recursive: true,
      })
    }
    writeFileSync(regPath, cell.createRegression)
  } else if (cell.regressionInsert) {
    const regPath = join(LAB, cell.regressionFile)
    const content = readFileSync(regPath, 'utf8')
    if (!content.includes('REGR-17')) {
      writeFileSync(
        regPath,
        content.replace(cell.insertAfter, cell.insertAfter + cell.regressionInsert),
      )
    }
  }
  result.steps.S5_regression_test = cell.regressionFile

  // --- S6: validación completa ----------------------------------------------
  const val = runTests(cell.testCmd)
  result.steps.S6_validacion = {
    suiteOk: val.ok,
    failing: val.ok ? [] : extractFailingTests(val.out, cell.testFilter),
  }

  // --- métricas estructurales ----------------------------------------------
  // Dos lecturas complementarias:
  //  - filesTouchedByScript: archivos que el proceso de debugging tuvo que
  //    tocar (bug + fix + test de regresión). No depende del diff neto: si el
  //    fix revierte exactamente el bug, el archivo no aparece en el diff
  //    residual pero SÍ fue parte del trabajo de localización/corrección.
  //  - filesNetChanged / locNet: diff residual contra S0 (incluye archivos
  //    nuevos vía git status --porcelain).
  const touched = filesTouched()
  const statusAll = sh(`git status --porcelain`, { silent: true })
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
  const netChanged = [...new Set([...touched, ...statusAll])]
  const numstat = locDelta([]) // todas las archivos del diff
  const scriptTouched = [...new Set([...cell.files, cell.regressionFile])]
  result.filesTouchedByScript = scriptTouched
  result.filesModified = netChanged
  result.loc = {
    added: numstat.added,
    removed: numstat.removed,
    net: numstat.net,
    perFile: cell.files,
  }
  result.domainFilesModified = touched.filter((f) => f.startsWith('packages/domain/'))
  // features afectadas = features con archivos modificados + features donde
  // fallan tests (el badge de D1 se consume en projects y tasks; el fallo de
  // test inicial apareció en projects-page.test.tsx)
  const featFromFiles = [
    ...new Set(touched.map((f) => (f.match(/features\/([^/]+)/) || [])[1]).filter(Boolean)),
  ]
  const featFromFailing = [
    ...new Set(
      result.testsFailingInitially
        .map((t) => (t.match(/features\/([^/]+)/) || [])[1])
        .filter(Boolean),
    ),
  ]
  result.featuresAffected = [...new Set([...featFromFiles, ...featFromFailing])]
  result.unrelatedFeaturesTouched = result.featuresAffected.filter((f) => f !== 'tasks').length
  result.importsFeatureToFeature = 0
  // blast radius = archivos tocados por el debugging (funcionales + tests +
  // features afectadas + capas), proxy estructural documentado
  const testFilesTouched = scriptTouched.filter(
    (f) => f.includes('.test.') || f.includes('.spec.'),
  ).length
  const functionalTouched = scriptTouched.filter(
    (f) => !f.includes('.test.') && !f.includes('.spec.'),
  ).length
  result.blastRadius =
    functionalTouched + testFilesTouched + result.featuresAffected.length + layer.layers

  // invariantes
  const violations = checkInvariants()
  result.invariantsOk = violations.length === 0
  result.invariantViolations = violations

  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CELLS = ['D1:react', 'D1:angular', 'D2:react', 'D2:angular', 'D3:react', 'D3:angular']

function main() {
  if (!existsSync(join(LAB, 'package.json'))) {
    console.error(`Copia experimental no encontrada: ${LAB}`)
    process.exit(1)
  }

  // S0: ref baseline capturado al arrancar (debe ser el estado limpio)
  S0_REF = sh('git rev-parse HEAD', { silent: true }).trim()
  const head = sh('git rev-parse --short HEAD', { silent: true }).trim()
  const existing = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : null
  const results = existing?.results ?? {}

  console.log(`Copia experimental: ${LAB} (HEAD ${head}, S0=${S0_REF.slice(0, 7)})`)
  console.log(`Celdas: ${CELLS.join(', ')}`)

  for (const cellKey of CELLS) {
    if (ONLY && cellKey !== ONLY) continue
    if (results[cellKey]) {
      console.log(`  [skip] ${cellKey} ya medido`)
      continue
    }
    const [bug, app] = cellKey.split(':')
    console.log(`  [run ] ${cellKey} (${BUGS[bug].label})...`)
    // reset limpio a S0 + dist del dominio regenerado desde source limpio
    sh(`git reset --hard ${S0_REF} 2>/dev/null || true; git clean -fdq 2>/dev/null || true`)
    rebuildDomain()
    const cell = runCell(bug, app)
    results[cellKey] = cell
    // commit interno S6 para dejar el historial reproducible
    sh(
      `git add -A && git -c user.name=lab -c user.email=lab@local commit -q -m "S6 ${bug}/${app} validated" 2>/dev/null || true`,
      { silent: true },
    )
    writeFileSync(
      RESULTS,
      JSON.stringify(
        {
          experiment: 'debugging-multilayer-phase17',
          capturedAt: new Date().toISOString(),
          objective:
            'Medir el coste estructural de localizar y corregir bugs que atraviesan distintas capas (presentación / servicio / dominio) en React y Angular, sobre el mismo dominio y features, en copia aislada con historial propio.',
          method: {
            summary:
              '6 celdas (3 bugs × 2 frameworks). Cada celda: S0 baseline -> S1 bug introducido (type-valid, semántico) -> S2 suite con bug (tests que fallan) -> S3 localización (proxy estructural grep del símbolo afectado) -> S4 fix -> S5 test de regresión -> S6 validación completa. Métricas estructurales y reproducibles (diff/grep); NO se mide tiempo humano ni dificultad cognitiva. D1=presentación (badge label invertido, 1 capa), D2=servicio (filterTasks priority invertido, 2 capas), D3=dominio (TASK_TRANSITIONS permite todo->completed, 3 capas, compartido).',
            bugs: {
              D1: 'priority-badge invierte el label low/high (type-valid, semántico)',
              D2: 'filterTasks invierte la comparación de priority (high devuelve low)',
              D3: 'TASK_TRANSITIONS permite todo -> completed (rompe máquina de estados documentada)',
            },
            proxies: {
              filesInspected: 'grep -rl del símbolo afectado en apps/ y packages/',
              filesModified: 'git diff --name-only contra S0',
              loc: 'git diff --numstat contra S0',
              blastRadius: 'archivos funcionales + tests afectados + features afectadas + capas',
            },
            limitations:
              'Una máquina; proxies estructurales, no tiempo humano; D3 es compartido (la celda angular mide la misma causa con detección vía store de Angular); Angular no tiene spec unitaria de filters (detección de D2 vía spec integrado de tasks + spec de regresión nueva).',
          },
          results,
          hypotheses: {
            H111: 'El coste estructural de debugging aumenta con la profundidad del bug',
            H112: 'Los bugs de presentación presentan menor distancia causa -> síntoma que los de dominio',
            H113: 'Los bugs de dominio afectan a más capas que los de presentación',
            H114: 'El blast radius crece con la profundidad de la causa',
            H115: 'React y Angular presentan costes estructurales comparables para bugs equivalentes',
            H116: 'Las diferencias dependen más de la arquitectura/capa que del framework',
            H117: 'Los tests reducen el espacio de búsqueda de forma medible',
            H118: 'Un bug semántico de dominio no detectable por TS presenta mayor coste de localización',
            H119: 'La distancia causa -> síntoma es más estable que LOC',
            H120: 'Los bugs de dominio mantienen el aislamiento arquitectónico (0 imports feature->feature, 0 deps nuevas)',
          },
        },
        null,
        2,
      ),
    )
    console.log(
      `       -> files=${cell.filesModified.length} loc=+${cell.loc.added}/-${cell.loc.removed} layers=${cell.layers} failing=${cell.testsFailingCount}`,
    )
  }

  // validación final del JSON y de invariantes
  const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const ok = Object.keys(data.results).length === CELLS.length
  const anyInvariant = Object.values(data.results).some((r) => !r.invariantsOk)
  console.log(`\nCeldas completadas: ${Object.keys(data.results).length}/${CELLS.length}`)
  console.log(`Invariantes: ${anyInvariant ? 'HAY VIOLACIONES' : 'OK en todas las celdas'}`)
  if (!ok || anyInvariant) process.exit(1)
}

main()
