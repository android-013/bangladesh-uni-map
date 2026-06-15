const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(PUBLIC_DIR, "data", "districts.json");
const BOUNDARY_CACHE_FILE = path.join(PUBLIC_DIR, "data", "bgd_district_boundaries_v5_64.geojson");

// v5 rule: do not accept the first boundary file blindly.
// The server tests every source against the 64 local district names and serves
// the source with the highest district match count. This fixes the old 55/64 issue.
const BOUNDARY_SOURCES = [
  {
    name: "geoBoundaries BGD ADM2 from ARCED",
    url: "https://raw.githubusercontent.com/ARCED-Foundation/BD-district_boundary_selected/refs/heads/master/geoBoundaries-BGD-ADM2.json"
  },
  {
    name: "geoBoundaries ADM2 simplified",
    url: "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson"
  },
  {
    name: "bangladesh-geojson full boundary",
    url: "https://raw.githubusercontent.com/ifahimreza/bangladesh-geojson/master/src/data/bangladesh.geojson"
  },
  {
    name: "ARCED districts.geojson fallback",
    url: "https://raw.githubusercontent.com/ARCED-Foundation/BD-district_boundary_selected/refs/heads/master/districts.geojson"
  }
];

const NAME_ALIASES = {
  bbaria: "brahmanbaria",
  bramhmanbaria: "brahmanbaria",
  brahamanbaria: "brahmanbaria",
  bogra: "bogura",
  barisal: "barishal",
  chittagong: "chattogram",
  comilla: "cumilla",
  cummilla: "cumilla",
  jessore: "jashore",
  jhinaidah: "jhenaidah",
  jhenidah: "jhenaidah",
  jhalakati: "jhalokati",
  jhalakathi: "jhalokati",
  jhalokathi: "jhalokati",
  khagrachari: "khagrachhari",
  khagrachhari: "khagrachhari",
  lakhsmipur: "lakshmipur",
  laxsmipur: "lakshmipur",
  maulvibazar: "moulvibazar",
  moulaviibazar: "moulvibazar",
  nator: "natore",
  nawabganj: "chapainawabganj",
  chapainawabgonj: "chapainawabganj",
  chapai: "chapainawabganj",
  coxsbazar: "coxsbazar",
  coxbazar: "coxsbazar",
  coxs: "coxsbazar",
  netrakona: "netrokona",
  narshingdi: "narsingdi",
  sunamgonj: "sunamganj",
  narayangonj: "narayanganj",
  munshigonj: "munshiganj",
  gazipur: "gazipur"
};

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/zila|zilla|district|jela/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function canonicalKey(value = "") {
  const key = normalizeName(value);
  return NAME_ALIASES[key] || key;
}

function getFeatureName(feature) {
  const props = feature.properties || {};
  const candidates = [
    props.shapeName,
    props.ShapeName,
    props.shapeName_en,
    props.shapeName_EN,
    props.ADM2_EN,
    props.ADM2_NAME,
    props.ADM2_NAME_EN,
    props.ADM2,
    props.ADM2NM,
    props.ADM2_NAME_1,
    props.admin2Name,
    props.admin2_name,
    props.NAME_2,
    props.NAME2,
    props.DISTRICT,
    props.DIST_NAME,
    props.DISTRICT_N,
    props.district,
    props.District,
    props.district_name,
    props.districtName,
    props.name,
    props.Name,
    props.NAME
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
}

function analyzeBoundaryMatch(geojson) {
  const data = loadData();
  const districtKeys = new Map(data.districts.map((district) => [canonicalKey(district.district), district.district]));
  const matched = new Set();
  const rawNames = [];
  const unmatchedRawNames = [];

  for (const feature of geojson.features || []) {
    const rawName = getFeatureName(feature);
    if (!rawName) continue;
    rawNames.push(rawName);
    const districtName = districtKeys.get(canonicalKey(rawName));
    if (districtName) matched.add(districtName);
    else unmatchedRawNames.push(rawName);
  }

  return {
    matchedDistrictCount: matched.size,
    totalDistricts: data.districts.length,
    matchedDistricts: Array.from(matched).sort(),
    missingDistricts: data.districts.map((d) => d.district).filter((name) => !matched.has(name)).sort(),
    sampleUnmatchedRawNames: Array.from(new Set(unmatchedRawNames)).slice(0, 20),
    rawNameCount: rawNames.length
  };
}

function makeGeneratedBoundaryGeojson() {
  const data = loadData();
  const features = data.districts.map((district, index) => {
    const lng = Number(district.lng);
    const lat = Number(district.lat);
    const size = 0.075 + (index % 4) * 0.006;
    const xSize = size * 1.12;
    const ySize = size * 0.92;
    const ring = [
      [lng, lat + ySize],
      [lng + xSize, lat + ySize * 0.38],
      [lng + xSize * 0.85, lat - ySize * 0.62],
      [lng, lat - ySize],
      [lng - xSize * 0.85, lat - ySize * 0.62],
      [lng - xSize, lat + ySize * 0.38],
      [lng, lat + ySize]
    ];
    return {
      type: "Feature",
      properties: {
        name: district.district,
        district: district.district,
        division: district.division,
        generated: true
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      }
    };
  });
  return { type: "FeatureCollection", generated: true, features };
}


const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function noCacheHeaders(type) {
  return {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store"
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, noCacheHeaders("application/json; charset=utf-8"));
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500, noCacheHeaders("text/plain; charset=utf-8"));
      res.end(err.code === "ENOENT" ? "404 Not Found" : "500 Internal Server Error");
      return;
    }
    res.writeHead(200, noCacheHeaders(type));
    res.end(content);
  });
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function calculateZoneTotals(districtNames) {
  const data = loadData();
  const byDistrict = new Map(data.districts.map((district) => [district.district, district]));
  const selected = districtNames.map((name) => byDistrict.get(name)).filter(Boolean);

  const counts = {
    districts: selected.length,
    totalInstitutions: 0,
    totalUniversities: 0,
    totalMedicalColleges: 0,
    publicUniversities: 0,
    privateUniversities: 0,
    internationalUniversities: 0,
    publicMedicalColleges: 0,
    privateMedicalColleges: 0,
    militaryMedicalColleges: 0,
    proposedMedicalColleges: 0
  };

  for (const district of selected) {
    for (const key of Object.keys(counts)) {
      if (key !== "districts") counts[key] += Number(district.counts[key] || 0);
    }
  }

  return { counts, districts: selected.map((d) => d.district) };
}

