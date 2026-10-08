# Fluidez: el juego, cómodo de jugar

Estado: hecho en la versión Evolución (8 de octubre de 2026). Lo pidió el usuario: «va un poco a tirones y le cuesta
cargar bien las calles y no va fluido. Diseña una estrategia técnica y de código para mejorar la fluidez…»:

1. analizar el código;
2. analizar las texturas y los objetos;
3. proponer una estrategia para que el juego vaya fluido, en movimiento y en fotogramas por segundo;
4. medir antes del cambio;
5. hacer el cambio;
6. medir después;
7. buscar una mejora de más del 30 %;
8. publicarlo en GitHub para los beta testers.

## Resultado

- **Conduciendo, de 21 a 51 fotogramas por segundo (+138 %)**; andando, de 23 a 51 (+126 %); en la Plaza de España
  llena de gente, de 22 a 45 (+106 %). Muy por encima del 30 % pedido.
- **Sin tirones**: en 40 s conduciendo había 171 fotogramas de más de 50 ms (12 de más de 100 ms); ahora, ninguno. El
  tiempo perdido en tirones baja de 19 s a 0,3 s.
- **Las calles llegan a tiempo**: los detalles de las fachadas se construyen antes de llegar y sin parones (el paso más
  largo, de 56 ms a 8 ms).
- **Se ve igual**: la Plastilina, con sus huellas, sombras de contacto y desenfoque; un pelo más suave a 1:1.
- Publicado en GitHub Pages para los beta testers: https://nestorguerra.github.io/guarena-evolucion/

## Cómo se ha medido

- **Dónde**: un Chrome sin ventana (*headless*) con la GPU de verdad (ANGLE sobre Metal, Apple M5 Pro), a 1440 × 900
  puntos y 2× de densidad, como la pantalla Retina de un portátil. Estética Plastilina, calidad alta (la que el juego
  elige en un ordenador de 8 núcleos o más).
  - El panel del navegador de la app no sirve para esto: fuera de foco da a la página un fotograma cada 2 s, aunque no
    dibuje nada. Nada de lo medido allí sería del juego.
- **Qué**: el bucle del propio juego (`requestAnimationFrame`), con un bot que juega siempre lo mismo
  (`tools/perflab.js`, `live()`):
  - **conducir**: 40 s por las calles principales (de la avenida a la plaza y vuelta);
  - **andar**: 30 s corriendo por calles del casco antiguo;
  - **girar**: 15 s en la Plaza de España girando la cámara entera, con la plaza llena de gente.
- **Las medidas**:
  - los fotogramas por segundo (fps) y lo que tarda cada fotograma (media, mediana, percentiles 95 y 99, el peor);
  - el «1 % más lento» (los fps del percentil 99);
  - los tirones: fotogramas de más de 33, 50 y 100 ms;
  - el tiempo de carga, de abrir la página al menú.
- **Antes y después, por turnos**: la versión de antes (el commit `da54db9`) y la de ahora, servidas a la vez, una
  pestaña nueva para cada prueba, tres rondas alternando cuál va primero (por si el ordenador está más ocupado en un
  momento). Se da la mediana de las tres.
- **El ordenador estaba ocupado** (otras apps, carga media alta): los números absolutos variarán en otro, pero las dos
  versiones se midieron en las mismas condiciones.

## 1. El código: adónde se iba el tiempo

Medido con perfiles de CPU del juego (`tools/perf/profile.py`) y dibujando una vista fija con partes del dibujo
quitadas una a una (`tools/perflab.js`, `costs()` y `variants()`).

### La GPU: 50 ms por fotograma

- **Conduciendo iba a 16–20 fps y el hilo principal estaba parado la mitad del tiempo**: esperaba a la GPU.
- La Plastilina dibujaba a la resolución completa de la pantalla en calidad alta: **2×** en una pantalla Retina,
  2880 × 1800 = 5,2 millones de píxeles por fotograma. Y a cada píxel le pasaban:
  - la escena con antialias MSAA 4× en coma flotante;
  - la oclusión de contacto (GTAO) a resolución completa: 16 muestras y un filtro de 16 más. **Era lo más caro de
    todo: 20–24 ms**, un tercio del fotograma;
  - una copia entera de la imagen y otra pasada para mezclarle esa oclusión;
  - la gradación, dos pasadas del desenfoque de lente (33 lecturas por píxel), el *bloom* y la salida.

