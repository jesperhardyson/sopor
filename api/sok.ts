import { handleSearch } from '../src/server/handlers.js'

export default {
  fetch(request: Request) {
    return handleSearch(new URL(request.url))
  },
}
