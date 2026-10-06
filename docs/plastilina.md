# Guareña de plastilina — plan de la estética stop motion / claymation

Estado: hecho en la versión Evolución (5 de octubre de 2026). Desde el 6 de octubre la **Plastilina** es la estética con
la que arranca el juego; en *Ajustes › Estética* solo queda la otra, **Realista** (ver la sección 12). Las secciones de
abajo cuentan cada pasada tal como se hizo, con las estéticas que había entonces.

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

- **Dientes que asomaban** por las comisuras al ensanchar la boca (una manchita gris en la comisura): ahora quedan
  6 mm más adentro.
- **Pliegues de la malla** (triángulos dados la vuelta respecto a la cara base de MakeHuman): la herramienta los
  encontró en todas las estéticas, más en caras de rasgos marcados como la de Álex. Ahora cada cabeza se compara con la
  cara base y los pliegues se relajan hasta quedar planos (sin tocar el interior de la boca ni las cuencas de los
  ojos). Herramientas: `tools/puppetlab.js` (`sheet`; `flips`, los triángulos que no casan con sus normales; `holes`,
  la cabeza sola delante de un fondo magenta: un agujero se ve magenta, algo que asoma, no).

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

## 8. Cuarta pasada: que parezca una película de plastilina

Petición del usuario: «mejora la resolución de los elementos, para que se simule todavía mucho más que es una película
de stop motion… que mejore en resolución, en estética, en stop motion y en estética de plastilina».

Qué distingue una película de plastilina de un juego con aspecto de plastilina:

| Rasgo de las películas | Cómo se ve | Qué hacemos |
|---|---|---|
| **Imagen nítida** | Se fotografía cada pose con una cámara de cine: todo se ve definido, sin dientes de sierra. | Plastilina en calidad alta a la resolución completa de la pantalla (como el Manga), con la resolución dinámica que la baja un poco si el equipo no llega. Suelo pintado al doble de resolución. Muñecos modelados más finos y esquinas de las casas con más segmentos. |
| **El hervor** (*boiling*) | Entre una foto y otra el animador ha tocado el muñeco: su superficie y su contorno nunca quedan igual, tiemblan un poco a cada pose. | El contorno de los muñecos se mueve 1–2 mm a cada pose (en el shader, a lo largo de la piel), además de las huellas que ya se movían. |
| **La mano del animador** | Un muñeco recolocado nunca queda exactamente donde estaba. | En cada pose, cada muñeco se desplaza unos milímetros y una fracción de grado (tu personaje, menos). |
| **Muñecos a doses, cámara a unos** | En los largometrajes los muñecos posan 12 veces por segundo y la cámara, montada en un brazo de control de movimiento, va a las 24 imágenes de la película. | Modo **Película** (Ajustes › Stop motion): tú también posas 12 veces por segundo, la cámara va a 24, grano de película nuevo en cada imagen y bandas negras de cine (2,39:1, nunca más del 11 % de la altura). El modo normal se queda como estaba, para jugar fluido. *(Retirado el 6 de octubre: el stop motion ya no se elige.)* |
| **Pelo esculpido** | El pelo de un muñeco es una pieza de plastilina trabajada con un palillo: surcos, no hebras. | El pelo de los muñecos con surcos marcados y el brillo céreo de la plastilina, sin el brillo del pelo de verdad. (Se probó el pelo esculpido en volumen del juego antiguo: no encaja bien en las cabezas de ahora.) |
| **Contraluz de estudio** | Una luz detrás y arriba separa al muñeco del decorado con un filo de luz cálida. | Un filo cálido en el borde de los muñecos, de arriba, sea cual sea el sol. |

Evaluación (este Mac):

- **Nitidez**: las huellas, los ojos de cuenta y los surcos del pelo se ven definidos.
- **Rendimiento**:

  | Ventana | Escala | Tiempo por imagen |
  |---|---|---|
  | 1280×720 | 1 | 12,6 ms |
  | 1440×900 | 1,5 | 21,9 ms |
  | 1440×900 | 2 | 32,5 ms |

  A escala 2 la resolución dinámica se asienta hacia 1,6–1,7 en este equipo (antes no pasaba de 1,5); en uno más
  potente se queda en 2.