### La CPU: 27 ms por fotograma

- **Dibujar** (la parte de la CPU): 22 ms.
  - unas 850 llamadas de dibujo, y 220 más para la sombra del sol;
  - un grafo de escena de 7.100 nodos que se recorría tres veces por fotograma (matrices, vista y sombra), 3.600 de
    ellos huesos de esqueletos, que no se dibujan;
  - el *stop motion*: 2,7 ms en guardar y reponer la pose de cada muñeco, hueso a hueso, dos veces por fotograma. Y en
    cada cuaternión repuesto three.js recalculaba sus ángulos de Euler.
- **La gente**: 4 ms. Su animación se calculaba 60 veces por segundo, pero con el *stop motion* solo se ven 12 poses
  por segundo: cuatro de cada cinco se tiraban.
- **El HUD**: escribía el dinero, la hora, la velocidad y la vida en la página en cada fotograma, cambiasen o no, y el
  navegador recalculaba su maquetación cada vez.

### Los tirones (lo que más se notaba)

- **La textura de la plastilina, subida otra vez a la GPU a cada material nuevo**: medio segundo a dos segundos de
  parón cada vez que aparecía algo nuevo (un coche, un vecino, un objeto). three.js clona los *uniforms* de cada
  material que compila, y clonar una textura la marca como cambiada: la textura de 1024 × 1024 de la plastilina subía
  entera otra vez.
- **Las fachadas de cada calle, de golpe**: los detalles de cada trozo de calle de 56 m (ventanas, rejas, balcones,
  macetas, muebles de la calle) se construían enteros en un fotograma, 15–80 ms, cuando la cámara llegaba a 30 m de
  donde se ven; todos los de menos de 60 m en el mismo fotograma; y se tiraban 90 m más allá, para construirlos otra vez
  al volver. Es el «le cuesta cargar bien las calles»: un tirón, y ventanas sin marco hasta que llegaban.
- **El cielo, cada 3 s**: el mapa de entorno se hacía en un objetivo nuevo cada vez, y todos los materiales del pueblo
  (522) volvían a calcular los parámetros de su *shader* por cambiar de mapa.
- **Los árboles, 4 veces por segundo**: se volvían a mandar a la GPU las matrices de todos (unos 3 MB), en uso o no.
- **La resolución dinámica** bajaba la resolución en cuanto el juego iba por debajo de 50 fps, aunque fuese la CPU la
  que no daba abasto: en este ordenador acababa en 1,2× y seguía yendo a tirones, solo que más borroso.

### La carga

- En una primera visita, la carga esperaba hasta 7 s al cuerpo esculpido de Álex… que Álex no usa (lleva el suyo de
  MakeHuman, `hero.js`), y en la cola de los cuerpos de los vecinos.

## 2. Las texturas y los objetos

En una partida, en la calle (`inventory()` de `tools/perflab.js`):

| | |
|---|---|
| Mallas | 1.190, y 1.861 instanciadas (48.256 instancias: árboles, mobiliario, coches) |
| Personas | 192 mallas con esqueleto (unas 120 personas) |
| Triángulos dibujados por fotograma | 6,5 millones |
| Llamadas de dibujo por fotograma | 845 conduciendo, 1.200 andando por el centro (más 220 de la sombra) |
| Materiales | 522 |
| Programas de *shader* | 174 |
| Texturas | 120, unos 130 MB (dos atlas de 2048², 21 MB cada uno; fotos de 2048 × 1536 y 1536 × 1243) |
| Geometrías en la GPU | 1.638 |
| Mapa de sombras | 4096 × 4096 (64 MB) |
| Pasadas de imagen | escena, GTAO, gradación, lente × 2, *bloom*, salida |
| Objetivos de dibujo a 2× | más de 600 MB (MSAA 4× en coma flotante); a 1,5×, unos 350 MB |

