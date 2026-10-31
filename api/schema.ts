import { handleSchedule } from '../src/server/handlers.js'

export default {
  fetch(request: Request) {
    return handleSchedule(new URL(request.url))
  },
}
