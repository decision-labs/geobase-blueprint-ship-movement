export const { VITE_GEOBASE_URL, VITE_GEOBASE_ANON_KEY } = import.meta.env;
/** pg_tileserv passes query params into ships_fn(z,x,y,n). `n` caps ship tracks per tile (LIMIT n). */
export const TIME_VECTOR_TILES_URL = `${VITE_GEOBASE_URL}/tileserver/v1/public.ships_fn/{z}/{x}/{y}.pbf?n=1000&apikey=${VITE_GEOBASE_ANON_KEY}`;

export const MAP_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=6pXwhZLsjUohW1KXh2ZZ';

// Set the times in STATIC_TIME_RANGE to override the data time range
// e.g 
// export const STATIC_TIME_RANGE = {
// 	start_time: "2021-01-08 00:00:00+00",
// 	end_time:   "2021-01-08 03:30:00+00"
// };
export const STATIC_TIME_RANGE = {
	start_time: null,
	end_time:   null
};

/** Default for long datasets; use activityIntervalForLoop() when the timeline is shorter. */
export const interval_val = "24 hours";

/** Pick an RPC/animation bin size that yields multiple bins across the timeline. */
export function activityIntervalForLoop(loopLengthSec: number): string {
	if (loopLengthSec <= 6 * 3600) return "5 min";
	if (loopLengthSec <= 48 * 3600) return "1 hour";
	return interval_val;
}

export function intervalToSeconds(intervalVal: string): number {
	const [valuePart, unit] = intervalVal.split(" ");
	const value = parseInt(valuePart, 10);
	switch (unit) {
		case "hour":
		case "hours":
			return value * 3600;
		case "min":
		case "mins":
			return value * 60;
		default:
			throw new Error(`Unsupported interval unit: ${unit}`);
	}
}

/** Bin index for animation offset (same clock as TripsLayer currentTime). */
export function animationTimeBinIndex(
	timeOffsetSec: number,
	loopLengthSec: number,
	intervalVal: string = interval_val,
): number {
	if (loopLengthSec <= 0) return 0;
	const intervalSec = intervalToSeconds(intervalVal);
	const totalBins = Math.max(1, Math.ceil(loopLengthSec / intervalSec));
	return Math.floor(timeOffsetSec / intervalSec) % totalBins;
}

export type HexActivityRow = { hexid: string; count: number; time_int?: string };

/** Map RPC time_int buckets to animation bin indices. */
export function buildHexBinsByIndex(
	groupedData: Record<string, HexActivityRow[]>,
	minTimestampSec: number,
	intervalVal: string = interval_val,
): Record<number, HexActivityRow[]> {
	const intervalSec = intervalToSeconds(intervalVal);
	const bins: Record<number, HexActivityRow[]> = {};
	for (const [timeInt, rows] of Object.entries(groupedData)) {
		const offsetSec =
			Math.floor(new Date(timeInt).getTime() / 1000) - minTimestampSec;
		const binIdx = Math.floor(offsetSec / intervalSec);
		if (binIdx >= 0) bins[binIdx] = rows;
	}
	return bins;
}

/** Sum activity per hex across all time bins (static overview). */
export function aggregateHexBins(
	bins: Record<number, HexActivityRow[]>,
): HexActivityRow[] {
	const byHex = new Map<string, HexActivityRow>();
	for (const rows of Object.values(bins)) {
		for (const row of rows) {
			const existing = byHex.get(row.hexid);
			if (existing) {
				existing.count += row.count;
			} else {
				byHex.set(row.hexid, { ...row });
			}
		}
	}
	return Array.from(byHex.values());
}

/** H3 resolutions indexed in geobase/geobase-ship-movement.sql */
export const MIN_H3_RESOLUTION = 7;
export const MAX_H3_RESOLUTION = 10;

/** Keep under server cap (activity_by_region_and_time_local). */
export const MAX_HEX_CELLS = 3000;

/** Mean H3 hex area in m² (https://h3geo.org/docs/core-library/restable). */
const H3_HEX_AREA_M2: Record<number, number> = {
	7: 5.161_293_360_872_45e6,
	8: 0.737_327_598_611_764_3e6,
	9: 0.105_332_513_335_094_39e6,
	10: 0.015_047_502_596_370_534e6,
};

/** Avg hex diameter in km — used for conservative bbox grid estimates. */
const H3_HEX_DIAM_KM: Record<number, number> = {
	7: 2.44,
	8: 0.92,
	9: 0.35,
	10: 0.13,
};

export function polygonBboxSpan(coords: [number, number][]) {
	let minLng = Infinity;
	let maxLng = -Infinity;
	let minLat = Infinity;
	let maxLat = -Infinity;
	for (const [lng, lat] of coords) {
		minLng = Math.min(minLng, lng);
		maxLng = Math.max(maxLng, lng);
		minLat = Math.min(minLat, lat);
		maxLat = Math.max(maxLat, lat);
	}
	return {
		lngSpan: maxLng - minLng,
		latSpan: maxLat - minLat,
		span: Math.max(maxLng - minLng, maxLat - minLat),
	};
}

/**
 * H3 resolution from map zoom (finer when zoomed in).
 * Approx hex edge: res 7 ~1.2 km · 8 ~460 m · 9 ~174 m · 10 ~66 m
 *
 * | Zoom | Res |
 * |------|-----|
 * | ≤7   |  7  |
 * | 8–9  |  8  |
 * | 10–11|  9  |
 * | ≥12  | 10  |
 */
