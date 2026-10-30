import { handleSearch } from '../src/server/handlers'

export default {
  fetch(request: Request) {
    return handleSearch(new URL(request.url))
  },
}
