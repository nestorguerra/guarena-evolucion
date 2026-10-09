# Guareña · Evolución

Copia de [Guareña · Vegas Altas](https://github.com/nestorguerra/guarena) para seguir evolucionando el juego. Aquella
queda **fija** (la versión 42, con Annie de protagonista desde su puerta en la calle Malfeitos); esta sigue con
**Álex** y los cambios nuevos van aquí. La etiqueta `v42-fija` de este repositorio es el punto de partida. Las dos
versiones no se pisan: cada una guarda su partida (la primera vez, esta empieza desde la partida de la
fija, sin tocarla), su caché de personajes y sus salas online, y el servidor multijugador propio de esta usa el
puerto 8921.

Juego de mundo abierto en el Guareña real (Badajoz, Extremadura), en el navegador: sus calles de
OpenStreetMap, los edificios del Catastro con su número de plantas, la Iglesia de Santa María, la Plaza de
España, el Pantano de San Roque, los naranjos y plátanos de sus calles, los olivares, viñas y encinas del campo, los
geranios de las ventanas y las amapolas de los solares… Misiones, coches, motos y bicis, tráfico, peatones, policía, bares, trabajos,
casas por dentro (sus ventanas dan a la calle de verdad), las tiendas del pueblo para entrar y comprar, un
inventario, tu casa para decorarla y con caja fuerte, la armería, la pesca en el pantano, radio, un modo
zombis (oleadas cada vez más grandes y más rabiosas, y zombis gigantes, el triple de grandes) y multijugador con tus
amigos.

Se ve de dos formas (*Ajustes › Estética*; el cambio se aplica al recargar):
- **Plastilina**, con la que arranca siempre: Guareña como una película de stop motion de plastilina.
- **Realista**: el aspecto fotográfico, con texturas escaneadas y el cielo físico.

La **Plastilina** es Guareña como una película de stop motion de plastilina (claymation), a la manera de Aardman,
*La LEGO Película* o *Kirby and the Rainbow Curse* (el plan, la investigación y la evaluación, en
[docs/plastilina.md](docs/plastilina.md)):
- Todo lo iluminado es plastilina: bultos de modelar a mano, huellas de pulgar con sus surcos, alisados de dedo,
  cortes de espátula, alguna pelusa, color amasado y un brillo céreo; ni una fotografía.
- Formas blandas: las casas con las esquinas redondeadas, el canto de arriba, el zócalo y los huecos de puertas y
  ventanas blandos; marcos, balcones, muebles y bancos como losas de plastilina; rejas de churro; árboles de bolas;
  coches gorditos con ventanas pintadas.
- Muñecos: cada cabeza esculpida como la de un muñeco de plastimación a partir de la cara de la persona (nariz de
  bola, boca ancha y sonriente, mejillas llenas, la cara alisada como con el pulgar), piel lisa de plastilina, ojos de
  cuenta, cejas de churro, pelo modelado con surcos de peine y algo más de cabeza y manos.
- La iglesia y los edificios de piedra, con piedras de plastilina metidas en una masa más blanda.
- Cielo de decorado con nubes de algodón, humo de algodón, luz de estudio cálida con sombras suaves y, como en una
  maqueta fotografiada, el fondo lejano apenas suave.
- **Stop motion**, siempre en la Plastilina: personas, perros y coches posan 12 veces por segundo (el agua, el viento y
  el humo también); en cada pose la superficie de los muñecos «hierve» un milímetro o dos y quedan un poco distintos,
  como recolocados a mano. La cámara, tu personaje (su pose también, en cada fotograma: corre fluido) y tu coche van
  fluidos, para jugar igual que siempre.
- Como las imágenes de referencia del usuario, medido superficie a superficie (`tools/refcompare.js`):
  - cámara de maqueta a la altura de la calle;
  - paredes crema alisadas a mano;
  - calzada de arcilla gris rosada;
  - aceras de losas color arena y bordillos de rulo de plastilina;
  - plazas de adoquines grises con juntas oscuras y albero en losas de arenisca;
  - árboles como brócolis de bolitas y palmeras de hojas gordas;
  - la iglesia de piedras de colores con su cono de tejas;
  - rejas negras gordas, geranios y cipresitos en macetas al pie de las ventanas;
  - nubes de algodón delante de un cielo pintado.
- Pelo de plastilina con surcos de palillo y ropa modelada (sin el tejido de la ropa de verdad); un contraluz cálido de
  estudio separa a los muñecos del decorado. En calidad alta, a 1,5× en las pantallas de alta densidad (Retina), con la
  oclusión de contacto a media resolución; la resolución dinámica baja de ahí solo si la GPU no llega.

Todo está en `src/plastilina.js` (también la oclusión de contacto, `STUDIO_AO`, y la gradación final, `ClayGrade`) y en
las ramas `STYLE.plastilina` de casas, fachadas, árboles, personajes, coches y cielo (las cabezas de muñeco, en
`charbuild.js`: `MH_PUPPET` y `puppetShape`). `tools/lookcompare.js` saca las tres vistas de prueba (hacia Santa María,
una calle estrecha y un cruce), los primeros planos (`closeups`), vídeos del juego (`walkVideo`) y el tiempo por
fotograma (`perf`); `tools/refcompare.js` reproduce las imágenes de referencia y `tools/puppetlab.js` enseña las caras
sin y con el esculpido de muñeco.

**Cómo corre Álex** (en [docs/carrera.md](docs/carrera.md), con lo investigado en otros juegos y las medidas):
- Captura de movimiento real elegida por *motion matching*, con bucles de esprint, rectos y en curva.
- Pies que no patinan: bloqueados al suelo en cada pisada, con zancada alargada al esprintar y piernas giradas hacia
  donde va el cuerpo en curvas y quiebros (*stride* y *orientation warping*, como en Unreal).
- Se inclina en las curvas y al acelerar, con la cabeza nivelada.
- Pisadas con su ruido y, al esprintar, una pizca de polvo.
- La cámara le sigue con muelles: suave, mirando un poco por delante, detrás de él al correr, algo más abierta al
  esprintar y sin tirones contra postes ni paredes.

`tools/runlab.js` juega carreras de prueba y las mide.

**Un pueblo que vive** (en [docs/ciudadanos.md](docs/ciudadanos.md), con los datos, las normas y las medidas):
- **El padrón**: los 6.665 vecinos de Guareña (INE, 1 de enero de 2025), en 2.818 hogares sobre las puertas reales del
  mapa y con la pirámide de edades del pueblo. Cada uno tiene nombre, dos apellidos (y a veces el mote de la familia),
  dirección, oficio, familia, amigos y una rutina para cada día de la semana. Los vecinos son inventados; el número y
  las edades, los reales.
- **La gente que ves son esos vecinos**: la misma cara, el mismo nombre y la misma memoria cada vez. Cuántos hay y dónde
  sale de sus rutinas:
  - el pan a primera hora;
  - la puerta del colegio a las nueve y a las dos;
  - el mercadillo de los miércoles;
  - la salida de misa;
  - el paseo de la tarde por la Plaza de España;
  - las sillas del fresco a la puerta por la noche.
- **Civismo a pie**:
  - Por la acera, rodeando farolas, contenedores y corros.
  - Cruzan por el paso de cebra si hay uno a menos de 40 m, o por la esquina, mirando a los dos lados y esperando a que
    los coches puedan parar.
  - Hacen cola en la panadería y se saludan según se conozcan.
  - Las familias van juntas; los niños, de la mano, y a las dos salen corriendo del colegio hacia quien los recoge.
- **Conversaciones con memoria**: eliges qué decir (presentarte, qué tal, qué se cuenta, adónde va, a qué se dedica,
  cómo se va a un sitio…). Te contesta con su vida, con las noticias del día en el pueblo, que corren de boca en boca, y
  con lo que hablasteis la última vez.
- **Coches, motos y bicis por el Reglamento General de Circulación**:
  - 20, 30, 50 y 90 km/h según la vía; STOP con parada completa; ceda el paso; prioridad a la derecha.
  - Ceden a los peatones en los pasos de cebra y al girar; 1,5 m al adelantar a una bici.
  - Arrancan y frenan con calma. Las motos llevan casco.
  - El mercadillo corta su carretera los miércoles de 9 a 14.

`tools/townlab.js` lo mide en siete escenas del pueblo: la gente, el civismo, el tráfico y las conversaciones.

**El tiempo de Guareña, en directo** (en [docs/tiempo.md](docs/tiempo.md)):
- Fuente: las condiciones actuales del pueblo según [Open-Meteo](https://open-meteo.com), gratis y sin clave.
- Cuándo: al empezar la partida y cada 10 minutos.
- Qué cambia: si allí está despejado, nuboso, cubierto, llueve, hay niebla, tormenta (con relámpagos y truenos) o
  nieve, el juego lo refleja poco a poco, en las dos estéticas.
- Dónde se ve: una línea discreta bajo el reloj dice qué tiempo hace y de qué hora es el dato (por cuartos de hora: es
  una estimación de un modelo meteorológico, no una estación).
- Si falla la red: se queda el último dato, marcado como antiguo.
- El reloj del juego, el día y la noche y las rutinas no cambian. En *Ajustes › Tiempo de Guareña* se puede volver al
  tiempo del juego.
- No funciona en la página publicada en claude.ai, que no deja consultar otras webs; sí en GitHub Pages y en la
  versión del ordenador.

**La calle Malfeitos, casa por casa** (en [docs/malfeitos.md](docs/malfeitos.md)):
- Las 24 fachadas de sus dos aceras modeladas a mano con las medidas sacadas de 21 fotos de la calle (Street View, mayo
  de 2024), que solo sirvieron de referencia: en el juego no hay ni un píxel de ellas.
- Cada puerta, ventana, balcón, cochera y escaparate en su sitio y de su tamaño; los colores de cada pintura, zócalo y
  recercado; las alturas; rejas, persianas, toldos, cañizos, números, buzones, farolas y cables. En las dos estéticas.
- Donde el Catastro deja un hueco y las fotos tienen casa, el juego la levanta.
- `src/fachadas.js` hace las fachadas medidas; los datos de la calle están en `src/malfeitos.js`.

**Muros sólidos y una cámara que no los atraviesa** (en [docs/solidez.md](docs/solidez.md)):
- Las casas del Catastro, soldadas en hileras: las esquinas vecinas se unen, las que tocan una pared se apoyan en ella,
  y cada grieta de hasta 1,3 m entre dos paredes, medida cada 25 cm, se cierra con un trozo de muro de pared a pared
  (`src/solidez.js`). Ya no se ve a través de las juntas: los metros de pared frente a una grieta de menos de 10 cm
  pasan de 39.900 a 0, y no queda ninguna de menos de 1,2 m en todo el pueblo.
- Cada pared se esconde solo donde de verdad tiene una vecina detrás, y los muros chocan hasta la cumbrera.
- La cámara es una bola de 45 cm que se para al tocar un muro o un tejado, sin distancia mínima, y comprueba las
  esquinas de su encuadre. Girada del todo junto a 300 fachadas a tres alturas, en las dos estéticas (88.830
  fotogramas): nunca dentro de una casa (antes, en el 29 % de los fotogramas).

**Las aceras, medidas en las ortofotos del PNOA** (en [docs/aceras.md](docs/aceras.md)):
- Los bordillos medidos en las fotos aéreas del IGN de 2025, 2022, 2019 y 2016 (`tools/aceras/`, `data/aceras.json`).
- El juego tiende cada bordillo metro a metro a lo largo de las casas (`src/kerbs.js`): una acera de un metro para andar
  donde la calzada tiene sitio, una sola acera en las calles estrechas, plataforma única en las más estrechas. Asfalto,
  carriles, aparcamientos, mobiliario y peatones salen de ese bordillo.
- Revisadas todas las calles sobre las fotos (584, 104 hojas): 277 bordillos de 157 calles puestos a mano donde no caían
  en su sitio (`data/bordillos.json`), y tres calles cerradas, con la línea de OpenStreetMap bajo las casas, llevadas
  a su sitio y abiertas.
- El 94,6 % de cada lado de calle tiene acera para andar (antes, el 76,6 %); no queda ninguna tira ni casa sobre el
  bordillo. Los peatones van por la acera en el 98,8 % de su camino (antes, el 13,8 % dentro de una pared).

**Fluido** (en [docs/fluidez.md](docs/fluidez.md), con el análisis, la estrategia y las medidas):
- Medido antes y después en el bucle del propio juego (un Chrome con la GPU, pantalla Retina de 1440 × 900, calidad
  alta), conduciendo pasa de 21 a 51 fotogramas por segundo (+138 %), andando de 23 a 51 (+126 %) y en la plaza
  llena de 22 a 45 (+106 %); los fotogramas de más de 50 ms, de 171 a ninguno en 40 s conduciendo.
- Sin los tirones de antes:
  - la textura de la plastilina ya no sube otra vez a la GPU cada vez que aparece algo nuevo (eran parones de medio
    segundo a dos segundos);
  - las fachadas de cada calle se construyen poco a poco y antes de llegar, y se guardan hechas;
  - el cielo y los árboles ya no lo rehacen todo cada pocos segundos.
- Más fotogramas:
  - en la GPU, la Plastilina a 1,5× en pantallas Retina y la oclusión de contacto a media resolución;
  - en la CPU, cada pose de la gente se calcula una vez, cuando el *stop motion* la va a enseñar, y el renderizador ya
    no recorre los huesos.
- La resolución dinámica solo baja la nitidez si es la GPU la que no llega; la carga ya no espera hasta 7 s a un cuerpo
  que Álex no usa.
- `tools/perf/` repite las medidas (un Chrome sin ventana, antes y después por turnos) y `tools/perflab.js` las hace
  en la página.

**Música y sonido**:
- **Música de fondo «Liminal»**, la de los sitios vacíos de madrugada: acordes largos y difusos que no acaban de
  resolverse, alguna campana lejana con su eco, una sala grande y una cinta que ondula y sisea un poco. Se hace en el
  propio juego mientras suena (nunca igual, sin grabaciones), va bajita y se aparta cuando pones la radio. *Ajustes ›
  Música de fondo* la apaga; el volumen es el de *Música*.
- **Los coches, más bajos y tranquilos**: el motor suena de 8 a 11 dB más bajo y más suave (menos saturado y menos
  áspero, sin petardeos del escape) y el chirrido de las ruedas, más bajo.

**El modo zombis**: cada oleada trae más zombis (9, 16, 25, 36, 49…) y más rabiosos (más rápidos, más que corren,
muerden más fuerte y más a menudo y un disparo los frena menos). Desde la segunda, **zombis gigantes**, el triple de
grandes: lentos y durísimos, el suelo tiembla a cada paso, cargan de lejos y de cerca dan un mazazo con los dos brazos
que te tumba o aplasta tu coche; se enfurecen a media vida. Tienen su barra de vida arriba y tumbar uno da 150 € y
50 más por oleada.

**Las sombras, quietas**: la caja de sombras del sol se encaja en su propia rejilla y se centra donde mira la cámara;
al moverse ya no parpadean ni dejan trozos de calle saltando de la sombra a la luz (se veía sobre todo en el vuelo del
menú).

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
python3 tools/build_map.py          # regenera data/map.json desde OpenStreetMap, el Catastro y data/aceras.json
python3 tools/aceras/pnoa.py        # descarga las ortofotos del PNOA (a .cache/pnoa, fuera del repositorio)
python3 tools/aceras/medir.py       # mide los bordillos en ellas; final.py escribe data/aceras.json
```

- `index.html` — pantallas, HUD y estilos · `src/` — el juego (módulos ES, three.js) · `assets/` — texturas y sonidos
- `data/map.json` — el pueblo ya procesado; `data/guarena.osm` el callejero de partida (los edificios del
  Catastro se descargan con `tools/fetch_catastro.py`)
- `tools/` — empaquetado, servidor local, mapa y pruebas automáticas: `audit.js` recorre todas las calles a pie
  y en coche, `missionbot.js` juega las misiones, `playtest.js` conduce, pelea, hace de taxista… `faces.js`
  retrata a los personajes de cerca, `runlab.js` graba y mide carreras (pies, cámara, temblor), `mocaplab.js`
  adapta la captura de movimiento (`appendDB` añade tomas sin tocar las que ya hay), `townlab.js` mide la vida del
  pueblo (gente, civismo, tráfico, conversaciones) en siete escenas y `perflab.js` la fluidez (fotogramas, tirones,
  qué cuesta cada parte del dibujo); `tools/perf/` la mide en un Chrome sin ventana, antes y después de un cambio
- `multijugador/` — el servidor de la sala · `.github/workflows/pages.yml` — publica el juego en GitHub Pages

Si defines la variable de repositorio `GUARENA_MP_URL` con la dirección de un servidor propio, las copias que no
pueden jugar online (navegadores sin WebRTC) enlazan con él desde la pantalla *Multijugador*.

## Datos y créditos

- Callejero © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), bajo la licencia
  ODbL: `data/map.json` y `data/guarena.osm` contienen esos datos y se comparten con la misma licencia.
- Edificios: Dirección General del Catastro (servicio INSPIRE), reutilizables citando la fuente.
- Las aceras se han medido en las ortofotos del Plan Nacional de Ortofotografía Aérea: *PNOA cedido por © Instituto
  Geográfico Nacional* ([scne.es](https://www.scne.es), licencia
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). En el juego no hay ninguna imagen: solo las medidas
  (`data/aceras.json`).
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
- El tiempo en directo: *Weather data by [Open-Meteo.com](https://open-meteo.com/)*, con licencia
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (uso no comercial gratuito).
- Los vecinos del padrón también son inventados (nombres, familias y oficios al azar). Del INE solo vienen el número de
  habitantes (6.665 a 1 de enero de 2025) y la forma de la pirámide de edades (censo de 2021).
