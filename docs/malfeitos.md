# La calle Malfeitos, casa por casa

Estado: hecho en la versión Evolución y publicado (7 de octubre de 2026). Lo pidió el usuario: modelar la calle
«exactamente como son las casas, los colores, la altura…», con 21 fotos de Street View de la calle, de ida y de vuelta.

## Las fotos, solo como referencia

- **Qué son**: 21 capturas de Google Street View guardadas en el escritorio (mayo de 2024; las dos del cruce con Don
  Juan Durán son de octubre de 2021).
- **Cómo se usan**: solo para mirar y medir. En el juego no hay ni un píxel, ni una textura, ni un recorte de ellas:
  cada fachada está hecha a mano con geometría y colores, a partir de números.
- **Las condiciones de Google Maps** prohíben copiar su contenido o crear productos con él; mirarlo como referencia para
  modelar a mano no lo copia.

## Cómo se midió

1. **La cámara de cada foto**:
   - La barra de direcciones de cada captura da el sitio (latitud, longitud), el rumbo, la inclinación y el campo de
     visión vertical (por ejemplo `@38.8615187,-6.1012437,…,75y,182.07h,95.24t`).
   - Con ellos, cada foto es una cámara en las coordenadas del juego, a 2,5 m de altura (`tools/fachadas/cam.py`).
   - El rumbo se corrige con el punto de fuga de las líneas de la calle en cada foto (`vp.py`): entre −1,2° y +1,2°.
2. **Las fachadas «desdobladas»** (`rect.py`, `hs.py`):
   - Cada pared de la calle (la del Catastro que da a la acera) se proyecta en cada foto que la ve.
   - La imagen se transforma a la vista de frente, en metros: una rejilla de 0,5 m con marcas de 0,1 m.
   - Se usa la foto que la ve más de cerca.
   - En ellas se leen las posiciones de puertas, ventanas, balcones, bandas, cornisas…
3. **Los desajustes del GPS** (medio metro, sobre todo hacia los lados):
   - Se compensan con las medianeras del Catastro, que deben caer donde cambian las fachadas (`fitpx.py`, `px.py`).
   - También con la paralaje de lo que sobresale (rejas, balcones), que se lee en su propio plano.
4. **Los colores**: se miden en la foto, en la parte al sol (`sample.py`).
5. **La comprobación**:
   - `tools/malfeitoslab.js` pone la cámara del juego en el sitio de cada foto (con su rumbo corregido) y la fotografía.
   - `sheet21.py` pone foto y juego lado a lado.
   - La hora es la de las fotos: una tarde de mayo, con el sol en las fachadas de la acera este.

**Precisión**: unos 10-20 cm en las casas vistas de cerca y de frente, y hasta 30-40 cm en las que solo se ven de lejos
y en escorzo (el bloque moderno del sur, el centro de la casa amarilla de la esquina sur).

## Lo que hay en la calle

| Acera este (pares), desde la calle Nueva | Acera oeste (impares), desde la calle Nueva |
|---|---|
| **Nº 20**: crema con recercados ocres, dos balcones de balaustres de fundición, áticos | **Esquina**: ocre, ala baja con baranda, cuerpo de dos plantas con terraza de pilares blancos y pérgola |
| **Nº 18**: blanco, bajo de granito gris, dos locales con cancela de tijera, toldo verde | **Nº 9**: amarillo pálido, puerta de arco en granito, tres balcones de fundición |
| **Nº 16**: ladrillo volado sobre la acera, bajo de granito rosa, cochera con cancela | **Nº 7**: blanco con recercados ocres, ventanas de arco, balcón largo, farol |
| **Casa de piedra**: bajo de piedra, terraza con baranda de lamas blancas | **Edificio de ladrillo** (1977): ladrillo pardo, cantos crema, farol, ala con terraza de tubos |
| **Nº 14 y 14ᴬ**: gemelas, puertas talladas en granito, balcones con cañizo | **Casa del garaje rojo** (donde el Catastro deja un hueco): rojo, cochera, terraza con balaustrada y pérgola |
| **Casa salmón**: pilastras blancas, tres balcones, puertas en granito | **Casa de la fisioterapia**: ocre sobre bajo rojo, su letrero, farol |
| **Casa blanca del tejado**: ventana alta con reja, tres balcones | (cruce con Don Juan Durán) |
| **Correos**: tres plantas, letrero amarillo, escaparates, doce balcones, toldos verdes | **Casa de las ventanas de arco**: crema, zócalo amarillo, farol |
| **Casa ocre de los recercados**: cuatro balcones, ventanas con reja | **Tapia alta**: crema con zócalo ocre, puerta de arco |
| **Casa del garaje en arco** y una casa baja blanca | **Casa del portón**: zócalo ocre alto, portón de lamas, ventanas de arco |
| **Bloque moderno**: blanco con bandas grises, ventanas con reja, balcones | **Casa amarilla de la esquina**: zócalo de granito, pilastras blancas, balcones de fundición, farol |

