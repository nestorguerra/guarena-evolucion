# Muros sólidos y una cámara que no los atraviesa

Estado: hecho en la versión Evolución (8 de octubre de 2026), sin publicar todavía. Lo pidió el usuario:

- que entre los edificios no queden huecos por los que se vea a través, «como si no estuvieran perfectamente pegados»;
- que los muros sean sólidos, que no se puedan atravesar y que tengan grosor;
- que la cámara, al girar y llegar a un muro, no lo atraviese ni deje ver lo que hay detrás;
- y todo ello en el pueblo entero.

## Qué fallaba

**Las grietas.** Las casas del juego son las parcelas del Catastro, y dos vecinas casi nunca se tocan exactamente:

- se quedan a 2–10 cm (cortes del dibujo, la rejilla de 10 cm del mapa), a veces a 10–30 cm o más;
- el juego escondía la pared de una casa si a 30 cm había otra, así que escondía las dos paredes de la grieta;
- por esa rendija se veía el cielo, o el interior vacío de las casas;
- además, la pared se escondía a tramos de medio metro: junto a cada casa más corta que su parcela quedaba una muesca abierta;
- y la Plastilina redondeaba también las esquinas compartidas, abriendo una uve entre fachada y fachada.

Medido en todo el pueblo, había 39.900 m de pared frente a una grieta de menos de 10 cm, y 2.960 m frente a una de 10 a 30 cm.

**La cámara.**

- Al chocar con un muro se acercaba, pero nunca a menos del 12 % de su distancia (unos 70 cm del personaje).
- Con el personaje pegado a una fachada y la cámara girada hacia ella, quedaba dentro de la casa.
- Su plano cercano (la «ventana» de la cámara, a 25 cm) también se metía en la pared cuando la rozaba de lado.

Probado girándola entera alrededor del personaje junto a 120 fachadas, a tres alturas: estaba dentro de una casa en 11.020 de 37.800 fotogramas.

## Qué se ha hecho

### Las casas, soldadas en hileras (`src/solidez.js`)

1. **Las esquinas cercanas se unen** (`weldParts`). Las esquinas de casas distintas que están a menos de un palmo (35 cm) se convierten en una sola.
2. **Las esquinas contra una pared se apoyan en ella.** La esquina de una casa que toca la pared de otra se pone sobre esa pared y se añade también a ella. Así dos medianeras quedan en la misma línea, y el juego esconde las dos sin nada entre ellas.
   - Las casas que pone el juego (los rellenos de huecos del Catastro) llegan hasta 50 cm.
   - Los monumentos (la iglesia, el ayuntamiento…) no se mueven: se usan tal cual.
   - Si una parcela quedara mal (vuelta del revés, cruzada o encogida), se queda como era.
3. **Todas las grietas se tapan** (`fillCracks`). A lo largo de cada pared, cada 25 cm, se mira en perpendicular: ¿hay otra pared enfrente, a menos de 1,3 m y a menos de 37° de esta? Eso es una grieta.
   - Cada tramo seguido de grieta se cierra con un trozo de muro que va exactamente de una pared a la otra.
   - Su lado lejano sigue la otra pared muestra a muestra, esquinas incluidas, y sus extremos se buscan al centímetro: donde la grieta se abre, o sobre la pared que la cierra.
   - El trozo es tan alto como la más baja de las dos casas, de tejado plano, sin puertas y con las esquinas vivas.
   - No se cierra si por ella pasa una calle o un camino, ni si toca un monumento.
   - Hay tres pasadas: la segunda y la tercera miran junto a los trozos nuevos. En el pueblo hay 586 trozos así, también de décimas de milímetro.
   - Este método sustituye al anterior (`fillSlots`, que comparaba paredes enteras y dejaba pasar casi 300 m de grietas).

En total: 79.000 esquinas pasan a ser 33.000 puntos compartidos, con 25.000 apoyos de esquina sobre pared.

### Las paredes, escondidas solo donde hay vecina (`src/buildings.js`)

- **Ocultación exacta.** Una pared se esconde exactamente donde la línea a 0,2 mm por fuera de ella entra en la casa vecina, y hasta la altura de la más alta de las que haya allí. Los límites se calculan donde esa línea cruza las paredes de la vecina, no a tramos de medio metro.
- **Esquinas compartidas.** Las esquinas compartidas, y las que tocan un trozo de muro de los que tapan grietas, no se redondean en la Plastilina, ni en la forma ni en el sombreado.
- **Tejados.** Los tejados ignoran las esquinas que ha añadido la soldadura en mitad de una pared recta. Por eso cada tejado mantiene su forma de siempre (a dos aguas, a cuatro, con alero).
- **Altura de los muros.** Los muros chocan hasta la cumbrera de su tejado. Antes solo llegaban a la altura de la fachada más 1,5 m, y la cámara podía quedar dentro de un tejado alto.
- **El parche anterior, retirado.** Se ha quitado el «tabique» que se ponía a mitad de cada grieta: la tapaba vista desde arriba, pero no desde la calle.

