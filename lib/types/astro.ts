export interface CityResult {
  name: string;
  country_code: string;
  lat: number;
  lng: number;
  timezone: string;
  population?: number;
}

export interface GeoSearchResponse {
  results: CityResult[];
  count: number;
}

export interface NatalRequestPayload {
  name?: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  city: string;
  lat: number;
  lng: number;
  tz_str: string;
  house_system: "placidus";
  zodiac_type: "tropical";
  interpretation: {
    enable: true;
    style: "improved";
    language?: "en";
  };
  include_features: Array<"asc" | "mc" | "chiron" | "lilith" | "true_node" | "mean_node">;
  include_speed: true;
  include_dominants: true;
}

export interface NatalSubject {
  name?: string;
  datetime: string;
  location: {
    city: string;
    lat: number;
    lng: number;
    timezone: string;
  };
  settings: {
    house_system: string;
    zodiac_type: string;
    julian_day?: number;
    julian_day_tt?: number;
    delta_t_days?: number;
    delta_t_seconds?: number;
  };
}

export interface NatalPlanet {
  id: string;
  name: string;
  sign: string;
  sign_id?: string;
  pos: number;
  abs_pos: number;
  house: number;
  retrograde: boolean;
  speed?: number;
  is_stationary?: boolean;
  variant?: string;
}

export interface NatalHouse {
  house: number;
  name: string;
  sign: string;
  sign_id: string;
  pos: number;
  abs_pos: number;
}

export interface AngleDetail {
  sign: string;
  sign_id: string;
  pos: number;
  abs_pos: number;
  house: number;
}

export interface NatalAspect {
  p1: string;
  p2: string;
  type: string;
  orb: number;
  deg: number;
  is_major: boolean;
}

export interface NatalAspectsSummary {
  total: number;
  major: number;
  minor: number;
  by_type: Record<string, number>;
}

export interface NatalChartResponse {
  subject: NatalSubject;
  planets: NatalPlanet[];
  houses: NatalHouse[];
  angles: {
    asc: number;
    mc: number;
    ic: number;
    dc: number;
    vertex?: number;
  };
  angles_details: {
    asc?: AngleDetail;
    mc?: AngleDetail;
    ic?: AngleDetail;
    dc?: AngleDetail;
    vertex?: AngleDetail;
    [key: string]: AngleDetail | undefined;
  };
  aspects: NatalAspect[];
  aspects_summary: NatalAspectsSummary;
  interpretation?: unknown;
  dominants?: unknown;
}