- **Cada casa lleva**:
  - el color de su pintura, su zócalo y sus recercados (en sus metros);
  - sus huecos de verdad, con su fondo y sus jambas;
  - persianas, rejas (con collarines, roleos o buche), balcones con su losa moldurada y su baranda (de barrotes, de
    fundición, de lamas, de cañizo, de chapa o de tubos);
  - puertas (de clavos, de cuarterones, de aluminio, de chapa, de cristal), cocheras (enrollables, seccionales,
    basculantes, de tijera) y escaparates;
  - escalones, números, buzones, porteros automáticos, contadores, placas, cámaras, bajantes, aparatos de aire,
    toldos, cables;
  - la altura de su fachada y su tejado.
- **El hueco entre el edificio de ladrillo y la casa de la fisioterapia** (4,1 m, acera oeste) no existía en el juego:
  - el Catastro no tiene edificio ahí, pero las fotos sí: una planta del mismo rojo, con cochera marrón y puerta blanca;
  - encima, una terraza con balaustrada blanca y pérgola, y detrás una planta ocre;
  - el juego lo levanta ahora (`gaps` en `src/malfeitos.js`, `resolveMeasured`).
  - El otro hueco del Catastro en esa acera, entre las casas de las ventanas de arco y del portón, ya lo rellenaba el
    pueblo (`infill.js`), y ahora lleva su fachada: una tapia alta crema, con zócalo ocre y una puerta de arco.
- **Las farolas de la calle** son las de las fotos (seis faroles de pared en la acera oeste), en vez de las que ponía
  el juego.
- **A las puertas medidas** no se les añaden macetas, sillas ni bicis al azar: están como en las fotos.

## Cómo está hecho

| Archivo | Qué hace |
|---|---|
| `src/malfeitos.js` | Los datos: cada casa con su acera, su tramo de calle (metros desde la calle Nueva) y todo en metros desde su esquina izquierda vista desde la calle. Ningún dato de Google: solo números. |
| `src/fachadas.js` | Busca las paredes del Catastro de la calle y reparte las casas sobre ellas (una casa puede ocupar dos edificios o compartir uno); corta los huecos y pinta las zonas (`emitMeasuredRun`, en `buildings.js`); construye los detalles 3D cerca de la cámara (`buildMeasuredDetails`, en los trozos de `FacadeDetails`). |
| `src/buildings.js`, `facades.js`, `world.js` | Las enganchan: alturas y tejados medidos por parte del Catastro, las farolas de la calle, sin detalles al azar en esas paredes. |
| `src/materials.js` | Dibujos nuevos de los detalles: ladrillo (24 × 7 cm), losas de piedra pulida y cañizo. |
| `tools/malfeitoslab.js` | La cámara del juego en el sitio de cada foto: `MF.shot(n)`, `MF.some([…])`, `MF.all()`. Deja las capturas en `.snaps/mf_NN.jpg`. |
| `tools/fachadas/*.py` | Las herramientas de medir (Python con Pillow). Leen las capturas de `~/Desktop/Malfeitos` (o de `FOTOS=…`) y escriben en `.snaps/fachadas/`. |

- **Otra calle** se haría igual:
  1. Sus fotos en una carpeta.
  2. `hs.py` para las hojas de cada pared.
  3. Las medidas en un archivo como `malfeitos.js`.
  4. Comprobar con `malfeitoslab.js` y `sheet21.py`.

## Comprobado

- **Las 21 vistas**, foto y juego lado a lado, en las dos estéticas (Plastilina y Realista).
  - Se reconocen las casas, en su sitio, con sus huecos, colores y alturas.
- **Las 30 paredes** de la calle (las del Catastro, la del relleno del pueblo y la del hueco) reciben su casa, sin
  avisos.
- **Sin huecos**: a lo largo de la calle fotografiada, las únicas fachadas que faltan son las bocacalles.
- **Consola**: sin errores.
- **Rendimiento**: en la calle, 5,6 ms por fotograma frente a 4,4 ms en la plaza (Realista, 1536 × 1152, tiempo de
  procesador).

## Límites

- **En la Plastilina**, los colores van más cálidos y saturados que en la foto: es la gradación de esa estética (la
  plastilina de las imágenes de referencia). En la Realista se ven como son.
- **Lo que no se ve bien en las fotos** queda con menos detalle:
  - el bloque moderno del sur y el centro de la casa amarilla, solo vistos de lejos;
  - el bajo de la casa blanca del tejado (fotos movidas);
  - los laterales y traseras de las casas, que siguen siendo los del juego.
- **Las fachadas a la calle Nueva** de las casas de las esquinas no se han medido: son las de siempre, con el color de
  la casa.
- **Los coches, contenedores y señales** de las fotos no se han copiado.