### Los huecos que rellena el pueblo (`src/infill.js`)

Las casas que pone el juego donde el Catastro no tiene edificio:

- llegan al centímetro hasta sus vecinas, por delante y por detrás;
- sus paredes laterales siguen las medianeras de las vecinas, medidas cada metro y medio;
- se trazan en el marco cuadrado de la parcela, así que una calle que se curva delante no las dobla;
- no se ponen si las fachadas de las dos vecinas están a más de 4,5 m una de otra, porque eso no es un hueco en una hilera;
- y nunca sobre una calle: no se ponen si su planta pisa la calzada de alguna.

En la calle Malfeitos, sus dos huecos están puestos a mano en sus datos (`gaps` en `src/malfeitos.js`), así que no dependen de esa búsqueda.

### La cámara (`src/collision.js`, `src/player.js`)

- **Una bola de 45 cm.** La cámara es una bola de 45 cm que se empuja desde la cabeza del personaje hacia donde debería estar.
  - Se para donde tocaría un muro o un tejado, sin distancia mínima (`sweepCircle`).
  - 45 cm es más de lo que mide su plano cercano, así que tampoco este entra en la pared.
- **Muros que ya rozaba.** Si la cabeza ya está junto a un muro, la cámara no se acerca a él más de lo que ya está.
- **Las esquinas del encuadre.** Se comprueba además que ninguna de las cuatro esquinas del encuadre quede tras un muro.
- **El punto que mira.** Se mantiene a 32 cm de las paredes, lo que ocupa el personaje.
- **Como antes:** se acerca de golpe al chocar, se aleja suave, y primero se aparta de lado al correr junto a una fachada.
- **El cuerpo, oculto de cerca.** Si la cámara queda tan cerca que está en la cabeza (con el personaje de espaldas a un muro), el cuerpo se oculta mientras tanto, para no ver el interior de la cabeza.

## Comprobado

| Prueba | Antes | Ahora |
|---|---|---|
| Metros de pared frente a una grieta de menos de 10 cm, en todo el pueblo | 39.905 | 0 |
| De 10 a 30 cm | 2.965 | 0 |
| De 30 cm a 1,2 m | — | 0 |
| De 1,2 a 1,3 m | — | 0,3 (la boca de un callejón) |
| Grietas con las dos paredes escondidas (por donde se vería a través) | — | 0 |
| Cámara girada entera junto a 300 fachadas, a 3 alturas, en las dos estéticas (88.830 fotogramas): dentro de una casa | 11.020 de 37.800 (120 sitios) | 0 |
| … con una esquina del encuadre dentro de una casa | 477 | 0 |
| … con un muro entre el personaje y la cámara | — | 0 |
| Partida automática: 60 s andando con la cámara girando sin parar y 90 s conduciendo (9.002 fotogramas) | — | 0 fallos de cámara, ningún peatón dentro de una casa |
| Triángulos de los edificios | 1,05 millones | 0,87 millones |

- **Las paredes miden** de 1,3 m para arriba: lo que tiene más de 1,3 m de ancho entre dos casas se queda como está, porque son callejones, pasos y patios de verdad.
- **Las esquinas interiores** (dos paredes que se encuentran a más de 37°, como en el rincón de una plaza) no son grietas.
- **La calle Malfeitos** se ve igual que en la versión 21, comparada en sus fotos de referencia: cada casa, hueco y color en su sitio (sus 29 fachadas medidas).
- **Construir el pueblo**: soldar lleva 0,28 s y tapar las grietas 0,29 s (en el equipo de desarrollo).
- **Consola**: sin errores, al cargar ni al jugar.

## Cómo comprobarlo

- `tools/solidezlab.js`:
  - `camAudit({ n })` gira la cámara junto a `n` fachadas y cuenta lo que no debe pasar;
  - `watch({ spin })` vigila la cámara durante una partida de `tools/playtest.js`;
  - `camShot(...)` fotografía la cámara del juego tal como queda;
  - `shotAt`/`shots` hacen fotos desde un punto de la calle;
  - `plan(x, z, { det })` dibuja las casas desde arriba, con los trozos de muro en rojo y las grietas que mide `auditGaps`.
- `src/solidez.js`: `auditGaps(map)` mide en todo el pueblo, cada 25 cm de pared, a qué distancia está la casa de enfrente.

## Límites

- Con el personaje de espaldas a un muro y la cámara girada hacia él, la cámara se mete en su cabeza y mira desde sus ojos. No hay sitio detrás de él.
- Los monumentos conservan su propia forma. Una casa pegada a la iglesia se suelda a la parcela de la iglesia en el Catastro, que no es exactamente su modelo.
