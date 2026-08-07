import { boot } from '@engine'
import script from './script.wn'

boot({
  mount: document.getElementById('app')!,
  script,
  novelId: 'kieta-ippen',
})
