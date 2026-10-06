# Un pueblo que vive — la gente de Guareña, lo que se cuentan y cómo conducen

Estado: hecho en la versión Evolución (6 de octubre de 2026). Lo pidió el usuario: «quiero que todos los NPCs
muestren una inteligencia mucho más avanzada. Civismo… coherencia y movimientos coordinados y lógicos… que cada NPC
tenga su propia conversación y su propia memoria… Los vehículos han de cumplir estrictamente las reglas viales… tiene
que haber también bicis y motos… mira cuántos habitantes hay censados en Guareña y muestra una población razonablemente
lógica… con más volumen de personas alrededor de las plazas, de la iglesia o de los recintos comerciales».

## 1. Lo que dicen los datos

| Dato | Fuente | En el juego |
|---|---|---|
| **6.665 habitantes** (padrón del INE a 1 de enero de 2025) | [Guareña (Wikipedia)](https://en.wikipedia.org/wiki/Guare%C3%B1a) | `census.js` crea los 6.665 vecinos, uno a uno. |
| Pirámide de edades: un 13 % de menores de 15 años, un 60 % en edad de trabajar y un 27 % de mayores de 65 (censo de 2021) | [Población de Guareña en 2021 (Telencuestas)](https://telencuestas.com/censos-de-poblacion/espana/2021/extremadura/badajoz/guarena) | Edades en tramos de cinco años. Sale un 12,8 % de menores de 15 y un 26,9 % de mayores de 65. |
| El mercadillo semanal es **los miércoles** | [Mercadillos de la provincia de Badajoz, miércoles (mercadillos.org)](https://mercadillos.org/es/provincia-badajoz/hoy) · [Mercadillo de Guareña (mercadillosemanal.com)](https://www.mercadillosemanal.com/en.badajoz/mercadillo-de-guarena) | Antes se ponía otro día. Ahora, miércoles de 9 a 14, con su carretera cortada al tráfico. |
| Límites de velocidad urbanos desde 2021: 20 km/h en plataforma única, 30 con un carril por sentido, 50 con dos o más (art. 50 del Reglamento General de Circulación) | [Artículo 50 del RGC (Iberley)](https://www.iberley.es/legislacion/articulo-50-reglamento-general-circulacion) | `legalLimit()`: 20, 30, 50 en la travesía señalizada, 90 fuera del pueblo y 30 en los caminos de tierra. |
| Prioridad en las intersecciones: señales (STOP, ceda el paso) y, sin señales, el que viene por la derecha | [Normas de prioridad en las intersecciones (RGC, Papelea)](https://papelea.com/es/leyes/reglamento-general-de-circulacion/titulo-ii_capitulo-iii_seccion-1-normas-de-prioridad-en-las-intersecciones) | STOP con parada completa en la línea, ceda el paso, prioridad a la derecha y no entrar en un cruce sin sitio para salir. |
| El peatón tiene prioridad en el paso de cebra y cuando el coche gira y él cruza la calle a la que entra (art. 65) | [Prioridad de paso de los peatones (RACE)](https://www.race.es/prioridad-paso-peatones) | Los coches paran ante quien está en el paso o esperando en su bordillo, y al girar ceden a quien cruza la boca de la calle. |
| Donde hay paso de peatones se cruza por él, no por sus proximidades. Sin semáforo, solo se entra en la calzada si la distancia y la velocidad de los coches lo permiten (art. 124) | [Pasos de peatones y cruce de calzadas, art. 124 (Tu Teórica)](https://tuteorica.com/normativa-de-trafico/rgc/pasos-peatones-y-cruce-calzadas-art-124-rgcir/) · [Peatones (RGC, Papelea)](https://papelea.com/es/leyes/reglamento-general-de-circulacion/titulo-iii_capitulo-iv) | Cruzan por el paso si hay uno a menos de 40 m y, si no, por la esquina. Esperan a que los coches puedan parar. |
| 1,5 m de separación lateral al adelantar a un ciclista (art. 85) | [Distancia lateral al adelantar a un ciclista (Tu Teórica)](https://tuteorica.com/material-complementario/cual-es-la-distancia-lateral-de-seguridad-que-debemos-dejar-al-adelantar-a-un-ciclista-en-carretera/) | El coche guarda el metro y medio. Si no cabe, sigue a la bici con paciencia. |
| Modelo de conductor inteligente (IDM): distancia de seguridad en tiempo, aceleración y frenada cómodas | [The Intelligent-Driver Model and its Variants](https://traffic-simulation.de/info/info_IDM.html) | `safeSpeed()`: tiempo de seguridad de 1,45 a 2,05 s y frenada prevista de 1,7 a 2,3 m/s². La frenada fuerte, solo en emergencias. |
| La gente camina en grupos (de lado, o uno detrás de otro si no cabe) y se aparta de los obstáculos | [Social groups in pedestrian crowds (revisión)](https://opendata.usm.my/handle/123456789/74593) · [Towards Social Behavior in Virtual-Agent Navigation](https://webspace.science.uu.nl/~gerae101/pdf/Towards_Social_Behavior_in_Virtual-Agent_Navigation.preprint.pdf) · [Computer Simulations of Pedestrian Dynamics (Helbing)](https://arxiv.org/pdf/cond-mat/9805074) | Familias y amigos van juntos, en fila en las aceras estrechas. Todos rodean farolas, contenedores, sillas y corros. |

## 2. Qué había antes

- La gente de la calle eran caras al azar que no eran nadie: cada vez una persona distinta, sin nombre, casa ni memoria.
  El número de peatones seguía una curva fija por horas, igual en la plaza que en una calle cualquiera.
- Al hablar con alguien, una frase suelta.
- Los coches iban a la velocidad «del tipo de calle» (30–45 km/h), sin STOP, ceda el paso ni prioridad a la derecha.
  No había motos ni bicis con conductor por el tráfico.
- El mercadillo se ponía otro día de la semana.

## 3. Qué se ha hecho

### El padrón (`src/census.js`)
- **6.665 vecinos** en **2.818 hogares** sobre las **4.156 puertas reales** de las fachadas del mapa. Los hogares son
  de los tipos de un pueblo de las Vegas: mayores solos o en pareja, familias, tres generaciones, jóvenes…
- Cada vecino tiene:
  - nombre de su generación y dos apellidos de la zona (muchas familias con su mote: «los Pajaritos»);
  - edad, dirección (la calle de su puerta y su número) y oficio (el campo, la tomatera, la cooperativa, las tiendas,
    los bares, el colegio, el centro de salud, el Ayuntamiento…);
  - familia (padres, abuelos en otra casa), amigos y conocidos de vista;
  - una **rutina para cada día de la semana**: el pan a primera hora, el trabajo, el bar y su terraza, el huerto, el
    médico, el banco, el mercadillo del miércoles, la misa (por la tarde y el domingo a mediodía), el paseo de la
    tarde por la Plaza de España y el fresco a la puerta por la noche.
- **El colegio**:
  - Quien cuida a los niños (un padre o una madre que no trabaja fuera, o los abuelos) los lleva a las nueve y los recoge
    a las dos.
  - Cada familia tiene su colegio: el más cercano, casi siempre. Los de 3 a 5 años van al edificio de Infantil.
  - Los de 12 a 17 van al instituto; los menores de 3, a la guardería.
- Son vecinos inventados: nombres y familias se generan al azar. Solo el número de habitantes y la forma de la pirámide
  son los reales.

### Cuánta gente y dónde
- Cada dos minutos del juego se calcula quién está en la calle y dónde: yendo a algún sitio, allí (la plaza, la puerta
  del colegio, el mercadillo, una terraza) o volviendo.
- Las personas que ves son esos vecinos: **la misma cara, el mismo nombre y la misma memoria cada vez**.
- Su número es el que dice el padrón a menos de 130 m (con un tope según la calidad gráfica: 115, 70 o 38).
- Por eso hay núcleos:
  - el paseo de la tarde llena la Plaza de España (más de 100 personas a la vez);
  - la salida de misa, la puerta de la iglesia;
  - el mercadillo, su carretera (más de 110);
  - a las dos, la puerta del colegio (hasta 90).
- Una calle cualquiera a media mañana tiene cuatro o cinco personas, y la travesía, dos o tres.
- **El reloj del pueblo**:
  - Una hora del juego dura un minuto y medio, así que andando por la calle nadie llegaría a tiempo a nada.
  - A quien va a un sitio se le encuentra en el último tramo de su camino (de 25 a 60 m, por las calles). Si va a un
    sitio al aire libre y ya casi ha llegado, se le encuentra allí.
  - Nadie aparece a la vista: sale de su puerta, de la vuelta de una esquina o de detrás de ti.

### A pie, con civismo (`src/peds.js`)
- **Por la acera**: por su centro (en las calles muy estrechas, pegados al bordillo, nunca dentro de las casas).
  Rodean farolas, contenedores, árboles, las sillas del fresco y los corros; bajan un momento a la calzada solo si la
  acera no da para más.
- **Esquinas**: doblan la esquina en la esquina, sin ir hasta el centro del cruce y volver.
- **Cruzar**:
  - Por el paso de cebra si hay uno a menos de 40 m; si no, por la esquina (a menos de 28 m); si no, de frente, por el
    camino más corto.
  - Siempre mirando a un lado y a otro desde el bordillo.
  - En el paso de cebra esperan a que los coches que vienen puedan parar; fuera de él, a un hueco que dé para cruzar
    con dos segundos de margen.
  - Donde una senda peatonal sale a una calle, paran en el bordillo antes de pisarla.
- **Nada de atajos**:
  - Antes, alguien a quien una farola o un corro le cortaba el paso «se atascaba» y acababa cruzando en diagonal sin
    mirar. Ahora rodea el obstáculo, y si no puede, se da la vuelta.
  - Quien da media vuelta sigue por su acera.
  - Si alguien pierde su calle, vuelve a la más cercana y rehace el camino.
- **Saludos según se conozcan**:
  - De vista, el «¡Adiós!» del pueblo (distinto según la edad y la hora). En la aglomeración del mercadillo o del
    paseo, solo de vez en cuando.
  - A los amigos y a la familia, por su nombre; a veces se paran a hablar.
- **Colas, terrazas, bancos y grupos**: la cola de la panadería por la mañana, las mesas de las terrazas, los bancos
  para los mayores, los corros de amigos en la plaza y las sillas del fresco de cada casa por la noche.
- **Familias**:
  - Van juntas, a la par, o una detrás de otra si la acera es estrecha; los niños, del lado de la pared.
  - Los niños pequeños van de la mano y por la tarde juegan en el parque y en la plaza.
  - A las dos, la puerta del colegio se llena de padres y abuelos que charlan mientras esperan. Los niños salen
    corriendo hacia quien ha venido a por ellos, y se van juntos a casa.
- **Misa**: al terminar, la gente sale por la puerta de Santa María a la acera de la iglesia y se para a hablar.

### Conversaciones con memoria (`src/charla.js`, `src/npcmind.js`)
- Al hablar con alguien eliges qué decirle:
  - presentarte;
  - preguntar qué tal, qué se cuenta, adónde va, a qué se dedica;
  - pedirle el camino a un sitio, o despedirte.
- Contesta con su vida (su familia, su trabajo, su calle, lo que tiene que hacer hoy) y con su forma de hablar según
  la edad.
- **Memoria** (se guarda con la partida): cada vecino recuerda si os conocéis, cuántas veces habéis hablado, qué le
  contaste y qué le contó él. También recuerda lo que te vio hacer.
- **Las noticias del pueblo**:
  - Cada día hay algunas: una boda, un nacimiento, una jubilación, alguien en el hospital, la campaña del tomate, el
    partido del domingo, la calle que está en obras…
  - Corren de boca en boca en los corrillos, y cada grupo habla de alguna.
  - Lo que hagas también se comenta («¿has visto el jaleo de antes?»).
- **Caminos de verdad**: si le preguntas por un sitio, te explica el camino por las calles reales («sigue por esta, gira
  a la izquierda en…») y te deja la marca en el mapa.
- **Variedad**: lo que se ha dicho hace poco en cualquier corrillo del pueblo no se vuelve a elegir enseguida. Hay 19
  charlas de padres e hijos y 10 despedidas distintas.
- Ningún negocio real aparece por su nombre: «la panadería de la calle…», «el bar de la plaza».

### Coches, motos y bicis (`src/traffic.js`)
- **Límite legal de cada calle** (art. 50). Cada conductor va a entre el 84 y el 98 % de él, y más despacio en las
  curvas.
- **Cruces**:
  - STOP con parada completa en la línea; ceda el paso.
  - Prioridad a la derecha donde no hay señales (art. 57). Al girar a la izquierda, ceden al que viene de frente.
  - Nunca entran en un cruce sin sitio para salir (art. 59).
  - En los cruces estrechos del casco, de uno en uno.
- **Peatones**:
  - Paran en el paso de cebra si hay alguien en él o esperando en su bordillo.
  - Al girar, ceden a quien cruza la calle a la que entran.
  - Pasan despacio junto a la gente en las calles estrechas.
- **Bicis**: 1,5 m al adelantarlas. Si no cabe, detrás, con paciencia.
- **Conducción con mesura**: distancia de seguridad en segundos (modelo IDM) y arranques suaves. Los conductores
  frenan con tiempo: como mucho 2,6 m/s², salvo en una emergencia.
- **En las calles estrechas**:
  - Nadie planea una curva cerrada de más de 110° hacia una calle estrecha (no se puede tomar sin rozar la esquina).
  - Los giros cerrados a la derecha se abren.
  - El coche se aparta de las fachadas que invaden la calzada.
  - No da marcha atrás si alguien se acerca por detrás.
- **Motos y bicis** con su conductor, que es un vecino del padrón. Las motos llevan casco (art. 118).
  - Motos: un 7,5 % de los vehículos que salen.
  - Bicis: un 8,5 % de día y ninguna de noche.
- **Hora punta** por la mañana temprano (al campo y a la fábrica) y al mediodía; poco tráfico en la siesta.
- **El mercadillo** corta su carretera los miércoles de 9 a 14: los coches dan la vuelta por otro sitio.

## 4. Medidas

`tools/townlab.js` pone el pueblo en siete escenas (a la hora y el día de la semana de cada una). Juega 45 s de
calentamiento y 90 s de medida, con el jugador quieto en el sitio. Cuenta:
- **gente**: personas a menos de 60 y 120 m, y en qué estado;
- **civismo**: tiempo por la calzada, cruces lejos de paso o esquina, cruces con un coche encima, personas que se
  pisan;
- **tráfico**: velocidad, excesos, STOP, pasos de cebra, prioridad a la derecha, distancia de menos de 1 s, frenazos
  (más de 3,5 m/s²), sustos, choques, roces con muros y atropellos;
- **charla**: conversaciones, frases oídas, distintas y repetidas en menos de un minuto.

Mismas escenas y misma herramienta en la versión anterior (`f65b5f3`) y en esta:

**Gente y civismo** (antes → **después**):

| Escena | Personas a menos de 60 m (máximo) | Por la calzada (% del tiempo) | Cruzando lejos de paso o esquina (%) | Cruzan con un coche encima |
|---|---|---|---|---|
| Plaza de España, martes 11:00 | 10,4 (14) → **35,8 (56)** | 10,8 → **1,5** | 7,5 → **0,8** | 4 → **1** |
| Plaza, jueves 20:15 (paseo) | 24,2 (30) → **100,3 (102)** | 10,6 → **2** | 7 → **1,2** | 3 → **1** |
| Santa María, domingo 12:48 (misa) | 14,8 (20) → **40,4 (56)** | 16 → **8,8** | 6,9 → **3,5** | 0 → **1** |
| C. P. San Gregorio, miércoles 14:01 | 1,7 (3) → **54,4 (95)** | 19,9 → **4,6** | 10,8 → **3,6** | 0 → **0** |
| Calle del casco, viernes 10:30 | 10,3 (15) → **3,8 (6)** | 35,3 → **10,2** | 12,5 → **0** | 3 → **0** |
| Travesía, miércoles 13:12 | 4,3 (7) → **2,4 (4)** | 22,8 → **0,7** | 12 → **0,7** | 9 → **0** |
| Mercadillo, miércoles 11:00 | 0 (0) → **113,4 (115)** | 22,4 → **0,1** | 5,5 → **0** | 5 → **0** |

**Tráfico y conversaciones** en 90 s (antes → **después**):

| Escena | Motos y bicis | Frenazos | Sustos con peatones | Choques | Roces con muros | Frases oídas (distintas) |
|---|---|---|---|---|---|---|
| Plaza de España, martes 11:00 | 0 → **4** | 43 → **11** | 0 → **0** | 1 → **0** | 27 → **24** | 2 (2) → **26 (7)** |
| Plaza, jueves 20:15 (paseo) | 0 → **2** | 55 → **13** | 4 → **0** | 3 → **1** | 26 → **20** | 11 (10) → **147 (72)** |
| Santa María, domingo 12:48 (misa) | 0 → **2** | 57 → **6** | 0 → **0** | 12 → **1** | 27 → **4** | 5 (4) → **46 (25)** |
| C. P. San Gregorio, miércoles 14:01 | 0 → **3** | 56 → **3** | 1 → **0** | 3 → **0** | 16 → **8** | 0 (0) → **336 (161)** |
| Calle del casco, viernes 10:30 | 0 → **2** | 30 → **24** | 2 → **0** | 0 → **1** | 19 → **14** | 2 (2) → **1 (1)** |
| Travesía, miércoles 13:12 | 0 → **7** | 33 → **15** | 1 → **0** | 0 → **2** | 7 → **12** | 0 (0) → **0 (0)** |
| Mercadillo, miércoles 11:00 | 0 → **5** | 57 → **2** | 2 → **0** | 15 → **0** | 8 → **3** | 0 (0) → **267 (61)** |

En las siete escenas juntas:
- frenazos: 331 → **74**;
- choques entre vehículos: 34 → **5**;
- roces con muros y bordillos: 130 → **85**;
- sustos con peatones (un coche en marcha a menos de 70 cm de alguien): 10 → **0**;
- cruces sin señales en los que alguien no cedió al que venía por la derecha: 5 de 352 → **0 de 309**;
- exceso de velocidad: antes algún coche llegó a pasarse 7 km/h del límite; ahora **ninguno**;
- atropellos: ninguno en las dos versiones;
- tiempo de simulación por paso (sin dibujar): 0,5–2,1 ms → **0,7–4,3 ms**, con hasta cuatro veces más gente.

Cómo leer las tablas:
- «Por la calzada» cuenta todo el tiempo en mitad de la calzada, también los cruces legales por la esquina. Lo que debe
  ser bajo es «lejos de paso o esquina».
- En la calle del casco y en la travesía hay menos gente que antes, y es lo que debe ser: a media mañana de un día de
  diario la mayoría está trabajando, en el campo o en la compra.
- Cada pasada sale algo distinta (la gente y los coches van y vienen al azar). Entre pasadas se han visto de 0 a 2
  choques en la travesía y de 4 a 24 frenazos en la calle del casco.
- Las frases cortas («¡Adiós!», «¡Buenas!») se repiten por naturaleza en un paseo de cien personas. De las frases de
  cuatro palabras o más, en la puerta del colegio se repite la mitad en un minuto: allí empiezan 52 conversaciones en
  minuto y medio, casi todas de padres con sus hijos.

## 5. Cómo probarlo

```js
const T = await import('/tools/townlab.js?' + Date.now());
await T.run('colegio', { hour: 14.02, wd: 2 });   // una escena (wd: 0 lunes … 6 domingo)
await T.suite('prueba');                            // las siete → .snaps/townlab_prueba.jpg (JSON)
```

En el juego:
- un miércoles a las dos, en la puerta del C. P. San Gregorio, ves la salida del colegio;
- un jueves a las ocho y cuarto de la tarde, en la Plaza de España, el paseo;
- un domingo a las doce y tres cuartos, en Santa María, la salida de misa.

## 6. Límites

- Los coches no ponen intermitentes. No hay tractores en el tráfico.
- Los vecinos que no están en la calle no se simulan dentro de las casas: solo su horario.
- El reloj del juego va cuarenta veces más rápido que el real: los trayectos se acortan (§3) para que la gente llegue a
  tiempo.
