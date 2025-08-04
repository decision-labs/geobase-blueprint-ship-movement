

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
CREATE TABLE Ships(MMSI, Trip, SOG, COG, ShipType) AS 
SELECT MMSI, 
  douglasPeuckerSimplify(tgeompointSeq(array_agg(tgeompoint(ST_Transform(Geom, 3857), T) ORDER BY T)), 3), 
  tfloatSeq(array_agg(tfloat(SOG, T) ORDER BY T) FILTER (WHERE SOG IS NOT NULL)), 
  tfloatSeq(array_agg(tfloat(COG, T) ORDER BY T) FILTER (WHERE COG IS NOT NULL)),
  ShipType
FROM AISInputFiltered 
GROUP BY MMSI, ShipType;

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
          (mvt).geom AS geom, (mvt).times AS times, ShipType FROM (
        SELECT 
          asMVTGeom(f.trip, bounds.geom) AS mvt,
          f.mmsi, f.shiptype
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
create extension if not exists timescaledb with schema extensions cascade;


ALTER TABLE aisinputfiltered
    ADD column h3_10 h3index,
    ADD column h3_11 h3index,
    ADD column h3_12 h3index,
    ADD column h3_13 h3index,
    ADD column h3_9 h3index,
    ADD column h3_8 h3index,
    ADD column h3_7 h3index;

UPDATE aisinputfiltered
SET
    h3_10 = h3_lat_lng_to_cell(geom, 10),
    h3_11 = h3_lat_lng_to_cell(geom, 11),
    h3_12 = h3_lat_lng_to_cell(geom, 12),
    h3_13 = h3_lat_lng_to_cell(geom, 13),
    h3_9 = h3_lat_lng_to_cell(geom, 9),
    h3_8 = h3_lat_lng_to_cell(geom, 8),
    h3_7 = h3_lat_lng_to_cell(geom, 7);

create index on aisinputfiltered(h3_10);
create index on aisinputfiltered(h3_11);
create index on aisinputfiltered(h3_12);
create index on aisinputfiltered(h3_13);
create index on aisinputfiltered(h3_9);
create index on aisinputfiltered(h3_8);
create index on aisinputfiltered(h3_7);

-- activity_by_region_and_time_local function
CREATE OR REPLACE FUNCTION public.activity_by_region_and_time_local(geojson text, interval_val text, resolution_val integer)
 RETURNS TABLE(time_int timestamp with time zone, hexid text, count bigint)
 SECURITY DEFINER
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY EXECUTE format('
    WITH cells AS (
        SELECT h3_polygon_to_cells(ST_GeomFromGeoJSON(%L), %s) AS hexid
    )
    SELECT 
      time_bucket(INTERVAL %L, t AT TIME ZONE ''UTC'') AS time_int,
      h3_%s::text AS hexid,
      count(*) AS count 
    FROM aisinputfiltered
    WHERE h3_%s IN (SELECT hexid FROM cells)
    GROUP BY h3_%s, time_int
    HAVING count(*) > 5
    ', geojson, resolution_val::text, interval_val, resolution_val::text, resolution_val::text, resolution_val::text
  );
END;
$function$
LANGUAGE plpgsql;

DROP TABLE IF EXISTS AISInput;


    