- **Hervor**: entre dos poses el contorno y las huellas cambian 1–2 mm (se ve en la diferencia entre dos imágenes);
  quieto apenas se nota, en movimiento da el temblor de la plastilina.
- **Película**: los muñecos y la cámara a cadencia de cine, el grano fino y las bandas; las bandas no tapan el HUD.

Herramientas: `tools/lookcompare.js` `faceVideo` (un muñeco de cerca, 12 poses por segundo: hervor, mano, parpadeos);
`walkVideo` aplica ya la mano del animador.

## 9. Quinta pasada: las tres imágenes de referencia del usuario

El usuario mandó tres imágenes (una calle estrecha de casas encaladas, una calle ancha con coches aparcados y la
plaza de la iglesia con una palmera) y pidió «representar exactamente esta estética». `tools/refcompare.js` saca
tres vistas del juego del mismo tamaño y encuadre parecido, y cada cambio se midió contra ellas (color medio y
contraste de pared, carretera, árboles y adoquines, sacados con PIL de las referencias).

| En la referencia | Antes | Ahora |
|---|---|---|
| Cámara de maqueta: algo alta, objetivo largo | cámara de juego | más lejos (×1,35), 12° más alta, 50° de campo; en coche, más lejos y cerrada |
| Paredes crema, modeladas a mano, con pegotes y alisados | blancas y casi lisas | superficie de plastilina modelada una vez al arrancar (1024², cuatro canales), en triplanar: pegotes, alisados con su rebaba, poros y grietas finas; huecos más oscuros; crema cálido; esquinas y bordes más «hinchados» |
| Luz de estudio cálida y suave que modela | sol fuerte, blancos quemados | foco a 40° como máximo, más suave y cálido; grado más rico |
| Cielo cian pintado sobre yeso, nubes de algodón | nubes pintadas | fondo con el yeso y las pinceladas, y nubes de algodón en 3D delante, pequeñas y compactas |
| Carretera de arcilla gris cálida, grietas hondas | asfalto gris con baches blancos | arcilla alisada a mano en manchas, grietas de herramienta, sin polvo en la cuneta |
| Aceras de losas color arena | baldosas pequeñas | losas de 45 cm, irregulares, cada una de su tono |
| Bordillos de bloques | tira lisa | bloques de 50 cm redondeados con su junta |
| Plazas de adoquines redondos | baldosa | adoquines de arcilla con juntas oscuras, en plazas y explanadas |
| Árboles de bolitas | grumos grandes | «brócolis» de bolitas de plastilina verde oliva, cada una sombreada como una bola |
| Rejas negras gordas, macetas en cada ventana y puerta | algunas | rejas en casi todas las ventanas bajas, más gordas; muchas más macetas; bajantes grises |
| Tejas que vuelan sobre el alero | borde recto | fila de canales festoneada que vuela 4 cm |

Rendimiento (este Mac, 1280×720, sin otra pestaña del juego abierta): 12–14 ms por imagen, igual que antes. Una
prueba con bolitas más pequeñas y numerosas subió a 27 ms: se quedaron en 24–70 según el árbol, de 180 triángulos.

Después, con la cámara y el color medidos contra las referencias (`refcompare` con la inclinación por defecto del
juego): cámara a la altura de la calle (~2,5 m, 5,7 m detrás, mirando ~7° abajo); sombras cálidas (el relleno y el
reflejo del entorno sin el azul del fondo); carretera de grano gris visible y sin motas claras; paredes sin manchas;
coches de plastilina limpios; tinte rosado del grado y exposición 0,9; nubes redondas y bajas. Y **bordillos de
verdad**: un rulo de plastilina de 7 cm de alto y 42 cm de ancho, redondeado, en bloques de medio metro (más bajo
frente a cocheras y pasos; los pies que lo cruzan se hunden lo que no se nota).

Colores medidos (zona central de cada imagen, media de la imagen / saturación / luminancia / contraste):

| Vista | Referencia | Juego |
|---|---|---|
| Calle estrecha | (162,137,119) / 72 / 143 / 49 | (168,150,126) / 80 / 153 / 54 |
| Calle ancha | (161,144,129) / 68 / 148 / 41 | (166,146,123) / 83 / 150 / 50 |
| Iglesia | (159,147,129) / 85 / 149 / 38 | (160,144,118) / 91 / 146 / 36 |

