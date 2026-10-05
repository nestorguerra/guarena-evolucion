# La carrera de Álex — cómo corre y cómo le sigue la cámara

Estado: hecho en la versión Evolución (5 de octubre de 2026). Lo pidió el usuario: «quiero que la dinámica de correr
mejore… investiga cómo corre el personaje en otros juegos… y quiero más fluidez en cómo se mueve la cámara cuando se
mueve el personaje y cómo se mueve el personaje, sobre todo corriendo».

## 1. Qué hacen otros juegos

| Técnica | Quién la usa / de dónde | Qué nos llevamos |
|---|---|---|
| **Motion matching** con bucles de cada paso | Ubisoft (*For Honor*, Simon Clavet, GDC 2016), Naughty Dog (*The Last of Us Part II*), EA | Álex ya lo usaba; le faltaban **bucles de esprint**: la base de datos solo tenía carreras cortas, y en cada esprint saltaba de toma unas cinco veces por segundo. |
| **Desplazamiento por código** y animación que se adapta | Daniel Holden, «Code vs Data Driven Displacement» | El cuerpo lo mueven muelles críticamente amortiguados; la animación se adapta a él: **bloqueo de pies** con IK de dos huesos, en vez de pies que patinan. |
| **Stride warping** y **orientation warping** | Unreal Engine (Animation Warping, usado en *Lyra* y *Fortnite*) | Zancada más larga cuando el cuerpo va más deprisa que la captura; piernas giradas hacia donde va de verdad el cuerpo y el torso mirando al frente. |
| **Inclinación física** | Tutorial de animación procedural de Vulkan; David Rosen (*Overgrowth*), «An Indie Approach to Procedural Animation», GDC 2014 | Inclinarse en las curvas lo que pide la fuerza centrípeta (atan(v·ω/g)), hacia delante al acelerar y al esprintar, atrás al frenar; la cabeza nivelada, como la de un corredor. |
| **Principios del ciclo de carrera** | Escuelas de animación (contacto, bajada, paso, subida; fase de vuelo; brazos; cabeza estable) | Medir que el pie apoyado no se mueve y que la pose cambia en cada fotograma. |
| **Cámara con muelles** | Holden, «Spring Roll Call»; artículos de cámara en tercera persona | Seguimiento con retardo suave (muelle con semivida, no lerp por fotograma), mirar un poco por delante, abrir algo el campo de visión al esprintar, girar sola detrás del corredor y no meterse de golpe en postes ni paredes. |

## 2. Qué fallaba (medido con `tools/runlab.js`)

1. **El stop motion se comía la carrera.** En la Plastilina, la pose del protagonista se sostenía 1/12 s mientras el
   cuerpo avanzaba fluido: los pies patinaban (9,4 m/s de media con el pie «apoyado») y la pose cambiaba 22,7 veces por
   segundo. Era el «a saltos».
2. **La cámara daba tirones**: un solo rayo de colisión la metía de golpe detrás de una farola o de una esquina y la
   sacaba al fotograma siguiente (sacudida de hasta 36.000 m/s²; la cadera saltaba hasta 1.066 px en pantalla).
3. **El motion matching saltaba de toma unas cinco veces por segundo al esprintar.** La base de datos no tenía ningún
   bucle de esprint: las carreras más rápidas de la CMU (16_45, 16_46) duran 1,1 s y se quedaban sin fotogramas útiles.
4. **Los bucles daban un salto en cada vuelta**: el montaje antiguo fundía los últimos cinco fotogramas con los cinco
   primeros, y cada vuelta retrocedía cuatro fotogramas. El trote (16_55L) tropezaba cada 0,63 s y el pie apoyado
   saltaba unos 60 cm en dos fotogramas.
5. **El bloqueo de pies** volvía a fijar el pie dentro del mismo paso (saltos de hasta 35 cm), fijaba la bola del pie en el
   aire al apoyar el talón y dejaba pies bajo el suelo con la inclinación.
