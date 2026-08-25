#!/usr/bin/env node
// Fase 18 — Debugging y mantenimiento bajo acoplamiento arquitectónico inducido.
//
// Aísla una variable: ACOPLAMIENTO ARQUITECTÓNICO. Compara una baseline
// limpia (0 imports feature→feature, reglas centralizadas en domain) con
// tres variantes acopladas deliberadamente, en una copia experimental aislada
// con historial git propio:
//
//   BASELINE  — arquitectura actual limpia.
//   COUPLED-A — import feature→feature real: tasks → teams (userTeamName).
//   COUPLED-B — duplicación de regla: dashboard reimplementa computeCompletionRate.
//   COUPLED-C — combinación de A + B.
//
// Escenarios (semánticamente equivalentes en React y Angular, 6 por condición):
//   M1 — modificar la regla de dominio computeCompletionRate (la duplicada).
//   M2 — cambio de UI en la feature tasks (título de sección).
//   M3 — eliminar una funcionalidad (búsqueda de tasks).
//   M4 — cambiar el contrato de una función consumida (userTeamName en
//        acoplado; filterTasks en baseline — mismo tipo de cambio).
//   M5 — bug semántico type-valid en la dependencia acoplada (userTeamName
//        en acoplado; helper local equivalente en baseline).
//   M6 — modificar una regla de negocio central (TASK_TRANSITIONS).
//
// Métricas por celda: archivos afectados (INCREMENTO del escenario sobre la
// condición, aislado del ruido de la condición), imports feature→feature,
// reglas duplicadas, archivos no relacionados, blast radius, distancia
// causa→síntoma, archivos inspeccionados (grep del símbolo), LOC tocadas,
// LOC residuales, tests que fallan, invariantes, profundidad del grafo.
//
// Proxies estructurales reproducibles (git diff / grep / typecheck / tests).
// NO se mide tiempo humano ni dificultad cognitiva.
//
// Uso: node scripts/measure-coupling-phase18.mjs [ruta_copia] [--condition=X]
// Resumible: celdas presentes en el JSON se reutilizan.
// Salida: docs/experiments/results/coupling-phase18.json
// Exit != 0 si una validación obligatoria falla o el JSON es inválido.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LAB = resolve(process.argv[2] ?? '/tmp/lab-phase18')
const ONLY_COND = process.argv.find((a) => a.startsWith('--condition='))?.split('=')[1]
const RESULTS = resolve('docs/experiments/results/coupling-phase18.json')

const sh = (cmd, opts = {}) =>
  execSync(cmd, {
    cwd: LAB,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: opts.timeout ?? 240000,
  })

let S0_REF = null
let COND_REF = null // ref del snapshot de la condición (diff de escenarios contra él)

// ---------------------------------------------------------------------------
// Utilidades git
// ---------------------------------------------------------------------------

function resetToS0() {
  sh(`git reset --hard ${S0_REF} 2>/dev/null || true; git clean -fdq 2>/dev/null || true`)
  sh('pnpm --filter @operations-hub/domain build', { timeout: 120000 })
}

function diffFiles(ref) {
  const tracked = sh(`git diff --name-only ${ref}`).trim().split('\n').filter(Boolean)
  const untracked = sh('git ls-files --others --exclude-standard')
    .trim()
    .split('\n')
    .filter(Boolean)
  return [...new Set([...tracked, ...untracked])]
}

function diffNumstat(ref) {
  const out = sh(`git diff --numstat ${ref}`).trim().split('\n').filter(Boolean)
  let added = 0
  let removed = 0
  for (const line of out) {
    const [a, r] = line.split('\t')
    added += parseInt(a || '0', 10)
    removed += parseInt(r || '0', 10)
  }
  const untracked = sh('git ls-files --others --exclude-standard')
    .trim()
    .split('\n')
    .filter(Boolean)
  for (const f of untracked) {
    try {
      added += readFileSync(join(LAB, f), 'utf8').split('\n').length
    } catch {
      /* ignore */
    }
  }
  return { added, removed, net: added - removed }
}

