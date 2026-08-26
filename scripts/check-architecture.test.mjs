import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findArchitectureViolations } from './check-architecture.mjs'

async function createFixture(importLine = '') {
  const root = await mkdtemp(join(tmpdir(), 'architecture-check-'))
  await mkdir(join(root, 'apps/react-app/src/features/alpha'), { recursive: true })
  await mkdir(join(root, 'apps/react-app/src/features/beta'), { recursive: true })
  await mkdir(join(root, 'apps/angular-app/src'), { recursive: true })
  await mkdir(join(root, 'packages/domain/src'), { recursive: true })
  await writeFile(join(root, 'apps/react-app/src/features/alpha/alpha.ts'), importLine)
  await writeFile(join(root, 'apps/react-app/src/features/beta/beta.ts'), '')
  return root
}

describe('architecture guardrail', () => {
  it('detects direct feature-to-feature imports', async () => {
    const fixture = await createFixture("import { beta } from '../beta/beta'\n")
    const violations = await findArchitectureViolations(fixture)
    await rm(fixture, { recursive: true, force: true })

    expect(violations).toEqual([
      {
        type: 'feature-to-feature-import',
        file: 'apps/react-app/src/features/alpha/alpha.ts',
        importPath: '../beta/beta',
      },
    ])
  })

  it('allows a feature to import the public domain package', async () => {
    const fixture = await createFixture("import { loadFixture } from '@operations-hub/domain'\n")
    const violations = await findArchitectureViolations(fixture)
    await rm(fixture, { recursive: true, force: true })

    expect(violations).toEqual([])
  })
})
