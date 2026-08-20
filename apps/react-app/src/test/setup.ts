import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// @testing-library/react cannot auto-register cleanup without vitest globals,
// so it is wired explicitly here.
afterEach(() => {
  cleanup()
})
