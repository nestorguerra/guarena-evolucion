# Guareña de plastilina — plan de la estética stop motion / claymation

Estado: plan aprobado para ejecutar en la versión Evolución (5 de octubre de 2026). Se añade como estética
**Plastilina** en *Ajustes › Estética*, junto a Manga, Acuarela, Realista y Diorama.

## 1. Qué hemos aprendido de otras películas y juegos

| Referencia | Qué hacen | Qué nos llevamos |
|---|---|---|
| Aardman (*Wallace y Gromit*, *Chicken Run*, *La oveja Shaun*) | Plastilina Newplast sobre esqueletos de alambre; dejan a propósito las huellas y marcas de los dedos («esas marcas ayudan a hacer el personaje»); bocas de recambio o moldeadas en la cara; decorados hechos a mano. | Huellas visibles pero limpias; formas redondeadas y gorditas; colores puros; cada cosa parece hecha a mano, sin aristas perfectas. |
| *La LEGO Película* (Animal Logic, toda en ordenador) | Animación «a doses y a treses» (cada pose dura 2–3 fotogramas), **sin desenfoque de movimiento**, huellas y arañazos en las piezas, los muñecos solo se mueven como podría moverlos una mano, efectos (explosiones) hechos con las mismas piezas. | Pose sostenida 1/12 s; nada de motion blur; imperfecciones en el material; efectos hechos «con el mismo material» (algodón, celofán, plastilina). |
| *Kirby and the Rainbow Curse* (Nintendo, juego) | Mundo de plastilina en tiempo real: huellas, bordes biselados donde se juntan colores; **los personajes van a menos fotogramas que el fondo** y el juego sigue a 60 fps. | Personajes y objetos a 12 fps con la cámara fluida; biseles suaves en las uniones. |
| *Spider-Verse* | Personajes «a doses» (12 fps) y cámara «a unos» (24 fps). | Igual: la cámara del juego nunca a saltos, para que se juegue bien. |
| *The Neverhood*, *Armikrog* | Juegos con todo (decorados y personajes) de plastilina fotografiada. | Los decorados también son plastilina, no solo los muñecos. |
| *Harold Halibut*, *Out of Words* | Objetos hechos a mano y escaneados; conservan la textura de la mano. | Cada superficie con «mano»: bultos, presiones, cortes de espátula. |
| Tutoriales de CG «clay» (Blender, Cinema 4D, Redshift) | Variación de color, ruido propio, huellas, arañazos; el «hervor» (*boiling*): cambiar las huellas y el ruido en cada fotograma. | Material de plastilina con 5 capas y hervor en cada paso de 1/12 s. |
| Efectos prácticos del stop motion | Humo y nubes de algodón; agua y fuego de celofán o gelatina; luz de estudio. | Nubes de algodón, agua de resina, humo de algodón, fuego de celofán. |

## 2. Dirección de arte para Guareña

1. **Todo es plastilina** (casas, suelo, árboles, coches, gente): ni una fotografía. Las texturas pintadas se
   repintan en manchas de color planas, como trozos de plastilina.
2. **Formas blandas**: esquinas y bordes redondeados en casas, puertas, ventanas, rejas, macetas y muebles; las rejas son
   churros de plastilina negra; los árboles, bolas modeladas.
3. **La mano se nota**: bultos suaves de modelar, huellas de dedo con sus surcos, cortes de espátula, alguna mota de
   pelusa; limpio, nunca sucio.
4. **Material de plastilina**: mate con un brillo céreo suave, la luz que «entra» un poco en el borde de la sombra
   (cálida), nada metálico.
5. **Color de plastilina**: la paleta del pueblo (cal, ocre, teja, verde de puertas) pero más pura y saturada; cada
   pieza de un color, algo jaspeada.
6. **Personajes muñeco**: piel lisa de plastilina, ojos de cuenta brillante, pelo modelado con surcos de peine, ropa de
   plastilina con huellas; algo más de cabeza y manos, como los muñecos.
