# Las aceras de Guareña, medidas en las ortofotos

Estado: hecho en la versión Evolución (8 de octubre de 2026), sin publicar todavía. Lo pidió el usuario: aceras
coherentes, con el ancho que se ve en las imágenes vía satélite (cuánto es calzada y cuánto acera, hasta las casas) y
con sentido para que la gente pueda pasear por ellas, en todas las calles del pueblo.

## Antes

- **Sin datos de aceras.** OpenStreetMap no tiene el ancho de las calles ni de sus aceras en Guareña.
- **Una regla fija.** El juego medía la distancia entre fachadas y repartía con una regla: aceras del 14 % de esa distancia (entre 0,8 y 3,2 m) y el resto calzada.
- **Una línea recta, un ancho fijo.** La calzada iba recta a lo largo de la línea de OpenStreetMap y con el mismo ancho de punta a punta. Donde la calle se curvaba o se estrechaba entre sus casas, una acera se ensanchaba y la otra se quedaba en una tira o desaparecía bajo las fachadas.
- **Peatones dentro de las casas.** El 13,8 % de los puntos por donde andaban los peatones caía dentro de una pared.
- **Calles cerradas.** En cuatro calles la línea de OpenStreetMap pasaba por debajo de las casas, y el juego las cerraba: ni coches ni peatones.

## Las fotos: el PNOA del Instituto Geográfico Nacional

- **Las ortofotos.** Son las del Plan Nacional de Ortofotografía Aérea, del servicio WMS del IGN, con licencia CC BY 4.0 («PNOA cedido por © Instituto Geográfico Nacional»).
- **Cuatro vuelos.** Se usan el de 2025 («máxima actualidad», el de referencia) y los de 2022, 2019 y 2016.
  - Cada uno está tomado desde otro sitio y a otra hora: los tejados se inclinan hacia otro lado y las sombras caen en otra parte.
  - Así, una acera tapada en uno se ve en otro.
- **En el juego no hay ninguna imagen.** Las fotos se descargan a `.cache/pnoa/` (fuera del repositorio) en teselas de 300 m a 15 cm por píxel (`tools/aceras/pnoa.py`). Al juego solo pasan números: medidas y coordenadas de bordillos.
- **El encaje.** La proyección del juego es lineal en longitud y latitud, así que las fotos pedidas en CRS:84 encajan píxel a píxel con el mapa. Se comprobó con los edificios del Catastro dibujados encima.

## 1. La medida de cada calle (`tools/aceras/medir.py`, `final.py`)

1. **Cada calle, desenrollada** (`tira.py`): la foto se endereza a lo largo de la línea de la calle, 10 cm por píxel. Las aceras quedan como bandas.
2. **El bordillo en cada vuelo**: a cada lado, la línea paralela a la calle donde el gris de la calzada pasa a la acera, más clara, sumando todas las filas (un coche aparcado o una sombra la tapan solo a ratos).
3. **Los vuelos votan**, cada uno con el peso de lo bien que ve esa acera. Gana el sitio con más votos a ±35 cm.
4. **Las dudosas, a mano** (`revisar.py`, `revisar2.py`, `correcciones.json`).
5. **El resultado**: 233 calles con su calzada medida en `data/aceras.json`.

## 2. Los bordillos, metro a metro, a lo largo de las casas (`src/kerbs.js`)

Con la calle ya en su sitio, el juego tiende cada bordillo metro a metro, mirando dónde están de verdad las paredes (después de soldar las casas y tapar las grietas, `docs/solidez.md`):

- **Donde lo ponen las fotos.** El bordillo va a la mitad de la calzada medida (o por los puntos de la revisión, más abajo).
- **Una acera para andar.** Donde las casas dejan menos de un metro de acera, el bordillo entra lo que haga falta para dar ese metro, siempre que a la calzada le quede sitio: 3 m con un sentido; 4,6 m con dos, si la calle tiene en la foto calzada para dos carriles. En un estrechamiento corto (una casa que sobresale) la calzada baja hasta 2,8 m antes que quitarle la acera.
- **Calles estrechas.** Si no caben dos aceras para andar, la calle tiene una, en el lado donde la foto la muestra más ancha, y la calzada llega a las casas del otro lado (22 calles). Si no cabe ni una, es de plataforma única: sin bordillos, la calzada de casa a casa y los coches a 20 km/h (3 calles).
- **Sin brusquedades.** El bordillo se dobla como mucho 30 cm por metro y no entra en cada portal ni en cada hueco entre dos casas: sigue la línea de las fachadas.
- **Todo sale del bordillo tendido:**
  - el asfalto, dibujado de bordillo a bordillo (el ancho cambia a lo largo de la calle), los bordillos, el rulo de los aparcamientos, los pasos de cebra y las líneas de stop;
  - los carriles de los coches (estrechados y movidos con la calzada en cada punto) y los coches aparcados (no donde el bordillo entra);
  - el camino de los peatones, por el medio de la acera; en las calles de una acera, por esa acera (cruzan a ella en la esquina);
  - farolas, contenedores, postes de la luz, señales, árboles, motos, basura y baldosas levantadas.

## 3. La revisión final: todas las calles sobre las fotos (`tools/aceras/revisar3.py`, `puntos.py`)

