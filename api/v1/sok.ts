import { handleV1Search, v1 } from '../../src/server/v1.js'

export default {
  fetch(request: Request) {
    return v1(handleV1Search)(request)
  },
}