7. **Stop motion**: personajes, coches, animales y agua a 12 poses por segundo, con hervor en cada pose; la cámara,
   fluida; sin desenfoque de movimiento.
8. **Luz de estudio**: luz principal cálida y suave, relleno frío, sombras de borde corto y suave, sombra de contacto.
9. **Efectos de material**: nubes y humo de algodón, agua de resina/celofán, fuego de celofán.
10. **Se juega igual**: misma cámara, mismos controles y misma lectura de calles y cruces. Sin desenfoque fuerte: lo que no
    gustó de la «Miniatura».

## 3. Plan por capas

| Capa | Qué | Dónde |
|---|---|---|
| 0 | Estética *Plastilina* (botón, guardado, `?estilo=plastilina`); configuración central y registro del stop motion | `style.js`, `main.js`, `index.html`, `src/plastilina.js` |
| 1 | Material de plastilina en todo lo iluminado: bultos, huellas con surcos, cortes de espátula, pelusa, jaspeado, brillo céreo, luz que envuelve la sombra; hervor por pose | `src/plastilina.js` (trozos de shader de three.js) |
| 2 | Texturas repintadas como plastilina (fachadas, tejados, suelo, interiores); sin escaneos fotográficos | `world.js`, `assets.js`, `toon.js` |
| 3 | Casas: esquinas y aleros redondeados, huecos de ventana blandos, tejas de churro; detalles 3D con caras blandas (normales de cojín), rejas de churro | `buildings.js`, `materials.js`, `facades.js` |
| 4 | Suelo: asfalto de plastilina alisada con espátula, baldosas presionadas, bordillos redondos, marcas viales de tira | `materials.js`, `textures.js` |
| 5 | Vegetación: copas de bolas modeladas, palmeras y flores de plastilina, verdes de plastilina | `trees.js` |
| 6 | Personajes muñeco: piel, ojos de cuenta, pelo modelado, ropa, proporciones | `characters.js`, `hero.js` |
| 7 | Vehículos de plastilina: carrocería blanda, ruedas gorditas, cristal de celofán | `vehicles.js` |
| 8 | Cielo de decorado con nubes de algodón; luz de estudio | `sky.js` |
| 9 | Agua de resina, humo de algodón, fuego de celofán | `pantano.js`, `pools.js`, `townplus.js`, `effects.js` |
| 10 | Stop motion: poses a 12 fps (personajes, coches, animales), hervor, cámara fluida; opción «todo a 12 fps» o «no» | `src/plastilina.js`, `game.js` |
| 11 | Interiores: muebles y paredes de plastilina | `housekit.js`, `assets.js` |
| 12 | Evaluación y pulido | `tools/lookcompare.js` |

## 4. Cómo se evalúa

- Las mismas vistas fijas de siempre (hacia Santa María, calle estrecha, cruce) y además la plaza, la iglesia, un
  coche, un primer plano de personaje, un interior y la noche; comparadas con las demás estéticas.
- Un vídeo del paseo a 12 fps con gente y coches.
- Lista de control: ¿se lee como plastilina en una foto fija? ¿se ven las manos (huellas, bultos) sin ensuciar? ¿formas
  blandas? ¿los personajes parecen muñecos? ¿el movimiento parece stop motion? ¿queda alguna fotografía? ¿la luz es
  coherente? ¿se juega igual?
- Rendimiento en este Mac a 1280×720 (objetivo: no más lento que la Diorama de forma notable).

## 5. Lo hecho, capa a capa