(Medido antes de bajar la saturación a 1,1.)

Diferencias que quedan, porque son del pueblo y no de la estética: Guareña tiene sus casas de dos y tres plantas y
su iglesia real (no la de la imagen), y el protagonista de la Evolución es Álex.

## 10. Sexta pasada: medir cada superficie contra las referencias

Medido el 5 de octubre de 2026, con `tools/refcompare.js` y parches de cada superficie (la calzada, una pared al sol,
la acera, los adoquines). Las imágenes del juego se toman con todo cargado: la primera captura tras empezar salía con
la calzada mucho más oscura, (73,55,45) frente a (111,91,78), y las pasadas anteriores la midieron así. La vista de la
iglesia se toma ahora desde el sitio de la tercera imagen: al este de la plaza, con la torre redonda y el campanario a
la izquierda y la palmera a la derecha.

| Superficie | Referencia | Antes | Ahora |
|---|---|---|---|
| Calzada (calle estrecha) | (126,108,104), sat. 0,17 | (111,92,79), sat. 0,29, parda | (125,106,104), sat. 0,17 |
| Calzada (calle ancha) | (138,123,117) | (121,100,86) | (136,117,113) |
| Pared al sol | (215,191,163), tono 32° | (239,225,199), casi blanca, 39° | (222,194,162), 32° |
| Acera | (216,191,163) | (210,187,144), amarilla | (212,189,156) |
| Adoquines | (139,123,117), gris con juntas oscuras | (151,129,108), pardos con juntas claras | (141,122,114) |

| Vista | Referencia: luminancia / contraste / saturación | Juego |
|---|---|---|
| Calle estrecha | 145,9 / 51,5 / 0,283 | 153,1 / 47,3 / 0,300 |
| Calle ancha | 146,1 / 45,2 / 0,285 | 149,1 / 45,5 / 0,290 |
| Iglesia | 153,8 / 37,8 / 0,323 | 157,7 / 36,2 / 0,290 |

Qué se cambió:
- **Calzada y adoquines:**
  - Gris rosado, como la arcilla de las imágenes (`materials.js`). Bajo la luz cálida del estudio, el gris neutro
    salía pardo.
  - Menos poros (la textura `g` de `clayDetailData` y `CLAY_CAV` 0,25).
  - Los adoquines de las plazas, grises con juntas oscuras.
- **Paredes:**
  - El encalado de color crema (el tinte depende de lo claro que sea el color: las bandas de color y las puertas se
    quedan como estaban).
  - Su modelado, sin «papel arrugado». Lo provocaban cientos de restregones estrechos de dedo, con su surco y su
    reborde, que se cruzaban. Ahora son 45 anchos y suaves, y hay bultos grandes de un palmo a un brazo
    (`clayDetailData` canal `r`).
  - Las marcas, más tranquilas: `CLAY_RELIEF` 1,6 y `CLAY_TONE` 1,8.
- **Aceras:** losas de arena menos amarillas.
- **Albero de plazas y jardines:** losas grandes de arenisca de plastilina con su junta, como la plaza de la iglesia.
- **Árboles:** cada bola redonda (aplastadas, en las copas anchas, parecían almohadas) y de un verde fresco, en vez de
  oliva.
- **Palmera:** menos frondas, más anchas, de hojuelas gordas de plastilina.
- **Iglesia:**
  - Piedras de colores variados (ocre, crema, naranja, pardo, gris) con la junta clara.
  - El cono de tejas del ábside, más alto y con sus tejas a tamaño: tapa el piñón de piedra de la nave, que asomaba
    como un cono de piedra.
- **Macetas:** también bajo las ventanas de la planta baja, con geranios, cipresitos recortados en tiesto de barro y
  aspidistras, en casi la mitad de ellas (`buildings.js` registra las ventanas bajas solo en la Plastilina).

Rendimiento: igual que antes (14–19 ms por imagen a 1280×720 en este Mac, con y sin la pasada, medido igual).

## 11. Séptima pasada: lo que aún distinguía las imágenes

Faltaba lo que hay en las imágenes y no en las superficies:
- **Calles empedradas en torno a Santa María:** a 85 m de la iglesia, solo en la Plastilina, con adoquines de un palmo
  y medio y juntas suaves, como la plaza de la tercera imagen.
