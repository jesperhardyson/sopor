import { handleIcs } from '../src/server/handlers.js'

export default {
  fetch(request: Request) {
    return handleIcs(new URL(request.url))
  },
}