| Capa | Hecho |
|---|---|
| 0 | Estética **Plastilina** (botón, guardado, `?estilo=plastilina`); `src/plastilina.js` con la configuración, el material, el objetivo y el stop motion. |
| 1 | Material de plastilina en todos los materiales estándar (trozos de shader de three.js): bultos en dos escalas, alisados de pulgar con su rebaba, huellas en bucle (no dianas) con surcos que solo aparecen donde se ven, cortes de espátula, pelusa, color amasado, brillo céreo (rugosidad 0,5), nada metálico, luz que envuelve la sombra con el borde cálido. Los decorados con más relieve (`CLAY_RELIEF`); los muñecos «hierven» en cada pose. Coste: los detalles se saltan a lo lejos y lo descartado (hojas) no se calcula. |
| 2 | Fachadas, tejados, suelo e interiores repintados en manchas de color de plastilina; sin escaneos fotográficos. |
| 3 | Casas con las **esquinas redondeadas de verdad** (arcos en el contorno, sombreado suave) y, en el shader, el canto superior, el canto del zócalo y el borde de puertas y ventanas blandos. Detalles 3D, muebles y mobiliario como losas blandas (normales de cojín según tamaño); rejas de churro redondo y más gordas. |
| 4 | Suelo: asfalto y baldosas repintados, el mismo material de plastilina con relieve de decorado. |
| 5 | Árboles, setos, cipreses y vides de bolas modeladas; verdes de plastilina más vivos. |
| 6 | Muñecos: piel lisa de plastilina más cálida, labios y mejillas presionados, ojos de cuenta (blanco y pupila negra con un brillo), cejas de churro, sin pestañas, pelo modelado con surcos, huellas a su escala; cabeza ×1,1, ojos ×1,42, manos ×1,16 (también el protagonista). |
| 7 | Coches: carrocería más gordita y redonda, pintura mate de plastilina, ventanas pintadas de azul claro con brillo. |
| 8 | Cielo de decorado con nubes de algodón; luz de estudio cálida (sol más suave, relleno cálido, rebote), sombras de borde muy suave, exposición que deja ver el blanco de la plastilina. |
| 9 | Humo de algodón; agua de la fuente pose a pose. |
| 10 | Stop motion: personajes, perros y coches mantienen cada pose 1/12 s (comprobado: en el juego a 60 fps la pose cambia uno de cada cinco fotogramas); viento, agua, nubes y humo también a 12 fps; la cámara, tu personaje y tu coche, fluidos; sin desenfoque de movimiento. |
| 11 | Interiores repintados como plastilina, muebles blandos. |
| 12 | Objetivo suave: solo el fondo lejano se ablanda (nada de franja ni primer plano borroso). |

## 6. Evaluación

- **Foto fija**: plaza, iglesia, vista aérea y coches se leen como maqueta de plastilina; las calles estrechas, como una
  maqueta limpia (las huellas y bultos se ven de cerca y con luz rasante).
- **Formas**: esquinas, bordes, rejas, árboles y coches, blandos. Los tejados y las aristas pequeñas de algunos edificios
  singulares siguen siendo rectos.
- **Personajes**: ya son muñecos (ojos de cuenta, cabeza y manos grandes, plastilina), pero la cara conserva la forma
  realista de MakeHuman: no es todavía un muñeco de Aardman (boca ancha, nariz de bola).
- **Movimiento**: stop motion verificado; se juega igual.
- **Fotografías**: ninguna en casas, suelo ni interiores.
- **Rendimiento** (este Mac, 1280×720, alta, con otra pestaña del juego abierta): Plastilina ≈ Diorama +5 %.

Segunda pasada: boca de muñeco más ancha con una sonrisa leve; tejas árabes como churros de plastilina (cobijas y
canales con su relieve y el labio de cada fila); fuego de celofán (lenguas recortadas, no luz); y el parpadeo de los
focos de estudio de una pose a otra (±0,7 %), como en el stop motion de verdad.

## 7. Tercera pasada: cabezas esculpidas, piedras de plastilina, la mano en el color

Lo que la evaluación señaló como más flojo eran las caras: seguían siendo caras realistas de MakeHuman con ojos de
cuenta. Ahora cada cabeza se esculpe como la de un muñeco, a partir de la de la propia persona (cada uno sigue
siendo él mismo):

