// Loading and validation of the canonical deterministic fixture.
// Source of truth: docs/architecture/dataset.md.

import rawFixture from '../fixtures/operations-hub-v1.json'
import type { Dataset } from './types'
import { validateDataset } from './rules'

export const FIXTURE_VERSION = 'v1'

// resolveJsonModule widens string unions (e.g. status) to `string`, so the raw
// import is cast after being validated by validateDataset below.
const fixture = rawFixture as unknown as Dataset

/**
 * Loads the canonical Operations Hub v1 fixture, validates it and returns it
 * typed as a Dataset. Throws an explicit error when the fixture is invalid.
 * The returned object must be treated as read-only.
 */
export function loadFixture(): Dataset {
  if (fixture.datasetVersion !== FIXTURE_VERSION) {
    throw new Error(
      `Unexpected fixture version "${String(fixture.datasetVersion)}" (expected "${FIXTURE_VERSION}")`,
    )
  }
  const issues = validateDataset(fixture)
  if (issues.length > 0) {
    throw new Error(
      `Invalid Operations Hub fixture (${issues.length} issues):\n- ${issues.join('\n- ')}`,
    )
  }
  return fixture
}
