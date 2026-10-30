import { handleSchedule } from '../src/server/handlers'

export default {
  fetch(request: Request) {
    return handleSchedule(new URL(request.url))
  },
}