export function resolutionForZoom(zoom: number): number {
	const res = Math.round(zoom * 0.5 + 3.5);
	return Math.min(MAX_H3_RESOLUTION, Math.max(MIN_H3_RESOLUTION, res));
}

/** Coarsen only for large drawn loops (paired with zoom-based res). */
export function resolutionForPolygonSpan(coords: [number, number][]): number {
	const { span } = polygonBboxSpan(coords);
	if (span > 1.5) return 7;
	if (span > 0.8) return 7;
	if (span > 0.35) return 8;
	if (span > 0.12) return 9;
	return 10;
}

function midLatitude(coords: [number, number][]): number {
	return coords.reduce((sum, [, lat]) => sum + lat, 0) / coords.length;
}

/** Conservative grid estimate from bbox (matches large freehand loops). */
export function estimateHexCellsFromBbox(
	coords: [number, number][],
	resolution: number,
): number {
	const { lngSpan, latSpan } = polygonBboxSpan(coords);
	const lat = midLatitude(coords);
	const kmPerDegLat = 111.32;
	const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
	const hexKm = H3_HEX_DIAM_KM[resolution] ?? H3_HEX_DIAM_KM[7];
	const cols = Math.ceil((lngSpan * kmPerDegLng) / hexKm);
	const rows = Math.ceil((latSpan * kmPerDegLat) / hexKm);
	return cols * rows;
}

/** Max of bbox grid and area-based estimates — avoids under-counting loops. */
export function estimateHexCellCount(
	coords: [number, number][],
	resolution: number,
	areaM2: number,
): number {
	const fromBbox = estimateHexCellsFromBbox(coords, resolution);
	const hexArea = H3_HEX_AREA_M2[resolution];
	const fromArea = hexArea
		? Math.ceil((areaM2 / hexArea) * 1.5)
		: 0;
	return Math.max(fromBbox, fromArea);
}

/** Pick resolution from zoom + polygon size; step down until under cell budget. */
export function resolutionForQuery(
	zoom: number,
	coords: [number, number][],
	areaM2: number,
): number {
	let res = Math.min(resolutionForZoom(zoom), resolutionForPolygonSpan(coords));
	while (
		res > MIN_H3_RESOLUTION &&
		estimateHexCellCount(coords, res, areaM2) > MAX_HEX_CELLS
	) {
		res--;
	}
	return res;
}

export const defaultAnimationSpeed = 10;
export const defaultTrailLength = 1000;

export const transitionProps = {
	transitionDuration: 1500,
	transitionEasing: (x: number) => {
		return -(Math.cos(Math.PI * x) - 1) / 2;
	},
};

export type MapArea = {
	latitude: number;
	longitude: number;
	zoom: number;
	name: MapAreaName;
	portsAndThings: {
		name: string;
		type: string;
		latitude: number;
		longitude: number;
	}[];
};

export type MapAreaName = "kiel-canal" | "gothenburg" | "oresund-bridge" | "big-picture";

export const map_areas = [
	{
		name: "kiel-canal",
		latitude: 54.36,
		longitude: 10.14,
		zoom: 14,
		pitch: 65,
		bearing: 305,
		portsAndThings: [],
	},
	{
		name: "gothenburg",
		// 11.89784, 57.6861
		latitude: 57.68952,
		longitude: 11.89784,
		zoom: 14,
		pitch: 0,
		bearing: 10,
		portsAndThings: [],
	},
	{
		name: "oresund-bridge",
		// 12.709792274982476, 55.58522588826057
		latitude: 55.58522588826057,
		longitude: 12.709792274982476,
		zoom: 12.3,
		pitch: 45,
		bearing: 45,
		portsAndThings: [],
	},
	{
		name: "big-picture",
		// denmark
		latitude: 54.8,
		longitude: 11.6,
		zoom: 6.3,
		pitch: 45,
		bearing: 0,
		portsAndThings: [],
	}
];

export const ports_and_things = [
	{
		name: "",
		type: "port",
		area: "kiel-canal",
		coordinates: [10.142784858026934, 54.36536292616125],
	},
	{
		name: "",
		type: "siding",
		area: "kiel-canal",
		coordinates: [9.96805166608117, 54.34257026618389],
	},
	{
		name: "",
		type: "chokepoint",
		area: "kiel-canal",
		coordinates: [9.143597043533795, 53.890889415129394],
	},
	{
		name: "",
		type: "chokepoint",
		area: "kiel-canal",
		coordinates: [10.150910099075718, 54.36620986714592],
	},
	{
		name: "",
		type: "anchorage",
		area: "kiel-canal",
		coordinates: [9.14882419988216, 53.898910839579436],
	},
	{
		name: "",
		type: "anchorage",
		area: "kiel-canal",
		coordinates: [9.168794250443037, 53.9093229116306],
	},
	{
		name: "",
		type: "port",
		area: "gothenburg",
		coordinates: [11.657620083882591, 57.708400305959266],
	},
	{
		name: "",
		type: "port",
		area: "gothenburg",
		coordinates: [11.791683209004113, 57.569842104505994],
	},
	{
		name: "",
		type: "port",
		area: "gothenburg",
		coordinates: [11.784074741832148, 57.6483012834392],
	},
	{
		name: "",
		type: "port",
		area: "gothenburg",
		coordinates: [11.952729097479901, 57.7133852995767],
	},
	{
		name: "",
		type: "chokepoint",
		area: "gothenburg",
		coordinates: [11.905974916672836, 57.69255637816086],
	},
	{
		name: "",
		type: "anchorage",
		area: "gothenburg",
		coordinates: [11.871881349477192, 57.689938904374195],
	},
];