| Qué | Cómo (`charbuild.js`) |
|---|---|
| Caricatura de muñeco | Los rasgos propios de MakeHuman empujados (`MH_PUPPET`): cabeza más redonda, mejillas llenas, nariz grande y redonda, boca mucho más ancha con las comisuras hacia arriba y los labios como un churro, ojos más abiertos y sin bolsas, orejas más grandes y redondas. Se desvanece hacia el cuello, así la costura con el cuerpo no se mueve. |
| Modelado a mano | `puppetShape`: la nariz se infla como una bola (a lo largo de la piel, desde su centro) y se alisa hasta que desaparecen las aletas y el pliegue de al lado; luego toda la cara se alisa como alisa un pulgar la plastilina (sin pliegues, bolsas ni huesos marcados), sin tocar los párpados, la boca por dentro ni el cuello. Alisado de Taubin, que no encoge la cabeza. |
| Expresión | Cejas de muñeco abiertas y amables (un poco más altas, con el extremo interior levantado); la sonrisa en reposo. |
| Piel | Sin pelusa ni cortes de espátula en las caras y manos (de cerca parecían heridas); las huellas y el hervor siguen. |

También para el protagonista (su cabeza sale del mismo constructor). El constructor pasa a la versión 31, así las
cabezas guardadas en el navegador se vuelven a hacer.

Al revisar las caras de muy cerca salieron dos defectos, ya corregidos:

- **Dientes que asomaban** por las comisuras al ensanchar la boca: ahora quedan 6 mm más adentro.
- **Pliegues de la malla** (un triángulo dado la vuelta, que no se dibuja y deja ver la calle a través): algunos venían
  ya de antes, de caras con rasgos muy marcados (la de Álex, en la comisura). Ahora, en todas las estéticas, cada cabeza
  se compara con la cara base de MakeHuman y los pliegues se relajan hasta quedar planos (sin tocar el interior de la
  boca ni las cuencas de los ojos). Herramientas: `tools/puppetlab.js` (`sheet`, `flips`, `holes`, que pone la cabeza
  sola delante de un fondo magenta).

**Fondo menos desenfocado** (petición del usuario: «solo algo desenfocado, pero no tanto»): el objetivo ablanda el
fondo como mucho 0,24 % de la altura de la imagen (antes 0,55 %) y empieza más lejos, a 2,4 veces la distancia del
personaje (antes 1,8), llegando al máximo a 11 veces (antes 7). En `PLASTILINA.lens`.

Los decorados:

- **Iglesia, ayuntamiento y demás edificios singulares**: la mampostería y la sillería se pintan como piedras de
  plastilina metidas en una masa más blanda: bordes redondeados, cada una de su color, más clara arriba donde la
  redondeó el pulgar, con su surco blando alrededor (sin el granulado fotográfico). Sus materiales tienen el relieve y
  las marcas de los decorados.
- **Casas y suelo**: las marcas de la mano también en el color (CLAY_TONE 2,8 en las casas, 2,0 en el suelo), para
  que se vean a la sombra y en la cal blanca, donde el relieve solo apenas se nota. Limpio, sin parecer sucio.

Evaluación de esta pasada (mismas vistas, mismo equipo):

- **Personajes**: ya se leen como muñecos de plastimación (nariz de bola, boca ancha y sonriente, ojos de cuenta,
  cabeza y manos grandes); cada uno conserva su cara. Comisuras sin grietas de cerca.
- **Iglesia**: de piedra fotografiada a maqueta de piedras de plastilina.
- **Calles**: de cerca la cal muestra huellas y amasado suaves; de lejos, igual que antes (una maqueta limpia).
- **Rendimiento**: 11–13 ms por fotograma a 1280×720 (igual que antes; el esculpido solo cuesta al construir cada
  cabeza, en los workers).

**Pendiente**: bocas de recambio (fonemas al hablar), las líneas rectas de los tejados y las aristas algo onduladas,
como en un decorado hecho a mano.
