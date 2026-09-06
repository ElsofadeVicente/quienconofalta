-- ═══════════════════════════════════════════════════════════════════
-- LIGA · aceptar un número de rondas VARIABLE (2026-09-06)
--
-- POR QUÉ
--   El Estadio pasa de 5 rondas al día a 4. La RPC liga_enviar_diario
--   recalcula la puntuación en el servidor (setup_liga_recompute.sql) y
--   tenía el 5 escrito a fuego en dos sitios:
--
--       if v_n <> 5 then raise exception ...
--       if v_puntos > 25000 then raise exception ...
--
--   O sea que con el JS nuevo desplegado, TODOS los envíos a la liga
--   fallarían con «La partida debe tener 5 rondas (llegaron 4)». Y
--   fallarían en silencio para quien juega: submitLigaDaily() captura la
--   excepción y solo hace console.warn — la partida se guarda en local,
--   la racha del hub sigue, y la liga simplemente deja de sumar. Es
--   exactamente el tipo de fallo que no se ve hasta que alguien mira la
--   clasificación al cabo de una semana.
--
-- QUÉ HACE
--   Acepta entre MIN_RONDAS y MAX_RONDAS pistas y calcula el techo de
--   puntuación a partir de cuántas llegaron (5.000 por ronda), en vez de
--   compararlo con un 25000 fijo.
--
-- ORDEN DE DESPLIEGUE — IMPORTA
--   1º ESTE SQL.   2º el JS.
--   Al aceptar 4 Y 5, durante la transición conviven sin romperse los
--   navegadores que todavía sirven el JS viejo (mandan 5) y los que ya
--   tienen el nuevo (mandan 4). Al revés —JS primero— habría una ventana
--   en la que nadie puntúa.
--
--   Se ejecuta en Supabase → SQL Editor. Es idempotente: `create or
--   replace` sobre la MISMA firma (jsonb, text), así que no crea una
--   variante nueva ni deja la vieja viva (eso ya se cerró en la Fase 2
--   de setup_liga_recompute.sql).
-- ═══════════════════════════════════════════════════════════════════

create or replace function liga_enviar_diario(
  p_pistas jsonb,
  p_juego  text default 'el-estadio')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Rango de rondas aceptado. El juego manda 4 desde el 2026-09-06; se
  -- siguen aceptando 5 para los navegadores que todavia sirvan el JS
  -- anterior, asi que este SQL se puede aplicar ANTES de desplegar el JS
  -- sin dejar a nadie sin puntuar durante la transicion.
  MIN_RONDAS constant int := 4;
  MAX_RONDAS constant int := 5;
  PTS_RONDA  constant int := 5000;

  v_user     uuid := auth.uid();
  v_dia      date := (now() at time zone 'Europe/Madrid')::date;
  v_semana   date := liga_semana_de(now());
  v_tramo    smallint;
  v_division bigint;
  v_total    int;
  v_puntos   int := 0;
  v_n        int;
  pista      jsonb;
  v_id       text;
  v_glat     double precision;
  v_glng     double precision;
  v_elat     double precision;
  v_elng     double precision;
  v_ids      text[] := '{}';
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if p_juego is null then p_juego := 'el-estadio'; end if;

  -- ── Validar y RECALCULAR desde las pistas ──
  if p_pistas is null or jsonb_typeof(p_pistas) <> 'array' then
    raise exception 'Falta el detalle de la partida. Actualiza la página e inténtalo de nuevo.';
  end if;
  v_n := jsonb_array_length(p_pistas);
  if v_n < MIN_RONDAS or v_n > MAX_RONDAS then
    raise exception 'La partida debe tener entre % y % rondas (llegaron %).',
      MIN_RONDAS, MAX_RONDAS, v_n;
  end if;

  for pista in select * from jsonb_array_elements(p_pistas)
  loop
    v_id   := pista->>'id';
    v_glat := (pista->>'lat')::double precision;
    v_glng := (pista->>'lng')::double precision;
    if v_id is null or v_glat is null or v_glng is null then
      raise exception 'Pista incompleta.';
    end if;
    if v_glat < -90 or v_glat > 90 or v_glng < -180 or v_glng > 180 then
      raise exception 'Coordenada del pin fuera de rango.';
    end if;

    -- Un estadio no puede contar dos veces en la misma partida. El juego
    -- reparte sin reposicion, asi que un id repetido solo puede venir de la
    -- consola: mandar cuatro veces un estadio cuya coordenada ya conoces era
    -- la forma barata de sacar el maximo. No estaba comprobado.
    if v_id = any(v_ids) then
      raise exception 'Estadio repetido en la misma partida: %', v_id;
    end if;
    v_ids := array_append(v_ids, v_id);

    select lat, lng into v_elat, v_elng from el_estadio_coords where id = v_id;
    if v_elat is null then
      raise exception 'Estadio desconocido: %', v_id;
    end if;

    v_puntos := v_puntos + el_estadio_puntos(v_glat, v_glng, v_elat, v_elng);
  end loop;

  -- Red de seguridad: el techo sale de cuantas rondas llegaron, no de un
  -- 25000 escrito a mano.
  if v_puntos < 0 or v_puntos > v_n * PTS_RONDA then
    raise exception 'Puntuación recalculada fuera de rango: %', v_puntos;
  end if;

  -- 1) Guardar el diario. El primer envío del día manda; los reenvíos se
  --    ignoran (no se puede regrabar una puntuación mejor a mano).
  insert into liga_diarios (user_id, juego, dia, puntos)
  values (v_user, p_juego, v_dia, v_puntos)
  on conflict (user_id, juego, dia) do nothing;

  -- 2) Tramo persistente (usuario nuevo => Tercera División).
  insert into liga_estado (user_id, juego, tramo)
  values (v_user, p_juego, 0)
  on conflict (user_id, juego) do nothing;
  select tramo into v_tramo from liga_estado
  where user_id = v_user and juego = p_juego;

  -- 3) Asegurar pertenencia a una división de esta semana en su tramo.
  select division_id into v_division
  from liga_miembros
  where juego = p_juego and semana = v_semana and user_id = v_user;
  if v_division is null then
    v_division := liga_asignar_division(v_user, p_juego, v_tramo, v_semana);
  end if;

  -- 4) Recalcular el marcador de la semana (suma de los diarios lun..dom).
  select coalesce(sum(puntos), 0) into v_total
  from liga_diarios
  where user_id = v_user and juego = p_juego
    and dia >= v_semana and dia < v_semana + 7;

  update liga_miembros set puntos = v_total
  where division_id = v_division and user_id = v_user;

  return jsonb_build_object(
    'tramo', v_tramo, 'division_id', v_division,
    'puntos', v_total, 'dia', v_dia, 'hoy', v_puntos);
end;
$$;

-- ─── PERMISOS (los mismos que ya tenía) ──────────────────────────────
grant execute on function liga_enviar_diario(jsonb, text) to authenticated;

-- Recargar el esquema de PostgREST para que la firma quede expuesta ya.
notify pgrst, 'reload schema';

-- ─── COMPROBACIÓN ────────────────────────────────────────────────────
-- Debe seguir habiendo UNA sola liga_enviar_diario (la de (jsonb, text)):
--   select count(*) from pg_proc where proname = 'liga_enviar_diario';
--
-- El resto del cuerpo es EL MISMO que setup_liga_recompute.sql: sigue
-- buscando la división de la semana, recalculando liga_miembros.puntos con
-- la suma de los diarios lun..dom y devolviendo
-- {tramo, division_id, puntos, dia, hoy}. Solo cambian el rango de rondas,
-- el techo y la comprobación de estadios repetidos.