- **Todas.** Cada calle del pueblo con bordillos en el juego (583) y las 4 que estaban cerradas: 38,7 km de calle.
- **Las hojas.** Cada calle desenrollada entera, en tramos de 60 m, en los vuelos de 2019 y 2025 a 10 cm por píxel, con los bordillos del juego encima (amarillo; azul en el lado sin acera), las fachadas que ve el juego (magenta) y una escala de metros a cada lado. Son 104 hojas, todas miradas.
- **Las correcciones.** Donde el bordillo del juego no caía en el de la foto, se puso a mano en su sitio: unos pocos puntos por lado (metros a lo largo de la calle y metros desde su línea), guardados como coordenadas del juego en `data/bordillos.json`. El juego tiende el bordillo por esos puntos.
  - En total, 277 bordillos de 157 calles.
  - Sobre todo calles que el juego había hecho con la regla, sin medida: avenidas, carreteras con aparcamiento a los dos lados, plazas, la rotonda, calles con una sola fila de casas.
  - Y algunas medidas donde la calle cambia de ancho (calle Alberquilla, de 17 a 12 m) o tiene una isleta (Hernán Cortés).
- **Las calles cerradas.** La calle Don Manuel Dorado, la calle Cañadilla y una tercera sin nombre tenían la línea de OpenStreetMap bajo las casas, a 2–3 m de la calle de verdad, y el juego las tenía cerradas.
  - Sus bordillos se pusieron donde la foto muestra la calle, y su línea se llevó al medio entre ellos (`--centrar`), doblándose hacia sus cruces en los últimos 6 m. Vuelven a estar abiertas a coches y peatones.
  - Lo mismo con una calle de una sola fila de casas que pasaba 7 m bajo la esquina de una casa.
  - Una cuarta calle cerrada es el acceso de servicio bajo el techo del mercado, y sigue cerrada.
- **Las casas sobre las calles.** El juego ya no rellena un hueco con una casa si su planta pisa la calzada de alguna calle (le pasó a una en la calle San Ginés).

## Comprobado

En todas las calles del pueblo, cada metro de cada lado (43.271 m), con `pavAudit()` de `tools/solidezlab.js`:

| | Antes (regla) | Ahora |
|---|---|---|
| Acera para andar (0,9 m o más) | 76,6 % | 94,6 % |
| Estrecha (0,5–0,9 m) | 9,8 % | 0,7 % |
| Una tira (menos de 0,5 m) | 9,9 % | 0 % |
| Sin acera (una casa sobre el bordillo) | 3,8 % | 0 % |
| Sin acera a propósito: calle con la acera al otro lado | — | 3,7 % |
| Sin acera a propósito: plataforma única | — | 1,0 % |

Por dónde van los peatones (41.687 puntos de su camino):

| | Antes | Ahora |
|---|---|---|
| Por la acera | 86,2 % | 98,8 % |
| Por una calle de plataforma única, junto a las fachadas | — | 1,0 % |
| Por la calzada | 0 % | 0,05 % |
| Contra una pared | 13,8 % | 0,11 % |

- **Contra una pared**: lo que queda son esquinas de casas que el camino roza a 10–25 cm, casi siempre al doblar un cruce.
- **Junto a mobiliario**: el 0,6 % de los puntos de la acera pasa junto a una farola, un árbol o un banco, que rodean (`wayRound`).
- **Las calles, abiertas**: ninguna línea de calle del pueblo pasa ya por debajo de una casa. Antes de esta revisión eran 91 m (las tres calles cerradas y tres tramos cortos).
- **Sobre las fotos**: las hojas de revisión rehechas con los bordillos finales (`revisar3.py`) los muestran en el bordillo de la foto. Las calles corregidas se comprobaron una a una.
- **Desde la calle**, en las dos estéticas: dos aceras con su bordillo a lo largo de las fachadas; una sola acera en las calles estrechas (calle Bronca); plataforma única (calle San Ginés); la isleta de Hernán Cortés; la calle Alberquilla, que se estrecha.

## Cómo rehacerlo

```bash
python3 tools/aceras/pnoa.py                                   # las ortofotos, a .cache/pnoa (una vez)
python3 tools/build_map.py --edges .cache/aceras/edges.json    # las calles como las dibuja OpenStreetMap
python3 tools/aceras/medir.py --sin-coches                     # los bordillos, sin la regla de los coches aparcados
python3 tools/aceras/medir.py                                  # y con ella
python3 tools/aceras/final.py                                  # data/aceras.json, con correcciones.json
python3 tools/aceras/puntos.py --archivo tools/aceras/revision_final.txt   # data/bordillos.json
python3 tools/build_map.py                                     # data/map.json
```

Para revisar otra vez:

- en el juego (`?debug`), `await (await import('/tools/solidezlab.js')).exportKerbs()` guarda los bordillos tendidos en `.cache/aceras/kerbs_runtime.json`;
- `python3 tools/aceras/revisar3.py` hace las hojas (`.snaps/aceras/rv_NNN.jpg`; `--medidas`, `--regla` o los números de algunas calles);
- `python3 tools/aceras/revisar3.py --cerca ID S` muestra un punto de cerca, con el norte arriba, en los cuatro vuelos;
- las correcciones se añaden a `tools/aceras/revision_final.txt`, una línea por lado: `ID +|- S:OFF S:OFF … [--centrar]`.

Los números de calle son los del juego (su orden en `data/map.json`); `bordillos.json` guarda las claves de OpenStreetMap y coordenadas, que no cambian.

## Límites

- **Precisión.** Las fotos tienen 15–25 cm por píxel y los tejados se inclinan sobre las aceras. Los bordillos están puestos con unos ±30 cm de error.
- **Los cruces.** Los bordillos paran a la entrada del cruce, como antes.
- **El acceso del mercado.** La vía de servicio bajo el techo del mercado sigue cerrada.