6. **En las curvas** las piernas corrían hacia donde miraba el cuerpo y no hacia donde iba: hasta 35° de diferencia.

## 3. Qué se ha cambiado

- **Protagonista fluido** (`plastilina.js` `SM.setFree`, `game.js`): Álex se dibuja con su pose de cada fotograma, a
  60 por segundo; la gente, los perros y los coches siguen a 12 poses por segundo. En el modo **Película** Álex vuelve a
  ir a doses, como todo. Su piel ya no «hierve» (`STEADY_BOIL`): en primer plano y a 60 fps sería un temblor.
- **Bucles de esprint** (`assets/hero/moves.bin.gz`, `tools/mocaplab.js` `appendDB`): cuatro bucles nuevos de un ciclo
  cada uno (16_45 y 16_46 rectos, a 3,7–3,85 m/s; 16_48 y 16_49 en curva, a ±1 rad/s), cortados de talón a talón del pie
  derecho cuando el izquierdo no da para un ciclo. `appendDB` añade tomas sin tocar ni un bit de los clips que ya había:
  aplica a las nuevas la calibración de la columna y de las clavículas de la base, medida sobre un paseo que ya contiene.
- **Bucles sin costura** (`loopCycle`): lo que no cierra entre el último fotograma y el primero se reparte a lo largo de
  todo el ciclo. Se rehicieron los tres bucles que ya había (16_47L, 16_35L y 16_55L).
- **Motion matching más estable** (`heromotion.js`): mientras lo que se pide no cambia, la toma que suena se mantiene
  al menos 0,45 s y solo se cambia por otra un 20 % mejor; el ritmo de reproducción sube con la velocidad hasta ×1,3,
  y lo que falta lo pone la zancada.
- **Pies** (`hero.js` `afterMove`):
  - La bola del pie se fija solo en el plano del suelo, una vez por pisada, y se suelta al despegar.
  - Entra y sale con una curva suave, nunca bajo el suelo.
  - La altura del pie es la de la captura, medida en el marco del propio cuerpo: el cuerpo se inclina sobre pies que
    siguen en el suelo.
  - La cadera baja para alargar la zancada sin hundir los pies.
- **Orientation warping**: las piernas giran hasta ~35° hacia donde va el cuerpo, y la columna gira lo mismo al revés
  para que el pecho y la cabeza sigan mirando al frente. En las curvas, el pie apoyado se arrastra la mitad.
- **Inclinación** (`player.js` `leanUpdate`):
  - En las curvas, lo que pide la velocidad por el giro (hasta 12,6°).
  - Hacia delante al acelerar y algo más al esprintar (4,6°).
  - Atrás al frenar, mientras quede velocidad.
  - Todo con muelles; la cabeza compensa el 65–70 % para quedar nivelada (`hero.js` `steadyHead`).
- **Pisadas**:
  - El ruido de cada paso suena cuando la captura apoya el pie, no con un contador.
  - Al esprintar, cada pisada levanta una pizca de polvo (algodón en la Plastilina).
- **Cámara** (`player.js` `CameraRig`):
  - El punto que sigue va con un muelle (semivida 0,11 s; 0,14 s en vertical) y mira un poco por delante en la
    dirección de la carrera, sin salirse de las paredes.
  - El ratón se suaviza con un muelle de 35 ms; 20 ms al apuntar.
  - Al correr se coloca sola detrás de Álex, salvo si acabas de mover el ratón.
  - Al esprintar, 5° más de campo de visión.
  - Colisión: la mediana de tres rayos (un poste delgado ya no la mete de golpe). Pegada a una pared, se aparta de lado
    antes que acercarse. Entra en un fotograma y sale con un muelle de 0,32 s.
- **Resolución dinámica** más tranquila: decide por ventanas de un segundo para no subir y bajar de calidad a tirones.

## 4. Medidas