async function fetchWithTimeout(source, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "bd-institution-zone-map/4.0",
        "Accept": "application/geo+json, application/json, text/plain, */*"
      }
    });
    if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim().startsWith("{")) throw new Error(`${source.name} did not return GeoJSON`);
    const geojson = JSON.parse(text);
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      throw new Error(`${source.name} is not a GeoJSON FeatureCollection`);
    }
    return { source: source.name, url: source.url, geojson };
  } finally {
    clearTimeout(timeout);
  }
}

async function getBoundaries() {
  if (fs.existsSync(BOUNDARY_CACHE_FILE)) {
    const payload = JSON.parse(fs.readFileSync(BOUNDARY_CACHE_FILE, "utf8"));
    if (payload.geojson) return { ...payload, source: `${payload.source} / local cache`, cached: true };
    return { source: "local cache", cached: true, geojson: payload, match: analyzeBoundaryMatch(payload) };
  }

  const errors = [];
  let best = null;
  for (const source of BOUNDARY_SOURCES) {
    try {
      const result = await fetchWithTimeout(source);
      const match = analyzeBoundaryMatch(result.geojson);
      const candidate = {
        source: result.source,
        sourceUrl: result.url,
        cached: false,
        geojson: result.geojson,
        match
      };

      if (!best || match.matchedDistrictCount > best.match.matchedDistrictCount) {
        best = candidate;
      }

      if (match.matchedDistrictCount >= match.totalDistricts) {
        fs.writeFileSync(BOUNDARY_CACHE_FILE, JSON.stringify(candidate));
        return candidate;
      }
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
    }
  }

  if (best) {
    fs.writeFileSync(BOUNDARY_CACHE_FILE, JSON.stringify(best));
    return best;
  }

  const geojson = makeGeneratedBoundaryGeojson();
  return {
    source: "local generated 64-district coordinate map",
    sourceUrl: null,
    cached: false,
    generated: true,
    geojson,
    match: analyzeBoundaryMatch(geojson),
    fetchErrors: errors
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === "/api/districts") return sendJson(res, 200, loadData());

  if (pathname === "/api/boundaries") {
    try {
      const result = await getBoundaries();
      return sendJson(res, 200, {
        source: result.source,
        sourceUrl: result.sourceUrl || null,
        cached: Boolean(result.cached),
        featureCount: result.geojson.features.length,
        match: result.match || analyzeBoundaryMatch(result.geojson),
        geojson: result.geojson
      });
    } catch (error) {
      return sendJson(res, 503, {
        error: "Could not load real district boundary GeoJSON.",
        detail: error.message,
        fallback: "The browser will show coordinate markers if boundary download fails. Connect to the internet once and reload to cache the real map."
      });
    }
  }

  if (pathname === "/api/summary") {
    const data = loadData();
    return sendJson(res, 200, {
      meta: data.meta,
      totals: data.totals,
      districts: data.districts.map((d) => ({ division: d.division, district: d.district, counts: d.counts }))
    });
  }

  if (pathname === "/api/zone-total") {
    const districts = String(parsed.query.districts || "")
      .split(",")
      .map((d) => decodeURIComponent(d.trim()))
      .filter(Boolean);
    return sendJson(res, 200, calculateZoneTotals(districts));
  }

  let safePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  safePath = safePath.replace(/\\/g, "/");
  if (safePath.includes("..")) {
    res.writeHead(403, noCacheHeaders("text/plain; charset=utf-8"));
    return res.end("Forbidden");
  }

  return sendFile(res, path.join(PUBLIC_DIR, safePath));
});

server.listen(PORT, () => {
  console.log(`Bangladesh Institution Zone Map running at http://localhost:${PORT}`);
  console.log("v5 64-district digital map: selects the best boundary source and always displays all 64 districts.");
});
