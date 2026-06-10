

DROP TABLE IF EXISTS AISInput;
CREATE TABLE AISInput(
  T timestamp,
  TypeOfMobile varchar(100),
  MMSI integer,
  Latitude float,
  Longitude float,
  navigationalStatus varchar(100),
  ROT float,
  SOG float,
  COG float,
  Heading integer,
  IMO varchar(100),
  Callsign varchar(100),
  Name varchar(100),
  ShipType varchar(100),
  CargoType varchar(100),
  Width float,
  Length float,
  TypeOfPositionFixingDevice varchar(100),
  Draught float,
  Destination varchar(100),
  ETA varchar(100),
  DataSourceType varchar(100),
  SizeA float,
  SizeB float,
  SizeC float,
  SizeD float,
  Geom geometry(Point, 4326)
);



COPY AISInput(T, TypeOfMobile, MMSI, Latitude, Longitude, NavigationalStatus,
  ROT, SOG, COG, Heading, IMO, CallSign, Name, ShipType, CargoType, Width, Length,
  TypeOfPositionFixingDevice, Draught, Destination, ETA, DataSourceType,
  SizeA, SizeB, SizeC, SizeD)
FROM '/uploads/sample-data/aisdk-2021-08-01-subset.csv' DELIMITER  ',' CSV HEADER;


-- 4326 == WGS 84
UPDATE AISInput SET
  navigationalstatus = CASE navigationalstatus WHEN 'Unknown value' THEN NULL END,
  imo = CASE IMO WHEN 'Unknown' THEN NULL END,
  shiptype = CASE shiptype WHEN 'Undefined' THEN NULL END,
  typeofpositionfixingdevice = CASE typeofpositionfixingdevice
  WHEN 'Undefined' THEN NULL END,
  Geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);


DROP TABLE IF EXISTS aisinputfiltered;
CREATE TABLE aisinputfiltered AS
SELECT DISTINCT ON(MMSI,T) *
FROM aisinput
WHERE longitude BETWEEN -16.1 and 32.88 AND latitude BETWEEN 40.18 AND 84.17;


alter table public.aisinputfiltered enable row level security;

-- create Trajectories using 3857 == WGS 84 / Pseudo-Mercator
-- Uses douglasPeuckerSimplify with a tolerance of 3m. Other methods are minDistSimplify and maxDistSimplify.  
--- minDistSimplify : Ensures consecutive values are at least a certain distance apart. 
--- maxDistSimplify : Removes points that are less than or equal to the distance 
DROP TABLE IF EXISTS Ships;
CREATE TABLE Ships(MMSI, Trip, SOG, COG) AS 
SELECT MMSI, 
  douglasPeuckerSimplify(tgeompointSeq(array_agg(tgeompoint(ST_Transform(Geom, 3857), T) ORDER BY T)), 3), 
  tfloatSeq(array_agg(tfloat(SOG, T) ORDER BY T) FILTER (WHERE SOG IS NOT NULL)), 
  tfloatSeq(array_agg(tfloat(COG, T) ORDER BY T) FILTER (WHERE COG IS NOT NULL)) 
FROM AISInputFiltered 
GROUP BY MMSI;

alter table public.ships enable row level security;

-- cleanup unrealistic trips
delete from ships
where length(trip) = 0 or length(trip) >= 1500000;


-- DELETE ships where speed diff between SOG (speed on ground in knots) and speed of trip 
-- both converted to km/h is >= 25
DELETE FROM Ships
WHERE abs(twavg(sog) * 1.852 - twavg(speed(trip))* 3.6 )  > 25;

-- some indexes
-- create index on trip
create index Ships_Trip_Idx on ships using gist(trip);

-- 3857 == WGS 84 / Pseudo-Mercator
alter table Ships add column trip_geom geometry(LineString, 3857);
update ships set trip_geom = trajectory(trip);


-- create index on trip_geom
create index on Ships using gist(trip_geom);

CREATE INDEX ON Ships(length(trip));


-- ships_fn function
CREATE OR REPLACE FUNCTION public.ships_fn(z integer, x integer, y integer, n integer DEFAULT 1000)
 RETURNS bytea
 STABLE PARALLEL SAFE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH
    bounds AS (
      SELECT ST_TileEnvelope(z, x, y)::stbox AS geom
    ),
    mvtgeom AS (
        -- ++++++++++++++++++++++++++++++++++++
        SELECT mmsi,
          (mvt).geom AS geom, (mvt).times AS times FROM (
        SELECT 
          asMVTGeom(f.trip, bounds.geom) AS mvt,
          f.mmsi
        FROM public.ships f, bounds 
          WHERE 
          length(trip) > 500 AND -- remove trips less than 500m
          f.trip_geom && bounds.geom::geometry 
          LIMIT n
      ) as foo
        -- +++++++++++++++++++++++++++++++++++++
    )
    SELECT ST_AsMVT(mvtgeom.*) FROM mvtgeom;
