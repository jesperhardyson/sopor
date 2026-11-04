import { afterEach, describe, expect, it } from 'vitest'
import { EMBEDDED_ID, embeddedData, embeddedScript } from './embedded'

const put = (html: string) => {
  document.body.innerHTML = html
}

describe('inbäddad data', () => {
  afterEach(() => put(''))

  it('läser tillbaka det som bäddats in för samma sökväg', () => {
    put(embeddedScript('/kommuner/a', { name: 'A' }))
    expect(embeddedData('/kommuner/a')).toEqual({ name: 'A' })
  })

  it('använder inte data från en annan sida', () => {
    put(embeddedScript('/kommuner/a', { name: 'A' }))
    expect(embeddedData('/kommuner/b')).toBeUndefined()
  })

  it('hittar datan även med avslutande snedstreck, som Vercel serverar samma fil för', () => {
    put(embeddedScript('/kommuner/a', { name: 'A' }))
    expect(embeddedData('/kommuner/a/')).toEqual({ name: 'A' })
  })

  it('kan inte avsluta skriptblocket i förtid', () => {
    const html = embeddedScript('/kommuner/a', { name: '</script><b>x' })
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    put(html)
    expect(embeddedData('/kommuner/a')).toEqual({ name: '</script><b>x' })
  })

  it('tål att blocket saknas eller är trasigt', () => {
    expect(embeddedData('/kommuner/a')).toBeUndefined()
    put(`<script type="application/json" id="${EMBEDDED_ID}">{trasig</script>`)
    expect(embeddedData('/kommuner/a')).toBeUndefined()
  })
})
