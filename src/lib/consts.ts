export const { VITE_GEOBASE_URL, VITE_GEOBASE_ANON_KEY } = import.meta.env;
export const TIME_VECTOR_TILES_URL = `${VITE_GEOBASE_URL}/tileserver/v1/public.ships_fn/{z}/{x}/{y}.pbf?n=1000&apikey=${VITE_GEOBASE_ANON_KEY}`; // pg_tileserv URL

export const MAP_STYLE = 'https://api.maptiler.com/maps/satellite/style.json?key=6pXwhZLsjUohW1KXh2ZZ';

export const time_range = {
	start_time: "2021-01-08 00:00:00+00",
	end_time: "2021-01-08 03:30:00+00",
};

// Create date objects
export const start_date = new Date(time_range.start_time);
export const end_date = new Date(time_range.end_time);

// Get the Unix timestamp in seconds
export const epoch_start_time = Math.floor(start_date.getTime() / 1000);
export const epoch_end_time = Math.floor(end_date.getTime() / 1000);
export const min_timestamp = epoch_start_time; //2021-01-08 00:00:00+00
export const max_timestamp = epoch_end_time; //2021-01-08 01:08:02+00

export const interval_val = '24 hours'; 

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