$function$
LANGUAGE sql;


-- add h3 indexes and enable extensions

create extension if not exists h3 with schema extensions cascade;
create extension if not exists h3_postgis with schema extensions cascade;
-- PG17 image omits timescaledb; use date_bin (PG14+) instead of time_bucket below


ALTER TABLE aisinputfiltered
    ADD column h3_10 h3index,
    ADD column h3_9 h3index,
    ADD column h3_8 h3index,
    ADD column h3_7 h3index;

UPDATE aisinputfiltered
SET
    h3_10 = h3_latlng_to_cell(geom, 10),
    h3_9 = h3_latlng_to_cell(geom, 9),
    h3_8 = h3_latlng_to_cell(geom, 8),
    h3_7 = h3_latlng_to_cell(geom, 7);

create index on aisinputfiltered(h3_10);
create index on aisinputfiltered(h3_9);
create index on aisinputfiltered(h3_8);
create index on aisinputfiltered(h3_7);

CREATE INDEX IF NOT EXISTS aisinputfiltered_geom_idx
  ON public.aisinputfiltered USING gist (geom);

-- Per-cell index lookups (avoids full-table scan); auto-coarsens when polygon is large.
CREATE OR REPLACE FUNCTION public.activity_by_region_and_time_local(
  geojson text,
  interval_val text,
  resolution_val integer
)
RETURNS TABLE(time_int timestamptz, hexid text, count bigint)
SECURITY DEFINER
SET search_path TO 'extensions', 'public', 'pg_temp'
SET statement_timeout TO '30s'
LANGUAGE plpgsql
AS $function$
DECLARE
  poly geometry;
  cell extensions.h3index;
  cell_count integer;
  h3_col text;
  resolution_actual integer;
  max_cells constant integer := 3000;
BEGIN
  IF resolution_val < 7 OR resolution_val > 10 THEN
    RAISE EXCEPTION 'resolution_val must be between 7 and 10';
  END IF;

  poly := ST_GeomFromGeoJSON(geojson);
  resolution_actual := resolution_val;

  LOOP
    SELECT count(*)::integer INTO cell_count
    FROM h3_polygon_to_cells(poly, resolution_actual);

    IF cell_count <= max_cells THEN
      EXIT;
    END IF;

    resolution_actual := resolution_actual - 1;

    IF resolution_actual < 7 THEN
      RAISE EXCEPTION
        'Draw a smaller area (too many hex cells even at res 7: got %).',
        cell_count;
    END IF;
  END LOOP;

  h3_col := format('h3_%s', resolution_actual);

  CREATE TEMP TABLE IF NOT EXISTS tmp_activity_hits (
    bucket timestamptz NOT NULL,
    hexid text NOT NULL,
    cnt bigint NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE tmp_activity_hits;

  FOR cell IN SELECT h3_polygon_to_cells(poly, resolution_actual)
  LOOP
    EXECUTE format(
      'INSERT INTO tmp_activity_hits (bucket, hexid, cnt)
       SELECT date_bin($1, t AT TIME ZONE ''UTC'', TIMESTAMP ''2000-01-01''),
              $2,
              count(*)::bigint
       FROM public.aisinputfiltered
       WHERE %I = $3
       GROUP BY 1',
      h3_col
    )
    USING interval_val::interval, cell::text, cell;
  END LOOP;

  RETURN QUERY
  SELECT h.bucket, h.hexid, h.cnt
  FROM tmp_activity_hits h
  WHERE h.cnt > 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.activity_by_region_and_time_local(text, text, integer)
  TO anon, authenticated, service_role;

DROP TABLE IF EXISTS AISInput;


-- to get the range of timestamp of data:
CREATE OR REPLACE FUNCTION public.get_ships_time_range()
RETURNS TABLE (
  start_time text,
  end_time text
)
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
LANGUAGE sql
AS $$
  SELECT 
    MIN(startTimestamp(trip))::text AS start_time,
    MAX(endTimestamp(trip))::text AS end_time
  FROM ships;
$$;