function countFeatureImports(app) {
  // Import feature→feature = un import relativo '../<otra-feature>/' desde
  // dentro de una feature (los imports '../components' y '../services' no
  // cuentan; tampoco los internos './').
  const base = app === 'react' ? 'apps/react-app/src/features' : 'apps/angular-app/src/app/features'
  const out = sh(
    `grep -rnE "from '\\.\\./(teams|projects|reports|dashboard|settings|tasks)/" ${base} --include="*.ts" --include="*.tsx" --include="*.html" || true`,
  ).trim()
  if (!out) return 0
  return out.split('\n').filter(Boolean).length
}

function countDuplicatedRules() {
  const out = sh(
    `grep -rn "function computeCompletionRateLocal" apps --include="*.ts" --include="*.tsx" || true`,
  ).trim()
  if (!out) return 0
  return out.split('\n').filter(Boolean).length
}

function runCmd(cmd) {
  try {
    const out = sh(cmd)
    return { ok: true, out }
  } catch (err) {
    return { ok: false, out: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}

function extractFailing(out) {
  // Strip ANSI, luego archivos de test con fallos ("❯ <path>.test.ts")
  const plain = out.replace(/\u001b\[[0-9;]*m/g, '')
  const lines = plain.split('\n')
  const failingFiles = new Set()
  const failingNames = new Set()
  for (const line of lines) {
    const fileMatch = line.match(/❯\s*(\S+\.(?:test|spec)\.(?:ts|tsx))/)
    if (fileMatch) failingFiles.add(fileMatch[1])
    if (/(✕|×)/.test(line) && !/Test Files|Tests\s/.test(line)) {
      const clean = line.replace(/^.*(✕|×)\s*/, '').trim()
      if (clean && clean.length < 160 && !/^(Test Files|Tests)/.test(clean)) failingNames.add(clean)
    }
  }
  return { files: [...failingFiles].slice(0, 6), names: [...failingNames].slice(0, 6) }
}

// ---------------------------------------------------------------------------
// Condiciones de acoplamiento
// ---------------------------------------------------------------------------

function applyCoupledA() {
  // React: exportar userTeamName en teams, importarlo en tasks
  const rTeams = 'apps/react-app/src/features/teams/teams-page.tsx'
  let c = readFileSync(join(LAB, rTeams), 'utf8')
  c = c.replace(
    "import { buildTeamReport, type Team, type User } from '@operations-hub/domain'\n",
    "import { buildTeamReport, type Dataset, type Team, type User } from '@operations-hub/domain'\n",
  )
  c += `\n// COUPLED-A (experimental): helper exported by the teams feature so the\n// tasks feature can display the assignee's team (intentional coupling).\nexport function userTeamName(dataset: Dataset, userId: string): string {\n  const user = dataset.users.find((candidate) => candidate.id === userId)\n  if (user === undefined) {\n    return ''\n  }\n  return dataset.teams.find((team) => team.id === user.teamId)?.name ?? ''\n}\n`
  writeFileSync(join(LAB, rTeams), c)

  const rTasks = 'apps/react-app/src/features/tasks/tasks-page.tsx'
  c = readFileSync(join(LAB, rTasks), 'utf8')
  c = c.replace(
    "import { TaskForm } from './task-form'\n",
    "import { TaskForm } from './task-form'\nimport { userTeamName } from '../teams/teams-page'\n",
  )
  c = c.replace(
    '  const userName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id\n',
    '  const userName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id\n  const teamOf = (id: string): string => userTeamName(dataset, id)\n',
  )
  c = c.replace(
    '                    <span className="task-assignee">\n                      {task.assigneeId === null ? \'Sin asignar\' : userName(task.assigneeId)}\n                    </span>\n',
    '                    <span className="task-assignee">\n                      {task.assigneeId === null\n                        ? \'Sin asignar\'\n                        : `${userName(task.assigneeId)} (${teamOf(task.assigneeId)})`}\n                    </span>\n',
  )
  writeFileSync(join(LAB, rTasks), c)

  // Angular: exportar helper en teams.component.ts, usarlo en tasks
  const aTeams = 'apps/angular-app/src/app/features/teams/teams.component.ts'
  c = readFileSync(join(LAB, aTeams), 'utf8')
  c = c.replace(
    "import { buildTeamReport, type User } from '@operations-hub/domain'\n",
    "import { buildTeamReport, type Dataset, type User } from '@operations-hub/domain'\n",
  )
  c += `\n// COUPLED-A (experimental): helper exported by the teams feature so the\n// tasks feature can display the assignee's team (intentional coupling).\nexport function userTeamName(dataset: Dataset, userId: string): string {\n  const user = dataset.users.find((candidate) => candidate.id === userId)\n  if (user === undefined) {\n    return ''\n  }\n  return dataset.teams.find((team) => team.id === user.teamId)?.name ?? ''\n}\n`
  writeFileSync(join(LAB, aTeams), c)

  const aTasks = 'apps/angular-app/src/app/features/tasks/tasks.component.ts'
  c = readFileSync(join(LAB, aTasks), 'utf8')
  c = c.replace(
    "import { TaskFormComponent } from './task-form.component'\n",
    "import { TaskFormComponent } from './task-form.component'\nimport { userTeamName } from '../teams/teams.component'\n",
  )
  c = c.replace(
    '  userName(id: string): string {\n    return this.users().find((user) => user.id === id)?.name ?? id\n  }\n',
    "  userName(id: string): string {\n    return this.users().find((user) => user.id === id)?.name ?? id\n  }\n\n  teamOf(id: string): string {\n    const dataset = this.store.dataset()\n    return dataset === null ? '' : userTeamName(dataset, id)\n  }\n",
  )
  writeFileSync(join(LAB, aTasks), c)

  const aHtml = 'apps/angular-app/src/app/features/tasks/tasks.component.html'
  c = readFileSync(join(LAB, aHtml), 'utf8')
  c = c.replace(
    '              <span class="task-assignee">\n                {{ task.assigneeId === null ? \'Sin asignar\' : userName(task.assigneeId) }}\n              </span>\n',
    "              <span class=\"task-assignee\">\n                {{ task.assigneeId === null ? 'Sin asignar' : userName(task.assigneeId) + ' (' + teamOf(task.assigneeId) + ')' }}\n              </span>\n",
  )
  writeFileSync(join(LAB, aHtml), c)
}

function applyCoupledB() {
  // React: dashboard reimplementa computeCompletionRate localmente
  const rDash = 'apps/react-app/src/features/dashboard/dashboard-page.tsx'
  let c = readFileSync(join(LAB, rDash), 'utf8')
  c = c.replace(
    "import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'\n",
    "import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'\n// COUPLED-B (experimental): regla de dominio duplicada localmente en la\n// feature dashboard (intentional duplication of the domain rule).\nfunction computeCompletionRateLocal(\n  completedTasks: number,\n  totalTasks: number,\n  cancelledTasks: number,\n): number | null {\n  const actionable = totalTasks - cancelledTasks\n  if (actionable <= 0) {\n    return null\n  }\n  return Math.round((completedTasks / actionable) * 1000) / 10\n}\n",
  )
  c = c.replace(
    '  const globalReport = useMemo(() => buildGlobalReport(dataset), [dataset])\n  const rate = globalReport.metrics.completionRate\n',
    '  const globalReport = useMemo(() => buildGlobalReport(dataset), [dataset])\n  const rate = computeCompletionRateLocal(\n    globalReport.metrics.completedTasks,\n    globalReport.metrics.totalTasks,\n    globalReport.metrics.cancelledTasks,\n  )\n',
  )
  writeFileSync(join(LAB, rDash), c)

  // Angular: dashboard reimplementa computeCompletionRate localmente
  const aDash = 'apps/angular-app/src/app/features/dashboard/dashboard.component.ts'
  c = readFileSync(join(LAB, aDash), 'utf8')
  c = c.replace(
    "import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'\n",
    "import { buildGlobalReport, type ProjectStatus } from '@operations-hub/domain'\n// COUPLED-B (experimental): regla de dominio duplicada localmente en la\n// feature dashboard (intentional duplication of the domain rule).\nfunction computeCompletionRateLocal(\n  completedTasks: number,\n  totalTasks: number,\n  cancelledTasks: number,\n): number | null {\n  const actionable = totalTasks - cancelledTasks\n  if (actionable <= 0) {\n    return null\n  }\n  return Math.round((completedTasks / actionable) * 1000) / 10\n}\n",
  )
  c = c.replace(
    '    return dataset === null ? null : buildGlobalReport(dataset)\n',
    '    const report = dataset === null ? null : buildGlobalReport(dataset)\n    if (report === null) {\n      return null\n    }\n    return {\n      ...report,\n      metrics: {\n        ...report.metrics,\n        completionRate: computeCompletionRateLocal(\n          report.metrics.completedTasks,\n          report.metrics.totalTasks,\n          report.metrics.cancelledTasks,\n        ),\n      },\n    }\n',
  )
  writeFileSync(join(LAB, aDash), c)
}

const CONDITIONS = {
  BASELINE: { label: 'baseline', apply: () => {} },
  'COUPLED-A': { label: 'acoplamiento feature→feature (tasks→teams)', apply: applyCoupledA },
  'COUPLED-B': {
    label: 'duplicación de regla (dashboard computeCompletionRate)',
    apply: applyCoupledB,
  },
  'COUPLED-C': {
    label: 'acoplamiento feature→feature + duplicación de regla',
    apply: () => {
      applyCoupledA()
      applyCoupledB()
    },
  },
}

// ---------------------------------------------------------------------------
// Escenarios de mantenimiento (condition-aware)
// ---------------------------------------------------------------------------

const SCENARIOS = {
  M1: {
    label: 'modificar regla de dominio computeCompletionRate',
    rebuildDomain: true,
    apply: () => {
      const f = 'packages/domain/src/reports.ts'
      const c = readFileSync(join(LAB, f), 'utf8')
      writeFileSync(
        join(LAB, f),
        c.replace(
          '  return Math.round((completedTasks / actionable) * 1000) / 10\n',
          '  return Math.round((completedTasks / actionable) * 100)\n',
        ),
      )
    },
  },
  M2: {
    label: 'cambio de UI en feature tasks (título de sección)',
    apply: (app) => {
      if (app === 'react') {
        const f = 'apps/react-app/src/features/tasks/tasks-page.tsx'
        const c = readFileSync(join(LAB, f), 'utf8')
        writeFileSync(
          join(LAB, f),
          c.replace('<h2 className="grow">Tasks</h2>', '<h2 className="grow">Task list</h2>'),
        )
      } else {
        const f = 'apps/angular-app/src/app/features/tasks/tasks.component.html'
        const c = readFileSync(join(LAB, f), 'utf8')
        writeFileSync(
          join(LAB, f),
          c.replace('<h2 class="grow">Tasks</h2>', '<h2 class="grow">Task list</h2>'),
        )
      }
    },
  },
  M3: {
    label: 'eliminar funcionalidad (búsqueda de tasks)',
    apply: (app) => {
      if (app === 'react') {
        const f = 'apps/react-app/src/features/tasks/tasks-page.tsx'
        let c = readFileSync(join(LAB, f), 'utf8')
        c = c.replace(
          '            <div className="field">\n              <label htmlFor="task-search">Search tasks</label>\n              <input\n                id="task-search"\n                type="search"\n                value={search}\n                onChange={(event) => setSearch(event.target.value)}\n                placeholder="e.g. incident"\n              />\n            </div>\n',
          '',
        )
        c = c.replace("  const [search, setSearch] = useState('')\n", '')
        c = c.replace(
          '    const matches = filterTasks(dataset.tasks, {\n      search,\n      status: statusFilter,\n      priority: priorityFilter,\n    })\n',
          "    const matches = filterTasks(dataset.tasks, {\n      search: '',\n      status: statusFilter,\n      priority: priorityFilter,\n    })\n",
        )
        c = c.replace(
          '  }, [dataset.tasks, search, statusFilter, priorityFilter, showCompletedTasks])\n',
          '  }, [dataset.tasks, statusFilter, priorityFilter, showCompletedTasks])\n',
        )
        writeFileSync(join(LAB, f), c)
      } else {
        const f = 'apps/angular-app/src/app/features/tasks/tasks.component.html'
        let c = readFileSync(join(LAB, f), 'utf8')
        c = c.replace(
          '        <label for="task-search">Search tasks</label>\n        <input\n          id="task-search"\n          type="search"\n          [value]="search()"\n          (input)="search.set($any($event.target).value)"\n          placeholder="e.g. incident"\n        />\n',
          '',
        )
        writeFileSync(join(LAB, f), c)
        const t = 'apps/angular-app/src/app/features/tasks/tasks.component.ts'
        let tc = readFileSync(join(LAB, t), 'utf8')
        tc = tc.replace("  readonly search = signal('')\n", '')
        tc = tc.replace('      search: this.search(),\n', '      search: "",\n')
        writeFileSync(join(LAB, t), tc)
      }
    },
  },
  M4: {
    label: 'cambiar contrato de función consumida',
    apply: (app, condition) => {
      if (condition === 'BASELINE' || condition === 'COUPLED-B') {
        // Sin userTeamName: cambiar el contrato de filterTasks (mismo tipo de
        // cambio: añadir un parámetro obligatorio a una función consumida).
        const f =
          app === 'react'
            ? 'apps/react-app/src/services/filters.ts'
            : 'apps/angular-app/src/app/services/filters.ts'
        const c = readFileSync(join(LAB, f), 'utf8')
        writeFileSync(
          join(LAB, f),
          c.replace(
            'export function filterTasks(tasks: readonly Task[], filters: TaskFilters): Task[] {',
            'export function filterTasks(tasks: readonly Task[], filters: TaskFilters, includeArchived: boolean): Task[] {',
          ),
        )
      } else {
        // Acoplado: cambiar la firma de userTeamName (el consumidor tasks usa la
        // dependencia feature→feature y debe adaptarse).
        const f =
          app === 'react'
            ? 'apps/react-app/src/features/teams/teams-page.tsx'
            : 'apps/angular-app/src/app/features/teams/teams.component.ts'
        const c = readFileSync(join(LAB, f), 'utf8')
        writeFileSync(
          join(LAB, f),
          c.replace(
            'export function userTeamName(dataset: Dataset, userId: string): string {',
            'export function userTeamName(dataset: Dataset, userId: string, includeTeamLead: boolean): string {',
          ),
        )
      }
    },
  },
  M5: {
    label: 'bug semántico type-valid en la dependencia',
    apply: (app, condition) => {
      if (condition === 'BASELINE' || condition === 'COUPLED-B') {
        // Sin userTeamName: bug equivalente en el helper local de tasks
        // (userName devuelve el primer usuario en lugar del asignado).
        if (app === 'react') {
          const f = 'apps/react-app/src/features/tasks/tasks-page.tsx'
          const c = readFileSync(join(LAB, f), 'utf8')
          writeFileSync(
            join(LAB, f),
            c.replace(
              '  const userName = (id: string): string => dataset.users.find((user) => user.id === id)?.name ?? id\n',
              '  const userName = (id: string): string => dataset.users[0]?.name ?? id\n',
            ),
          )
        } else {
          const f = 'apps/angular-app/src/app/features/tasks/tasks.component.ts'
          const c = readFileSync(join(LAB, f), 'utf8')
          writeFileSync(
            join(LAB, f),
            c.replace(
              '  userName(id: string): string {\n    return this.users().find((user) => user.id === id)?.name ?? id\n  }\n',
              '  userName(id: string): string {\n    return this.users()[0]?.name ?? id\n  }\n',
            ),
          )
        }
      } else {
        // Acoplado: bug en la dependencia feature→feature (userTeamName devuelve
        // el primer team en lugar del team del usuario).
        const f =
          app === 'react'
            ? 'apps/react-app/src/features/teams/teams-page.tsx'
            : 'apps/angular-app/src/app/features/teams/teams.component.ts'
        const c = readFileSync(join(LAB, f), 'utf8')
        writeFileSync(
          join(LAB, f),
          c.replace(
            "  return dataset.teams.find((team) => team.id === user.teamId)?.name ?? ''\n",
            "  return dataset.teams[0]?.name ?? ''\n",
          ),
        )
      }
    },
  },
  M6: {
    label: 'modificar regla de negocio central (TASK_TRANSITIONS)',
    rebuildDomain: true,
    apply: () => {
      const f = 'packages/domain/src/transitions.ts'
      const c = readFileSync(join(LAB, f), 'utf8')
      writeFileSync(
        join(LAB, f),
        c.replace("  todo: ['in-progress', 'cancelled'],", "  todo: ['in-progress'],"),
      )
    },
  },
}

// ---------------------------------------------------------------------------
// Inspección de consumidores (proxy grep)
// ---------------------------------------------------------------------------

function consumersOf(symbol, app) {
  const base = app === 'react' ? 'apps/react-app/src' : 'apps/angular-app/src/app'
  const out = sh(
    `grep -rl "${symbol}" ${base} --include="*.ts" --include="*.tsx" --include="*.html" 2>/dev/null || true`,
  ).trim()
  return out ? out.split('\n').filter(Boolean) : []
}

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

function checkInvariants(condition, app) {
  const violations = []
  const fi = countFeatureImports(app)
  if (condition === 'BASELINE' && fi > 0) {
    violations.push(`imports feature→feature en ${app} baseline: ${fi}`)
  }
  if ((condition === 'COUPLED-A' || condition === 'COUPLED-C') && fi < 1) {
    violations.push(`se esperaba >=1 import feature→feature en ${app} (${condition})`)
  }
  if (condition === 'BASELINE') {
    const dup = countDuplicatedRules()
    if (dup > 0) violations.push(`reglas duplicadas en baseline: ${dup}`)
  }
  const cross = sh(
    `grep -rn "@angular" apps/react-app/src --include="*.ts" --include="*.tsx" || true; grep -rn "from 'react'" apps/angular-app/src --include="*.ts" || true`,
  ).trim()
  if (cross) violations.push('cross-framework imports')
  return violations
}

// ---------------------------------------------------------------------------
// Celda: condición x escenario x framework
// ---------------------------------------------------------------------------

function runCell(condition, scenario, app) {
  const result = {
    condition,
    scenario,
    app,
    conditionLabel: CONDITIONS[condition].label,
    scenarioLabel: SCENARIOS[scenario].label,
    importsFeatureToFeature: 0,
    duplicatedRules: 0,
    filesAffectedByScenario: [],
    filesConditionIncrement: 0,
    unrelatedFilesAffected: 0,
    blastRadius: 0,
    causeToSymptomDistance: null,
    filesInspected: 0,
    locTouched: 0,
    locResidual: 0,
    testsFailing: 0,
    testsAffected: 0,
    regressionTestsNeeded: 1,
    directConsumers: 0,
    indirectConsumers: 0,
    depGraphDepth: 0,
    invariantsOk: true,
    invariantViolations: [],
    typecheckOk: true,
    typecheckErrors: 0,
    suiteOkAfter: true,
    steps: {},
  }

  SCENARIOS[scenario].apply(app, condition)
  if (SCENARIOS[scenario].rebuildDomain) {
    sh('pnpm --filter @operations-hub/domain build', { timeout: 120000 })
  }

  // --- métricas estructurales (INCREMENTO del escenario sobre la condición) --
  const scenarioFiles = diffFiles(COND_REF)
  result.filesAffectedByScenario = scenarioFiles
  result.importsFeatureToFeature = countFeatureImports(app)
  result.duplicatedRules = countDuplicatedRules()

  const totalNum = diffNumstat(COND_REF)
  result.locTouched = totalNum.added + totalNum.removed
  result.locResidual = totalNum.net

  // Archivos no relacionados (features fuera de tasks/teams/dashboard afectadas)
  const featureFiles = scenarioFiles.filter((f) => f.includes('/features/'))
  const featureNames = new Set(
    featureFiles.map((f) => (f.match(/features\/([^/]+)/) || [])[1]).filter(Boolean),
  )
  const allowedFeatures = new Set(['tasks', 'teams', 'dashboard'])
  const unrelated = [...featureNames].filter((f) => !allowedFeatures.has(f))
  result.unrelatedFilesAffected = unrelated.length
  result.steps.featuresAffectedByScenario = [...featureNames]

  // --- consumidores, distancia y profundidad (proxy) -------------------------
  // El símbolo inspeccionado depende del escenario (la causa real del cambio):
  //   M1/M6 -> regla de dominio; M4/M5 -> función de la dependencia (userTeamName
  //   en acoplado, userName/filterTasks en baseline); M2/M3 -> feature tasks.
  const coupled = condition === 'COUPLED-A' || condition === 'COUPLED-C'
  let symbol = null
  if (scenario === 'M1') symbol = 'computeCompletionRate'
  else if (scenario === 'M6') symbol = 'TASK_TRANSITIONS'
  else if (scenario === 'M4' || scenario === 'M5')
    symbol = coupled
      ? 'userTeamName'
      : app === 'react'
        ? scenario === 'M4'
          ? 'filterTasks'
          : 'userName'
        : scenario === 'M4'
          ? 'filterTasks'
          : 'userName'
  else symbol = app === 'react' ? 'TasksPage' : 'TasksComponent'
  const allConsumers = consumersOf(symbol, app)
  const domainConsumers = allConsumers.filter((f) => f.includes('packages/domain'))
  const appConsumers = allConsumers.filter((f) => !f.includes('packages/domain'))
  result.filesInspected = allConsumers.length
  result.directConsumers = appConsumers.length
  result.indirectConsumers = domainConsumers.length

  if (coupled) {
    result.depGraphDepth = 2 // tasks -> teams (1 salto entre features)
    result.causeToSymptomDistance = scenario === 'M5' ? 2 : null
  } else {
    result.depGraphDepth = 1
    result.causeToSymptomDistance = scenario === 'M5' ? 1 : null
  }

  // --- typecheck -------------------------------------------------------------
  const tc = runCmd(`pnpm --filter ${app === 'react' ? 'react-app' : 'angular-app'} typecheck`)
  result.typecheckOk = tc.ok
  result.typecheckErrors = tc.ok ? 0 : (tc.out.match(/error TS\d+/g) || []).length
  result.steps.typecheck = tc.ok ? 'ok' : `errors(${result.typecheckErrors})`

  // --- tests (suite del paquete) ---------------------------------------------
  const testCmd =
    app === 'react' ? 'pnpm --filter react-app test' : 'pnpm --filter angular-app test'
  const tests = runCmd(testCmd)
  const failing = extractFailing(tests.out)
  // Archivos de test que fallan por el ESCENARIO (no por la condición)
  const condFiles = new Set(COND_FAILING[app].files)
  const newFiles = failing.files.filter((f) => !condFiles.has(f))
  result.testsFailing = newFiles.length
  result.testsAffected = newFiles.length
  result.steps.failingTestFiles = newFiles
  result.steps.failingTestNames = failing.names.slice(0, 4)
  result.steps.conditionFailingBaseline = COND_FAILING[app].files
  result.suiteOkAfter = tests.ok

  // --- blast radius ----------------------------------------------------------
  const testFiles = scenarioFiles.filter((f) => f.includes('.test.') || f.includes('.spec.')).length
  result.blastRadius =
    scenarioFiles.length + testFiles + featureNames.size + (result.causeToSymptomDistance ?? 1)

  // --- invariantes -----------------------------------------------------------
  const violations = checkInvariants(condition, app)
  result.invariantsOk = violations.length === 0
  result.invariantViolations = violations

  return result
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CONDITIONS_LIST = ['BASELINE', 'COUPLED-A', 'COUPLED-B', 'COUPLED-C']
const SCENARIOS_LIST = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']
const APPS = ['react', 'angular']
const CELLS = []
for (const c of CONDITIONS_LIST)
  for (const s of SCENARIOS_LIST) for (const a of APPS) CELLS.push(`${c}:${s}:${a}`)

// Tests que fallan solo por la condición (sin escenario), por framework
const COND_FAILING = { react: [], angular: [] }

function main() {
  if (!existsSync(join(LAB, 'package.json'))) {
    console.error(`Copia experimental no encontrada: ${LAB}`)
    process.exit(1)
  }
  S0_REF = sh('git rev-parse HEAD').trim()
  const existing = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : null
  const results = existing?.results ?? {}

  console.log(`Copia experimental: ${LAB} (S0=${S0_REF.slice(0, 7)})`)
  console.log(`Celdas: ${CELLS.length} (4 condiciones x 6 escenarios x 2 frameworks)`)

  for (const condition of CONDITIONS_LIST) {
    if (ONLY_COND && condition !== ONLY_COND) continue
    resetToS0()
    CONDITIONS[condition].apply()
    const condFiles = diffFiles(S0_REF)
    const condTc = runCmd('pnpm --filter react-app typecheck')
    // Snapshot de la condición: los escenarios se miden como diff contra él
    sh(
      `git add -A && git -c user.name=lab -c user.email=lab@local commit -q -m "cond ${condition}" 2>/dev/null || true`,
    )
    COND_REF = sh('git rev-parse HEAD').trim()
    // Registrar los tests que fallan solo por la condición (baseline por framework)
    for (const app of APPS) {
      const testCmd =
        app === 'react' ? 'pnpm --filter react-app test' : 'pnpm --filter angular-app test'
      const condTests = runCmd(testCmd)
      COND_FAILING[app] = condTests.ok ? { files: [], names: [] } : extractFailing(condTests.out)
    }
    console.log(
      `\n== ${condition} (${CONDITIONS[condition].label}) — condFiles=${condFiles.length} typecheck=${condTc.ok ? 'ok' : 'FAIL'} condTestsReact=${COND_FAILING.react.length} ==`,
    )
    for (const scenario of SCENARIOS_LIST) {
      for (const app of APPS) {
        const key = `${condition}:${scenario}:${app}`
        if (results[key]) {
          console.log(`  [skip] ${key}`)
          continue
        }
        // Reset al snapshot de la condición + dist limpio (gitignore no se
        // revierte con reset; un M1/M6 previo pudo dejar la regla modificada)
        sh(`git reset --hard ${COND_REF} 2>/dev/null || true; git clean -fdq 2>/dev/null || true`)
        sh('pnpm --filter @operations-hub/domain build', { timeout: 120000 })
        console.log(`  [run ] ${key}`)
        const cell = runCell(condition, scenario, app)
        results[key] = cell
        writeFileSync(
          RESULTS,
          JSON.stringify(
            {
              experiment: 'coupling-phase18',
              capturedAt: new Date().toISOString(),
              objective:
                'Medir cuánto empeoran el mantenimiento y la localización de bugs cuando se introduce acoplamiento arquitectónico deliberado (import feature→feature y/o duplicación de regla de dominio), comparando una baseline limpia con variantes acopladas, en React y Angular, sobre el mismo dominio y features, en copia aislada con historial propio.',
              method: {
                summary:
                  '4 condiciones (BASELINE, COUPLED-A feature→feature tasks→teams, COUPLED-B duplicación de computeCompletionRate en dashboard, COUPLED-C ambos) x 6 escenarios (M1 regla duplicada, M2 UI, M3 eliminar funcionalidad, M4 contrato, M5 bug semántico en dependencia, M6 regla central) x 2 frameworks = 48 celdas. Proxies estructurales (git diff/grep/typecheck/tests); NO tiempo humano. M4 y M5 son condition-aware (en baseline usan el equivalente local sin acoplamiento). filesAffectedByScenario = incremento del escenario sobre la condición (aislado).',
                conditions: {
                  BASELINE: 'arquitectura limpia (0 imports feature→feature, reglas centralizadas)',
                  'COUPLED-A': 'import feature→feature tasks→teams (userTeamName)',
                  'COUPLED-B': 'dashboard duplica computeCompletionRate del dominio',
                  'COUPLED-C': 'ambos acoplamientos combinados',
                },
                limitations:
                  'Proxies estructurales; tamaño del proyecto pequeño; la duplicación es funcionalmente equivalente inicialmente; M4 rompe contrato (esperado); harness por paquete (react-app/angular-app/domain).',
              },
              results,
            },
            null,
            2,
          ),
        )
        console.log(
          `       -> files=${cell.filesAffectedByScenario.length} loc=${cell.locTouched} blast=${cell.blastRadius} fi=${cell.importsFeatureToFeature} dup=${cell.duplicatedRules} tc=${cell.typecheckOk ? 'ok' : 'ERR'} tests=${cell.testsFailing}`,
        )
      }
    }
  }

  const data = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const total = Object.keys(data.results).length
  console.log(`\nCeldas completadas: ${total}/${CELLS.length}`)
  if (total !== CELLS.length) {
    console.error('Validación obligatoria fallida: celdas incompletas')
    process.exit(1)
  }
  console.log('JSON válido. Exit 0.')
}

main()
