import { handleV1Sources, v1 } from '../../src/server/v1.js'

export default {
  fetch(request: Request) {
    return v1(handleV1Sources)(request)
  },
}