- Las texturas no eran el problema: suben una vez y caben de sobra. Lo eran la que subía una y otra vez (la plastilina)
  y los objetivos de dibujo a resolución completa.
- Los objetos tampoco: los triángulos los dibuja bien la GPU. Pesaban el número de nodos que recorrer y de llamadas de
  dibujo, y construir de golpe las fachadas.

## 3. La estrategia

Primero lo que se nota más (los tirones), luego los fotogramas por segundo, sin tocar cómo se ve:

| Problema | Cambio | Dónde |
|---|---|---|
| Parones de 0,5–2 s al aparecer algo nuevo | La textura de la plastilina, una sola: sus clones son ella misma | `plastilina.js` |
| Tirones al llegar a una calle; ventanas sin detalle | Las fachadas se construyen poco a poco (unas pocas ventanas cada vez, 2,5 ms por fotograma), 60 m antes de verse, la más cercana primero, y se guardan hechas hasta 220 m detrás | `facades.js` |
| Tirón cada 3 s | El mapa de entorno del cielo, siempre en el mismo objetivo | `sky.js` |
| 3 MB a la GPU cuatro veces por segundo | Los árboles, solo cuando la cámara se mueve unos metros, y solo la parte en uso | `trees.js` |
| La GPU, 50 ms: 16–20 fps | Plastilina a 1,5× en las pantallas Retina (44 % menos píxeles); la oclusión de contacto a media resolución, puesta por la gradación (dos pasadas de pantalla menos); la lente con 5 muestras a cada lado en vez de 8 (22 lecturas por píxel en vez de 34) | `game.js`, `plastilina.js` |
| La animación de 120 personas, 60 veces por segundo | Con el *stop motion*, cada pose se calcula una vez, cuando se va a ver: 12 por segundo | `characters.js`, `peds.js` |
| El *stop motion* reponía 30 huesos por muñeco dos veces por fotograma | Entre pose y pose solo cambia dónde está el muñeco: se repone solo eso, sin recalcular ángulos; su esqueleto no se recalcula ni se sube a la GPU | `plastilina.js`, `characters.js` |
| 3.600 huesos recorridos dos veces por fotograma buscando qué dibujar | Los huesos, fuera de esos recorridos (siguen moviendo la piel); vuelven si algo va en la mano | `characters.js` |
| El HUD rehecho cada fotograma | Solo se escribe lo que cambia | `hud.js` |
| Resolución dinámica que emborronaba sin ayudar | Solo baja la resolución si es la GPU la que no llega (el hilo principal espera); si es la CPU, se queda o vuelve a subir | `game.js` |
| Hasta 7 s de carga esperando un cuerpo que no se usa | Se espera al personaje del jugador, sea el que sea, y el de Álex va primero en la cola | `game.js`, `characters.js` |

Se probó y se descartó:

- **Subir la oclusión siguiendo la profundidad** (un filtro bilateral): deja escalones en los bordes de los coches y de
  los bordillos. La mezcla normal se ve más limpia.

## 4–6. Antes y después

Mediana de tres rondas por versión, en el bucle del juego (1440 × 900 a 2×, Plastilina, calidad alta):

| | Antes | Después | Cambio |
|---|---|---|---|
| **Conduciendo** (40 s): fotogramas por segundo | 21,3 | 50,8 | **+138 %** |
| … tiempo medio por fotograma | 47,0 ms | 19,7 ms | −58 % |
| … percentil 99 | 119,9 ms | 29,0 ms | −76 % |
| … el 1 % más lento | 8,3 fps | 34,5 fps | ×4,2 |
| … fotogramas de más de 50 ms | 171 | 0 | |
| … fotogramas de más de 100 ms | 12 | 0 | |
| … tiempo perdido en tirones (lo que pasan de 25 ms) | 19,0 s | 0,3 s | −98 % |
| **Andando** (30 s): fotogramas por segundo | 22,7 | 51,3 | **+126 %** |
| … percentil 99 | 52,1 ms | 29,7 ms | −43 % |
| … fotogramas de más de 50 ms | 14 | 0 | |
| **Girando en la plaza llena** (15 s): fotogramas por segundo | 21,8 | 44,9 | **+106 %** |
| … percentil 99 | 104,6 ms | 35,6 ms | −66 % |
| … fotogramas de más de 100 ms | 4 | 0 | |
| Construir fachadas: el paso más largo en un fotograma | 56 ms | 8 ms | |
| Carga hasta el menú (con la caché del navegador) | 9,6 s | 9,3 s | |
| Carga en una primera visita (caché vacía) | 10,4 s | 10,4 s | igual |