- **Líneas de las calles anchas:** desde 6,8 m de anchura, un rulo continuo de plastilina blanca, de 26 cm, a 1,95 m
  de cada bordillo (el carril de aparcar), como en la segunda imagen. La discontinua central es más gruesa.
- **Faroles de pared:** el doble de cerca (el espaciado ×0,65).
- **Macetas:**
  - En la puerta de casi todas las casas (86 %).
  - Bajo el 60 % de las ventanas de la planta baja: geranios, cipresitos recortados y aspidistras.
- **Árboles:** copas de cogollos de un palmo (hasta 36 cm, hasta 84 por árbol), como los brócolis de las imágenes.

| Vista | Referencia: luminancia / contraste / saturación | Juego |
|---|---|---|
| Calle estrecha | 145,9 / 51,5 / 0,283 | 152,2 / 48,3 / 0,300 |
| Calle ancha | 146,1 / 45,2 / 0,285 | 150,8 / 46,5 / 0,289 |
| Iglesia | 153,8 / 37,8 / 0,323 | 148,6 / 42,5 / 0,297 |

Rendimiento igual: 14–18 ms por imagen a 1280×720, medido con el juego recién cargado (medido tras varias capturas
seguidas sale más alto, con o sin estos cambios).

Lo que queda distinto no es de la estética sino del pueblo y del juego:
- Las casas de Guareña tienen la altura que les da el Catastro.
- Los coches aparcados y la gente están donde los pone el juego.
- El protagonista de la Evolución es Álex.

## 12. Orden del código: dos estéticas y el stop motion siempre (6 de octubre de 2026)

Petición del usuario: «la aplicación arranque solo en dos formatos… realista y plastilina. Nada más. El resto de las
estéticas las eliminas… stop motion siempre que sea plastilina… No se puede elegir. El resto déjalo todo igual… elimina
toda la parte del código que no se esté utilizando».

- **Dos estéticas**: Plastilina (la de arranque) y Realista. Se quitaron Manga (el anime, con su pase de tinta
  `toon.js`, la entrada con el dron `intro.js` e `assets/intro.jpg`, la música lo-fi `lofi.js`, su cielo, sus ojos, sus
  árboles y su CSS), Acuarela y Diorama. Una partida guardada o un `?estilo=` con otra estética abre la Plastilina.
- **Stop motion siempre** en la Plastilina, sin ajuste: personas, perros y coches a 12 poses por segundo y tú fluido
  (`player.js` `setCharacter` saca al protagonista del stop motion). El modo Película (grano, cámara a 24 imágenes,
  bandas) se quitó.
- **La Diorama, dentro de la Plastilina**: lo que la Plastilina usaba de ella vive ahora en `plastilina.js` (la
  oclusión de contacto `STUDIO_AO` y la gradación final `ClayGrade`); las ramas `STYLE.diorama` del cielo, las
  fachadas, el suelo y los árboles pasaron a ser de la Plastilina, y lo que solo servía a la Diorama se quitó. El
  repintado de texturas como plastilina es `clayRepaint` (el de `toon.js` sin el resto del anime: mismo resultado).
- **Código muerto fuera**: importaciones sin usar en 22 archivos; funciones, constantes y métodos que nadie llamaba
  (entre ellos los generadores de señales antiguos de `landmarks.js`, ya hechos por `signs.js`, y el atlas de 33
  señales del que solo se usaba la placa del Ayuntamiento); herramientas de desarrollo de lo quitado.
- **Comprobado**:
  - Las tres vistas de `refcompare` en la Plastilina dan lo mismo que la séptima pasada (luminancia / contraste /
    saturación: 151,6/48,4/0,302 · 151,4/46,4/0,288 · 148,4/42,4/0,297).
  - La Realista, comparada con la versión anterior en las mismas vistas, da las mismas cifras (cambian la gente, los
    coches y la pose).
  - `runlab` recto, como en `docs/carrera.md`: pie apoyado 0,56 m/s, puntas que patinan 0 %, 60 poses por segundo.
  - Rendimiento igual: las medidas de este equipo varían más entre dos cargas que entre las dos versiones.
