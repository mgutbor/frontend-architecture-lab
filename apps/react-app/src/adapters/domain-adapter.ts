import { loadFixture, type Dataset } from '@operations-hub/domain'

// Boundary between "how the app obtains data" and the domain itself.
// Today the data comes from the bundled deterministic fixture; later this
// function can be replaced by an API client without touching the rest of the app.
export function loadDomainDataset(): Dataset {
  return loadFixture()
}
