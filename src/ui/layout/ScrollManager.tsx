import { useEffect } from 'react'
import { useLocation } from 'react-router'

/** Till toppen vid sidbyte, eller till ankaret (t.ex. /#mina-adresser) när det finns. */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])
  return null
}
