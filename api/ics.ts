import { handleIcs } from '../src/server/handlers'

export default {
  fetch(request: Request) {
    return handleIcs(new URL(request.url))
  },
}
