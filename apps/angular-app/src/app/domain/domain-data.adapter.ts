import { Injectable } from '@angular/core'
import { loadFixture, type Dataset } from '@operations-hub/domain'

// Boundary between "how the app obtains data" and the domain itself.
// Today the data comes from the bundled deterministic fixture; later this
// adapter can be replaced by an API client without touching the rest of the app.
@Injectable({ providedIn: 'root' })
export class DomainDataAdapter {
  load(): Dataset {
    return loadFixture()
  }
}