`tools/runlab.js` juega guiones de teclas con el render del propio juego, fotograma a fotograma a 60 fps, graba un MP4
y mide:
- **Pie apoyado**: lo que se mueve la bola del pie mientras la captura dice que está en el suelo (m/s).
- **Pie a ras**: lo que se mueve cualquier punta a menos de 4 cm del suelo, y cuántas veces pasa de 1 m/s (patina).
- **Sacudida de cámara**: la aceleración de un fotograma al siguiente (m/s²).
- **Temblor en pantalla**: la segunda diferencia de la cadera dibujada (px).
- **Poses por segundo**.

Los guiones (5 s cada uno):
- *recto*: esprint por la calle de San Gregorio.
- *trote*: el trote de siempre.
- *zigzag*: esprint quebrando a izquierda y derecha.
- *curva*: esprint en una curva larga.
- *parar*: correr, parar y volver.
- *camara*: esprint girando la cámara con el ratón.

Las tres últimas se hacen en campo abierto dentro del pueblo.

Antes es la versión publicada (V14) y ahora es esta; las dos se midieron con el mismo programa, en la Plastilina y en
alta calidad.

| Guion | Pie apoyado (m/s) | Puntas a ras que patinan | Temblor en pantalla, medio / máx. (px) | Sacudida de cámara máx. (m/s²) | Poses por segundo |
|---|---|---|---|---|---|
| recto | 9,39 → **0,61** | 100 % → **0 %** | 1,34 / 7,7 → **0,37 / 1,0** | 4,8 → 4,1 | 22 → **60** |
| trote | 5,59 → **0,24** | 100 % → **14 %** | 1,17 / 4,9 → **0,31 / 1,8** | 1,6 → 0,8 | 22 → **60** |
| curva | 9,05 → **0,79** | 100 % → **0 %** | 1,62 / 10,9 → **0,40 / 1,2** | 6,8 → 16,2 ¹ | 22 → **60** |
| zigzag | 8,10 → **1,46** | 100 % → **20 %** | 1,57 / 7,6 → **0,46 / 1,6** | 229 → **29** | 22 → **60** |
| parar | 5,54 → **0,86** | 100 % → **4,5 %** | 3,77 / 53 → **0,34 / 1,9** | 1.906 → **20** | 22 → **60** |
| camara | 8,88 → **0,47** | 100 % → **1,5 %** | 1,31 / 7,7 → **0,37 / 1,0** | 364 → 82 ² | 22 → **60** |

¹ La cámara ahora se va colocando detrás del corredor en la curva (antes se quedaba donde estaba): gira algo más, pero
con suavidad. ² Lo que queda es el propio ratón, que empieza y para de golpe en el guion.

Lo que más se nota al jugar:
- El cuerpo ya no va «a saltos»: pose nueva en cada fotograma, y los pies no patinan.
- La cámara no da tirones al frenar ni al pasar junto a postes y esquinas.
- En recto, las puntas de los pies a ras de suelo ya no patinan nunca; el zigzag a esprint es lo más difícil y aún
  arrastra algo.

Los vídeos lado a lado (antes | ahora) los monta `runlab.sideBySide` con dos carreras grabadas.

Para que las medidas sean válidas, la partida se arranca con el botón Jugar del menú: con `game.start()` el bucle de la
página seguía en el menú y, entre fotograma y fotograma de la prueba, movía la cámara y los coches aparcados a otra parte
del pueblo (`interferencias` las cuenta; en estas medidas, 0).

## 5. Fuentes

- Simon Clavet, «Motion Matching and The Road to Next-Gen Animation», GDC 2016.
- Daniel Holden, «Code vs Data Driven Displacement» y «Spring Roll Call» (theorangeduck.com).
- Unreal Engine, Animation Warping: Stride Warping y Orientation Warping (*Lyra*).
- Tutorial de Vulkan, «Physics-Driven Procedural Lean».
- David Rosen, «An Indie Approach to Procedural Animation», GDC 2014.
- AnimSchool, «The Key Poses of a Run Cycle».
