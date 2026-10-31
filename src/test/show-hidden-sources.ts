// Gör dolda källor (Avesta) synliga i testerna. Avesta är fixturen för den statiska vägen.
// Listan ändras på plats, så att getSource och de andra funktionerna i registret ser samma lista.
import { ALL_SOURCES, SOURCES } from '@/sources'

SOURCES.splice(0, SOURCES.length, ...ALL_SOURCES)
