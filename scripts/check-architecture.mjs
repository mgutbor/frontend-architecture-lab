import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const appRoots = [join(root, 'apps', 'react-app', 'src'), join(root, 'apps', 'angular-app', 'src')]
const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)))
    } else if (/\.(?:[cm]?[jt]sx?|html)$/.test(entry.name)) {
      files.push(path)
    }
  }

  return files
}

function featureName(filePath) {
  const match = filePath.match(/[\\/]features[\\/]([^\\/]+)/)
  return match?.[1] ?? null
}

function collectImportPaths(content) {
  return [...content.matchAll(importPattern)]
    .map((match) => match[1] ?? match[2])
    .filter((value) => value !== undefined)
}

function resolveRelativeImport(sourceFile, importPath) {
  if (!importPath.startsWith('.')) return null
  return resolve(sourceFile, '..', importPath)
}

export async function findArchitectureViolations(projectRoot = root) {
  const violations = []
  const projectAppRoots = [
    join(projectRoot, 'apps', 'react-app', 'src'),
    join(projectRoot, 'apps', 'angular-app', 'src'),
  ]

  for (const appRoot of projectAppRoots) {
    const files = await listFiles(appRoot)

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      for (const importPath of collectImportPaths(content)) {
        const importedFile = resolveRelativeImport(file, importPath)
        if (!importedFile) continue

        const sourceFeature = featureName(file)
        const targetFeature = featureName(importedFile)
        if (sourceFeature && targetFeature && sourceFeature !== targetFeature) {
          violations.push({
            type: 'feature-to-feature-import',
            file: relative(projectRoot, file),
            importPath,
          })
        }
      }
    }
  }

  const domainRoot = join(projectRoot, 'packages', 'domain')
  for (const file of await listFiles(domainRoot)) {
    const content = await readFile(file, 'utf8')
    for (const importPath of collectImportPaths(content)) {
      if (importPath.includes('/apps/') || importPath.includes('/features/')) {
        violations.push({
          type: 'domain-imports-application',
          file: relative(projectRoot, file),
          importPath,
        })
      }
    }
  }

  return violations
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = await findArchitectureViolations()
  if (violations.length > 0) {
    console.error('Architecture violations detected:')
    for (const violation of violations) {
      console.error(`- ${violation.type}: ${violation.file} -> ${violation.importPath}`)
    }
    process.exitCode = 1
  } else {
    console.log(
      'Architecture check passed: no direct feature-to-feature imports or domain-to-application imports.',
    )
  }
}
