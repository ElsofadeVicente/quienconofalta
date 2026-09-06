/* =============================================
   ROTACION.JS — sorteo diario CON MEMORIA
   FutbolHUB

   El Crucigrama era el único juego que no repetía contenido: su
   generador lleva un descanso mínimo entre apariciones
   (DIAS_SIN_REPETIR en admin/generar_crucigrama.py). El Estadio y
   Superdraft sorteaban cada día desde cero, con el resultado esperable
   de cualquier muestreo con reemplazo — medido antes de escribir esto:

     · El Estadio: 450 sorteos en 90 días daban solo 333 estadios
       distintos de 693 (26 % repeticiones), seis de ellos en días
       CONSECUTIVOS, y más de la mitad del catálogo no salía nunca.
     · Superdraft: «El once más bajo» salió 7 de 30 días mientras
       «Más internacionalidades» salió 1, y 3 días repetían el objetivo
       del día anterior.

   Aquí la memoria no es un descanso de N días: es una BARAJA COMPLETA.
   Se baraja el catálogo entero una vez por ciclo y se van repartiendo
   `porDia` elementos por jornada, así que NADA se repite hasta que ha
   salido todo lo demás, y cada ciclo se baraja distinto. Para El
   Estadio (693 estadios, 4 al día) eso son 173 días sin una sola
   repetición; para Superdraft (10 objetivos, 1 al día), los diez en
   diez días, siempre.

   Sigue siendo DETERMINISTA y sin estado: el día D no necesita saber
   qué pasó el D−1, se calcula solo con su número de día. Eso importa
   porque los dos juegos generan en el cliente y todo el mundo tiene que
   ver lo mismo sin preguntarle nada a ningún servidor.

   API (window.FHRotacion):
     tanda(total, porDia, dia, semillaBase) → [índices]
       total        tamaño del catálogo
       porDia       cuántos elementos toca repartir cada día
       dia          número de día (entero ≥ 0, del epoch que use el juego)
       semillaBase  entero: separa las barajas de dos juegos distintos
   ============================================= */
(function () {
  'use strict';

  /* Mismo PRNG que usa el resto del proyecto (js/futbol-restrictions.js,
     superdraft, blackjack). Se copia aquí a propósito para que este
     archivo no dependa de nada: El Estadio no carga FR. */
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function barajaDeCiclo(total, ciclo, semillaBase) {
    /* El ciclo entra en la semilla multiplicado por un primo grande: con
       `semillaBase + ciclo` a secas, dos ciclos seguidos arrancan el PRNG
       en estados casi idénticos y las primeras extracciones se parecen. */
    const rng = mulberry32(((semillaBase >>> 0) ^ Math.imul(ciclo + 1, 0x9E3779B1)) >>> 0);
    const a = new Array(total);
    for (let i = 0; i < total; i++) a[i] = i;
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function tanda(total, porDia, dia, semillaBase) {
    total  = Math.max(0, Math.floor(total));
    porDia = Math.max(1, Math.floor(porDia));
    dia    = Math.max(0, Math.floor(dia));
    semillaBase = (semillaBase || 0) >>> 0;

    if (total === 0) return [];
    /* Catálogo más pequeño que una jornada: no hay baraja que valga, se
       devuelve lo que hay barajado por día. */
    if (total <= porDia) return barajaDeCiclo(total, dia, semillaBase);

    /* Días que caben en una baraja. El resto (hasta porDia−1 elementos)
       se queda sin repartir en ese ciclo — es el precio de que ningún día
       tenga que partirse entre dos barajas, y como cada ciclo se baraja
       distinto, los que se quedan fuera cambian cada vez. */
    const porCiclo = Math.floor(total / porDia);
    const ciclo = Math.floor(dia / porCiclo);
    const pos   = dia % porCiclo;

    const deck = barajaDeCiclo(total, ciclo, semillaBase);
    const ini  = pos * porDia;

    /* Única costura de todo esto: el último día de un ciclo y el primero
       del siguiente salen de barajas distintas, así que ahí SÍ podría
       repetirse algo en días consecutivos — que es justo el caso más
       visible y el que se quería matar. Cuando pasa, el elemento repetido
       se cambia por uno del centro de la baraja, lejos de las dos
       costuras. Determinista: cualquiera que calcule este día llega a lo
       mismo. */
    if (pos === 0 && ciclo > 0) {
      const anterior = barajaDeCiclo(total, ciclo - 1, semillaBase);
      const cola = new Set(anterior.slice((porCiclo - 1) * porDia, porCiclo * porDia));
      const centro = Math.floor(porCiclo / 2) * porDia;
      for (let k = 0; k < porDia; k++) {
        if (!cola.has(deck[ini + k])) continue;
        for (let d = 0; d < porCiclo * porDia; d++) {
          const c = centro + d;
          if (c >= total || c < porDia) continue;
          if (cola.has(deck[c])) continue;
          const t = deck[ini + k]; deck[ini + k] = deck[c]; deck[c] = t;
          break;
        }
      }
    }

    return deck.slice(ini, ini + porDia);
  }

  /* Número de día a partir de una fecha ISO ("AAAA-MM-DD") y un epoch
     igual. Se hace en UTC para que no dependa del huso del dispositivo:
     la fecha ya viene resuelta en hora de Madrid por quien llama. */
  function diaDesde(fechaISO, epochISO) {
    const a = Date.parse(fechaISO + 'T00:00:00Z');
    const b = Date.parse(epochISO + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((a - b) / 86400000));
  }

  window.FHRotacion = { tanda, diaDesde, mulberry32 };
})();
