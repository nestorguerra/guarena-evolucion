# Guareña · Evolución

Copia de [Guareña · Vegas Altas](https://github.com/nestorguerra/guarena) para seguir evolucionando el juego. Aquella
queda **fija en su versión 42** (la etiqueta `v42-fija` de este repositorio es ese mismo punto); los cambios nuevos van
aquí. Las dos versiones no se pisan: cada una guarda su partida (la primera vez, esta empieza desde la partida de la
fija, sin tocarla), su caché de personajes y sus salas online, y el servidor multijugador propio de esta usa el
puerto 8921.

Juego de mundo abierto en el Guareña real (Badajoz, Extremadura), en el navegador: sus calles de
OpenStreetMap, los edificios del Catastro con su número de plantas, la Iglesia de Santa María, la Plaza de
España, el Pantano de San Roque, los naranjos y plátanos de sus calles, los olivares, viñas y encinas del campo, los
geranios de las ventanas y las amapolas de los solares… Misiones, coches, motos y bicis, tráfico, peatones, policía, bares, trabajos,
casas por dentro (sus ventanas dan a la calle de verdad), las tiendas del pueblo para entrar y comprar, un
inventario, tu casa para decorarla y con caja fuerte, la armería, la pesca en el pantano, radio, un modo
zombis y multijugador con tus amigos.

Desde la versión 32 se ve **como un anime**, inspirado en la estética del juego web
[Messenger](https://messenger.abeto.co/) (Abeto): luz de dos tonos con sombras frías, contornos de tinta
dibujados a partir de la profundidad, texturas repintadas en colores planos, cielo turquesa con nubes planas, árboles de
copas redondeadas y caras de ojos grandes y piel lisa. El aspecto fotográfico de antes sigue en *Ajustes › Estilo
visual › Realista*.

En *Ajustes › Estética* el manga se cambia al momento por la **Acuarela de dehesa**: aguadas claras sobre papel de
grano, el pigmento acumulado donde se tocan dos colores, el papel en blanco para las luces y un lápiz suave debajo.

![Guareña desde el aire: la Iglesia de Santa María y la Plaza de España con el Ayuntamiento](docs/portada.jpg)

## Jugar

- **En el navegador:** https://nestorguerra.github.io/guarena-evolucion/ (la versión fija sigue en https://nestorguerra.github.io/guarena/)
- **Multijugador online, sin servidor:** en esa misma página, *Multijugador* (o *Pausa › Jugar online*). Entras en
  la sala pública: ves por la calle a todos los que estén jugando online en ese momento, con su nombre encima, en el
  radar y en el mapa, y podéis hablar por el chat (T). Con *Crear sala privada* tienes un enlace propio
  (`…/guarena-evolucion/#sala-XXXXX`) que solo conoce quien tú se lo mandes. Ver [Cómo funciona el online](#cómo-funciona-el-online).

Funciona en Chrome, Edge, Safari y Firefox con WebGL2, en ordenador y en móvil (con teclado y ratón, mando o
pantalla táctil). La primera vez necesita internet para descargar la librería 3D (three.js).

## Cómo funciona el online

GitHub Pages solo sirve archivos, así que no hay servidor del juego: los navegadores se conectan **directamente
entre ellos** (WebRTC, con los servidores STUN públicos de Google y Cloudflare para atravesar los routers). Para
encontrarse usan unos servidores públicos y gratuitos de mensajería (MQTT de EMQX y HiveMQ) por los que solo pasan
las presentaciones, cifradas con la clave de la sala (AES-GCM). Si dos jugadores no consiguen verse directamente
(pasa con algunas redes móviles), sus mensajes viajan cifrados por esos mismos servidores, a menos veces por
segundo. Caben 16 jugadores por sala; cada uno simula su propio tráfico y peatones, y se comparten los jugadores,
sus coches, disparos, el chat, los destinos del mapa y la hora del día (la de quien lleva más tiempo en la sala).
Como en cualquier juego en red de igual a igual, quien está en tu sala puede ver tu dirección IP. El código está
en `src/online.js` (el cliente MQTT, la sala y las conexiones) y `src/net.js` (los jugadores en la calle).

## Multijugador en tu ordenador

También puedes montar la sala en tu propio ordenador (hace falta Python 3):

```bash
python3 tools/build.py
python3 multijugador/servidor.py
```

Se abre el juego en el navegador; en *Multijugador* verás el enlace para tu amigo, en tu misma WiFi o por
internet (con un túnel gratuito, sin cuentas ni tocar el router). En la carpeta `multijugador/` hay accesos
directos de doble clic para macOS y Windows; más detalles en `multijugador/LEEME.txt`.

Las emisoras de radio reales de la zona suenan en directo en GitHub Pages, en el servidor y en tu ordenador; la
copia publicada en claude.ai no puede conectar con ellas y usa las tres emisoras del juego.

## El servidor en internet (Render)

`render.yaml` describe el servicio: empaqueta el juego (`python3 tools/build.py`) y arranca
`python3 multijugador/servidor.py --nube`, que sirve el juego y conecta a los jugadores (WebSocket, o sondeo HTTP
si algo corta los WebSocket). Solo usa la biblioteca estándar de Python; caben 8 jugadores por sala.

Para montarlo en tu cuenta: [Desplegar en Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/nestorguerra/guarena-evolucion)
(plan gratuito). Cada vez que se sube algo a `main` se vuelve a desplegar solo.

## Desarrollar

```bash
python3 tools/devserver.py 8918     # http://localhost:8918/index.html · el código fuente, sin empaquetar
python3 tools/build.py              # dist/guarena-evolucion.html: el juego en un solo archivo
python3 tools/build_map.py          # regenera data/map.json desde OpenStreetMap y el Catastro
```

- `index.html` — pantallas, HUD y estilos · `src/` — el juego (módulos ES, three.js) · `assets/` — texturas y sonidos
- `data/map.json` — el pueblo ya procesado; `data/guarena.osm` el callejero de partida (los edificios del
  Catastro se descargan con `tools/fetch_catastro.py`)
- `tools/` — empaquetado, servidor local, mapa y pruebas automáticas: `audit.js` recorre todas las calles a pie
  y en coche, `missionbot.js` juega las misiones, `playtest.js` conduce, pelea, hace de taxista… `faces.js`
  retrata a los personajes de cerca
- `multijugador/` — el servidor de la sala · `.github/workflows/pages.yml` — publica el juego en GitHub Pages

Si defines la variable de repositorio `GUARENA_MP_URL` con la dirección de un servidor propio, las copias que no
pueden jugar online (navegadores sin WebRTC) enlazan con él desde la pantalla *Multijugador*.

## Datos y créditos

- Callejero © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), bajo la licencia
  ODbL: `data/map.json` y `data/guarena.osm` contienen esos datos y se comparten con la misma licencia.
- Edificios: Dirección General del Catastro (servicio INSPIRE), reutilizables citando la fuente.
- Texturas fotográficas: [Poly Haven](https://polyhaven.com) (CC0). Sonidos de zombis:
  [OpenGameArt](https://opengameart.org) (CC0).
- Caras, ojos, cejas, pestañas y peinados: [MakeHuman](http://www.makehumancommunity.org) (CC0: la malla base,
  sus deformaciones y los recursos del sistema). `tools/mh_import.py` los convierte en `assets/mh/`.
- El cuerpo del protagonista, su esqueleto, sus pesos de piel y sus expresiones faciales: también de
  [MakeHuman](http://www.makehumancommunity.org) (CC0); `tools/hero_import.py` los convierte en `assets/hero/body.bin.gz`.
- Captura de movimiento del protagonista: *The data used in this project was obtained from
  [mocap.cs.cmu.edu](http://mocap.cs.cmu.edu). The database was created with funding from NSF EIA-0196217.*
  (CMU Graphics Lab Motion Capture Database: se puede incluir en un producto, no revender los datos).
  `tools/mocaplab.js` la adapta al esqueleto del juego en `assets/hero/moves.bin.gz`.
- Personajes, vehículos, historias y misiones son ficticios. Los bares y comercios llevan nombres inventados:
  ningún negocio real aparece por su nombre.