- **Por qué se gana tanto**: antes la GPU era el cuello de botella (el hilo principal esperaba la mitad del tiempo);
  ahora la GPU va holgada y manda la CPU, que también hace menos.
- **Las fachadas**: conduciendo 40 s, ningún fotograma con un trozo de calle a la vista sin sus detalles. Solo al
  aparecer en un sitio nuevo (empezar, un teletransporte) tardan medio segundo los que quedan a más de 40 m.
- **La carga**: en este ordenador los cuerpos de la gente se hacen antes que el pueblo y no había espera; la de 7 s
  solo se notaba en ordenadores más lentos, y ya no está.
- **El paquete** (`dist/test.html`, lo que sirve GitHub Pages): carga en 9,4 s, 44 fps en la plaza, sin errores.

### Cómo se ve

Las mismas vistas, antes y después (la plaza, una calle con coches aparcados y otra a media tarde), comparadas a
tamaño normal y en recortes a 1:1:

- A tamaño normal, iguales: la plastilina, las huellas, las sombras de contacto, el desenfoque del fondo y la luz.
- A 1:1, un pelo más suave (1,5× en vez de 2× en la pantalla Retina) y una sombra de contacto apenas más ancha al pie de
  los coches.

## Cómo medirlo otra vez

```bash
# un Chrome propio, sin ventana, con la GPU (fuera del repositorio: .cache/perf)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
  --user-data-dir=.cache/perf/chrome --no-first-run --use-angle=metal --enable-gpu --ignore-gpu-blocklist \
  --autoplay-policy=no-user-gesture-required about:blank &
python3 tools/devserver.py 8918
sh tools/perf/antes.sh da54db9            # la versión de antes, en .snaps/antes (fuera del repositorio)
python3 tools/perf/ab.py --rounds 3       # antes y después por turnos → .cache/perf/ab_*.json
python3 tools/perf/absum.py               # las medianas y el cambio
python3 tools/perf/profile.py http://localhost:8918/index.html --route drive   # adónde va el tiempo de la CPU
```

En la consola de la página (`?debug` no hace falta):

- `const P = await import('/tools/perflab.js')`;
- `await P.live({ route: 'drive' | 'walk' | 'spin', sec })`: el bucle del juego, con el bot;
- `await P.bench({ route })`: lo mismo, fotograma a fotograma a 1/60 s, con el tiempo de cada sistema;
- `P.inventory()`: lo que hay en la escena; `P.drawsBy()`: las llamadas de dibujo, por objeto;
- `await P.costs()` y `await P.variants()`: lo que cuesta cada parte del dibujo, quitándolas una a una.

## Límites y siguientes pasos

- **Medido en un Apple M5 Pro.** En un ordenador con menos GPU el cambio de antes a después es mayor (casi todo lo de
  la GPU baja); en uno con menos CPU, menor. La resolución dinámica ajusta lo demás.
- **Lo que queda en la CPU** (ahora manda ella: unos 16 ms por fotograma conduciendo) son las llamadas de dibujo, unas
  850. El siguiente paso sería juntarlas: los árboles y el mobiliario de cada trozo en una sola llamada
  (`BatchedMesh`).
- **Al entrar en una casa** sus lámparas cambian el número de luces de la escena, y three.js recompila los materiales
  que se ven dentro. Lo tapa el fundido a negro, pero sigue ahí.
- La versión fija (`fija/`) no cambia.
