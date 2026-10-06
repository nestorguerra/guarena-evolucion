# El tiempo de Guareña, en directo

Estado: hecho en la versión Evolución y publicado (6 de octubre de 2026). Lo pidió el usuario: «quiero que
Guareña Evolución adapte su meteorología al tiempo actual de Guareña, Badajoz, mediante una API pública. Si ahora
llueve allí, debe llover en el juego…».

## La fuente: Open-Meteo

- **Por qué esta**:
  - [API de previsión con condiciones actuales](https://open-meteo.com/en/docs), gratis y sin clave para uso no
    comercial ([condiciones](https://open-meteo.com/en/terms)): 600 consultas por minuto, 5.000 por hora, menos de
    10.000 al día.
  - Admite peticiones desde cualquier web: responde con `access-control-allow-origin: *`.
  - Licencia [CC BY 4.0](https://open-meteo.com/en/licence): el juego dice «Open-Meteo» junto al dato y lo enlaza en
    Ajustes y en el README.
- **Descartadas**:
  - [AEMET OpenData](https://opendata.aemet.es/centrodedescargas/inicio) es la oficial, pero exige una clave, que
    quedaría a la vista en el navegador.
  - OpenWeatherMap también pide clave.
- **Dónde**:
  - Las coordenadas del propio mapa: 38,8596, −6,1025.
  - El [buscador de Open-Meteo](https://geocoding-api.open-meteo.com/v1/search?name=Guare%C3%B1a&count=10&language=es&format=json)
    sitúa Guareña de Badajoz en 38,8595, −6,0999. Hay otra Guareña en Ávila: por eso se consulta por coordenadas y no
    por nombre.
  - La API contesta con su celda más cercana: 38,845, −6,103, a 284 m de altitud.
- **Qué dato**:
  - Solo `current`: el cuarto de hora más reciente (`interval` 900 s), con su hora en horario de Guareña
    (`timezone=Europe/Madrid`).
  - Variables: código meteorológico de la OMM, nubosidad, precipitación, nieve, visibilidad y viento (velocidad,
    dirección y rachas).
  - Es la estimación de un modelo meteorológico para esa celda, no la lectura de una estación. Por eso el juego enseña
    la hora del dato y no promete más.

## Cuándo pregunta

- Al cargar la partida.
- Después, cada 10 minutos: el dato va por cuartos de hora, así que uno nuevo se ve como mucho 10 minutos después de
  salir.
  - Visto en la prueba: a las 19:55 el último dato era el de las 19:45; a las 21:11, el de las 21:00.
- Si falla (red, error HTTP, respuesta vacía o 12 s sin contestar), reintenta al cabo de 1, 2, 5 y luego cada 10
  minutos.
- La página publicada en claude.ai no pregunta: su política de seguridad bloquea cualquier otra web. Allí se queda el
  tiempo del juego y se dice.

## Del código al pueblo

| Códigos OMM | Lo que se ve |
|---|---|
| 0, 1 | Despejado o poco nuboso: casi sin nubes (Plastilina: sin algodones o pocos) |
| 2 | Parcialmente nuboso: nubes sueltas (Plastilina: los algodones de siempre) |
| 3 | Cubierto: un techo gris que tapa el sol, luz plana sin sombras marcadas |
| 45, 48 | Niebla: la distancia de visión según la visibilidad, desde tus pies, y no se ve el cielo |
| 51–57 | Llovizna: cielo cubierto y lluvia fina |
| 61–67, 80–82 | Lluvia o chubascos: débiles, moderados o fuertes según el código y los mm del cuarto de hora |
| 71–77, 85, 86 | Nieve: copos lentos que van y vienen con el aire (rarísima en Guareña) |
| 95–99 | Tormenta: lluvia fuerte, relámpagos (de uno a tres golpes) y truenos que llegan después del destello, según la distancia |

- **Afinado con el resto del dato**:
  - El porcentaje de nubes ajusta cuánto cielo tapan.
  - La visibilidad, la niebla y la bruma.
  - El viento inclina la lluvia hacia donde sopla.
  - La lluvia baja la distancia de visión, calla a los grillos, las chicharras y los pájaros, y suena (más apagada
    desde dentro de las casas).
- **Transiciones**: todo cambia poco a poco, en algo más de un minuto, en tiempo real. La lluvia empieza y para algo
  antes que el cielo.
- **Nada más**: el reloj del juego, el día y la noche y las rutinas de los vecinos siguen como estaban. El dato «es
  de día» de la API se ignora.
- **Modo Zombis**: guarda su propio anochecer.

### Las dos estéticas

- **Plastilina**:
  - El fondo pintado del decorado se vuelve gris de día lluvioso (un gris de pintor, algo lila).
  - Los algodones se cuelgan o se descuelgan según la nubosidad, y se agrisan.
  - Con el cielo cubierto o lluvioso, además, el fondo se llena de nubes de algodón por encima de la cabeza, grises y
    más oscuras que el cielo cuando llueve: nunca llueve de un cielo vacío.
  - Las luces del estudio bajan un poco y la gradación pierde algo de color.
  - Las gotas son de cristal, más gruesas, y posan 12 veces por segundo, como todo el stop motion.
- **Realista**:
  - Sobre el cielo físico, un techo de nubes con forma: masas y rollos de vientre oscuro y claros más pálidos entre
    ellos, más pesado y oscuro cuanto más llueve. De noche, con el resplandor del pueblo.
  - Las nubes sueltas ocupan más cielo cuanto mayor es la nubosidad.
  - Las gotas son finas y alargadas por su velocidad.

La lluvia es un único dibujo instanciado: gotas que mueve la tarjeta gráfica en una caja de 40 × 24 × 40 m alrededor
de la cámara. Como mucho son 9.000 gotas en calidad Alta, 6.000 en Media y 3.500 en Baja. Dentro de las casas no
llueve.

## Lo que se ve bajo el reloj

| Estado | Ejemplo |
|---|---|
| Al día | «🌧️ Chubascos débiles · Guareña 21:00 · Open-Meteo» |
| Dato de hace más de 45 min, o guardado de otra partida | «… · Guareña 20:21 · sin actualizar · Open-Meteo» (más tenue) |
| La última consulta falló | «… · sin conexión · Open-Meteo»: se queda el último estado válido |
| Nunca hubo dato | «Sin datos del tiempo · sin conexión · tiempo del juego» |
| Página de claude.ai | «Tiempo en directo no disponible aquí» |
| Ajustes › Del juego | nada: el tiempo de siempre |

El último dato se guarda con su hora. Si al arrancar no hay red y tiene menos de 3 horas, se usa como «sin
actualizar».

## Comprobado

- **Consulta real** desde el navegador del juego (`localhost:8918`). Respuesta en 1,6 s, con el bloque de las 19:45:
  tormenta (95), cubierto al 100 % y 0,4 mm.
  - Más tarde, «Chubascos débiles» (80) de las 21:00: en el juego, cielo cubierto, lluvia de 4.130 gotas y la línea
    bajo el reloj.
- **Traducción** de los 28 códigos (`W.codes()`).
- **Capturas** de cada cielo en las dos estéticas, de día (12:30) y de noche (22:30), con `W.shots()`: despejado,
  parcial, cubierto, llovizna, lluvia, chubascos, niebla, tormenta (con relámpago) y nieve.
- **Fallo de red**: se mantiene el estado y se marca «sin conexión»; sin datos nunca, vuelve al tiempo del juego; al
  volver la red, «en directo».
  - Calendario: tras un acierto, 10 min; tras fallos, 1, 2, 5, 10 y 10 min; al volver, 10 min.
- **Transición** de despejado a lluvia, en tiempo real:
  - a los 20 s, cubierto 0,67 y lluvia 0,57;
  - a los 45 s, 0,92 y 0,68;
  - a los 90 s, 0,99 y 0,70.
  - Al revés, a los 45 s quedan nubes 0,12 y lluvia 0,02.
- **Rendimiento** dibujando, calidad Alta:

  | Estética (lienzo) | Despejado | Lluvia fuerte | Tormenta |
  |---|---|---|---|
  | Plastilina (1996 × 1497) | 13,9 ms | 14,3 ms | 14,0 ms |
  | Realista (1536 × 1152) | 8,6 ms | 10,2 ms | 11,5 ms |

- **Consola**: sin errores en las dos estéticas, en el código fuente y en el archivo empaquetado.

## Límites

- Es el tiempo estimado por un modelo para una celda de unos pocos kilómetros, por cuartos de hora: un chubasco corto o
  local puede no salir, o salir con algo de retraso.
- Entre consulta y consulta (10 min) y mientras dura la transición (alrededor de un minuto), el juego puede ir algo
  por detrás del cielo de verdad.
- En claude.ai no hay tiempo en directo (la página no puede consultar otras webs).
- No hay charcos, calles mojadas ni granizo visible: la tormenta con granizo se ve como lluvia fuerte con relámpagos.
- Herramienta: `tools/weatherlab.js` (`status`, `codes`, `force`, `shots`, `offline`, `fade`, `perf`).
