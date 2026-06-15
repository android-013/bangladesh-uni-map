const state = {
  data: null,
  districts: [],
  districtByName: new Map(),
  districtByKey: new Map(),
  activeZoneIndex: 0,
  zones: [
    { id: 1, name: "Zone 1", color: "#60a5fa", districts: [] },
    { id: 2, name: "Zone 2", color: "#34d399", districts: [] },
    { id: 3, name: "Zone 3", color: "#fbbf24", districts: [] },
    { id: 4, name: "Zone 4", color: "#fb7185", districts: [] },
    { id: 5, name: "Zone 5", color: "#c084fc", districts: [] }
  ],
  search: "",
  division: "",
  svg: null,
  tooltip: null,
  showLabels: true,
  highlightedDistrict: null,
  boundaryPayload: null,
  boundaryFeatures: [],
  unmatchedBoundaryNames: [],
  realBoundaryMatchCount: 0,
  projectedLocalDistrictCount: 0,
  projection: null,
  hasRealMap: false,
  mapBaseViewBox: { x: 0, y: 0, width: 1000, height: 1120 },
  mapViewBox: { x: 0, y: 0, width: 1000, height: 1120 },
  isDragging: false,
  dragStart: null,
  suppressClick: false
};

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

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
  naogaon: "naogaon",
  nawabganj: "chapainawabganj",
  chapainawabganj: "chapainawabganj",
  chapainawabgonj: "chapainawabganj",
  chapainawabganjzilla: "chapainawabganj",
  chapainawabganjdistrict: "chapainawabganj",
  chapainawabganjzila: "chapainawabganj",
  chapai: "chapainawabganj",
  coxsbazar: "coxsbazar",
  coxbazar: "coxsbazar",
  coxs: "coxsbazar",
  sherpur: "sherpur",
  netrakona: "netrokona",
  narshingdi: "narsingdi",
  sunamgonj: "sunamganj",
  narayangonj: "narayanganj",
  munshigonj: "munshiganj",
  gazipur: "gazipur",
  thakurgaon: "thakurgaon"
};

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function institutionColor(total) {
  if (total === 0) return "#64748b";
  if (total <= 2) return "#22c55e";
  if (total <= 6) return "#eab308";
  if (total <= 20) return "#f97316";
  return "#ef4444";
}

function markerRadius(total) {
  return Math.max(10, Math.min(31, 10 + Math.sqrt(Number(total || 0)) * 2.2));
}

function getDistrictZoneIndex(districtName) {
  return state.zones.findIndex((zone) => zone.districts.includes(districtName));
}

function activeZone() {
  return state.zones[state.activeZoneIndex];
}

function zoneCounts(zone) {
  const totals = {
    districts: zone.districts.length,
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

  for (const districtName of zone.districts) {
    const district = state.districtByName.get(districtName);
    if (!district) continue;
    for (const key of Object.keys(totals)) {
      if (key !== "districts") totals[key] += Number(district.counts[key] || 0);
    }
  }
  return totals;
}

function createStat(label, value) {
  const template = $("statTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".stat-value").textContent = number(value);
  node.querySelector(".stat-label").textContent = label;
  return node;
}

function renderNationalStats() {
  const el = $("nationalStats");
  el.innerHTML = "";
  el.appendChild(createStat("Total institutions", state.data.totals.totalInstitutions));
  el.appendChild(createStat("Universities", state.data.totals.totalUniversities));
  el.appendChild(createStat("Medical colleges", state.data.totals.totalMedicalColleges));
  el.appendChild(createStat("Districts", state.data.totals.districts));
}

function renderZoneTabs() {
  const el = $("zoneTabs");
  el.innerHTML = "";
  state.zones.forEach((zone, index) => {
    const btn = document.createElement("button");
    btn.className = "zone-tab" + (index === state.activeZoneIndex ? " active" : "");
    btn.innerHTML = `<span class="zone-color" style="background:${zone.color}"></span>${escapeHtml(zone.name)}`;
    btn.title = `${zone.districts.length} districts selected`;
    btn.addEventListener("click", () => {
      state.activeZoneIndex = index;
      renderAll();
    });
    el.appendChild(btn);
  });
  $("zoneNameInput").value = activeZone().name;
}

function renderZoneSummary() {
  const el = $("zoneSummary");
  el.innerHTML = "";

  state.zones.forEach((zone, index) => {
    const counts = zoneCounts(zone);
    const card = document.createElement("div");
    card.className = "zone-card" + (index === state.activeZoneIndex ? " active" : "");
    const chips = zone.districts
      .slice()
      .sort()
      .map((district) => `<span class="district-chip">${escapeHtml(district)}<button title="Remove ${escapeHtml(district)}" data-remove="${escapeHtml(district)}">×</button></span>`)
      .join("");

    card.innerHTML = `
      <div class="zone-card-header">
        <div class="zone-name"><span class="zone-color" style="background:${zone.color}"></span>${escapeHtml(zone.name)}</div>
        <span class="pill">${counts.districts} district${counts.districts === 1 ? "" : "s"}</span>
      </div>
      <div class="zone-metrics">
        <div class="metric"><strong>${number(counts.totalUniversities)}</strong><span>Universities</span></div>
        <div class="metric"><strong>${number(counts.totalInstitutions)}</strong><span>Total institutions</span></div>
        <div class="metric"><strong>${number(counts.totalMedicalColleges)}</strong><span>Medical colleges</span></div>
      </div>
      <div class="selected-districts">${chips || '<span class="muted">No districts selected yet.</span>'}</div>
    `;

    card.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        removeDistrictFromZones(btn.dataset.remove);
        renderAll();
        saveZonesToStorage(false);
      });
    });

    card.addEventListener("click", () => {
      state.activeZoneIndex = index;
      renderAll();
    });

    el.appendChild(card);
  });
}

function filteredDistricts() {
  const search = state.search.trim().toLowerCase();
  return state.districts.filter((district) => {
    const divisionOk = !state.division || district.division === state.division;
    const searchOk = !search
      || district.district.toLowerCase().includes(search)
      || district.division.toLowerCase().includes(search);
    return divisionOk && searchOk;
  });
}

function renderDistrictList() {
  const list = $("districtList");
  const districts = filteredDistricts();
  $("districtCountLabel").textContent = `${districts.length} shown`;

  list.innerHTML = "";
  districts.forEach((district) => {
    const assignedIndex = getDistrictZoneIndex(district.district);
    const assignedZone = assignedIndex >= 0 ? state.zones[assignedIndex] : null;
    const row = document.createElement("div");
    row.className = "district-row" + (assignedZone ? " assigned" : "");
    row.innerHTML = `
      <div class="district-main">
        <div class="district-title">
          ${escapeHtml(district.district)}
          <small>${escapeHtml(district.division)}</small>
        </div>
        <div class="district-meta">
          Total: ${number(district.counts.totalInstitutions)} · Universities: ${number(district.counts.totalUniversities)} · Medical: ${number(district.counts.totalMedicalColleges)}
          ${assignedZone ? ` · Assigned to ${escapeHtml(assignedZone.name)}` : ""}
        </div>
      </div>
      <button>${assignedZone && assignedIndex === state.activeZoneIndex ? "Remove" : "Select"}</button>
    `;
    row.querySelector("button").addEventListener("click", () => toggleDistrict(district.district));
    row.addEventListener("dblclick", () => focusDistrict(district.district));
    list.appendChild(row);
  });
}

function renderDistrictTable() {
  const tbody = $("districtTable");
  tbody.innerHTML = "";

  state.districts
    .slice()
    .sort((a, b) => b.counts.totalInstitutions - a.counts.totalInstitutions || a.district.localeCompare(b.district))
    .forEach((district) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(district.division)}</td>
        <td>${escapeHtml(district.district)}</td>
        <td>${number(district.counts.totalInstitutions)}</td>
        <td>${number(district.counts.totalUniversities)}</td>
        <td>${number(district.counts.publicUniversities)}</td>
        <td>${number(Number(district.counts.privateUniversities || 0) + Number(district.counts.internationalUniversities || 0))}</td>
        <td>${number(district.counts.totalMedicalColleges)}</td>
      `;
      tbody.appendChild(tr);
    });
}

function populateDivisionFilter() {
  const select = $("divisionFilter");
  const divisions = [...new Set(state.districts.map((d) => d.division))].sort();
  for (const division of divisions) {
    const option = document.createElement("option");
    option.value = division;
    option.textContent = division;
    select.appendChild(option);
  }
}

function popupHtml(district) {
  const institutionItems = district.institutions
    .slice(0, 20)
    .map((item) => `<li>${escapeHtml(item.name)} <small>(${escapeHtml(item.sector)} ${escapeHtml(item.category)})</small></li>`)
    .join("");

  const zoneIndex = getDistrictZoneIndex(district.district);
  const assigned = zoneIndex >= 0 ? state.zones[zoneIndex].name : "None";

  return `
    <div class="popup-title">${escapeHtml(district.district)}, ${escapeHtml(district.division)}</div>
    <div class="popup-grid">
      <div><strong>${number(district.counts.totalInstitutions)}</strong><span>Total institutions</span></div>
      <div><strong>${number(district.counts.totalUniversities)}</strong><span>Universities</span></div>
      <div><strong>${number(district.counts.publicUniversities)}</strong><span>Public universities</span></div>
      <div><strong>${number(Number(district.counts.privateUniversities || 0) + Number(district.counts.internationalUniversities || 0))}</strong><span>Private/int'l universities</span></div>
      <div><strong>${number(district.counts.totalMedicalColleges)}</strong><span>Medical colleges</span></div>
      <div><strong>${escapeHtml(assigned)}</strong><span>Assigned zone</span></div>
    </div>
    ${institutionItems ? `<ol class="popup-list">${institutionItems}</ol>` : `<p class="popup-list">No institution listed for this district.</p>`}
  `;
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

function addSvgDefs(svg) {
  const defs = svgEl("defs");
  const glow = svgEl("filter", { id: "shapeGlow", x: "-60%", y: "-60%", width: "220%", height: "220%" });
  glow.appendChild(svgEl("feGaussianBlur", { stdDeviation: "5", result: "coloredBlur" }));
  const merge = svgEl("feMerge");
  merge.appendChild(svgEl("feMergeNode", { in: "coloredBlur" }));
  merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
  glow.appendChild(merge);
  defs.appendChild(glow);

  const grad = svgEl("linearGradient", { id: "mapGrad", x1: "0%", y1: "0%", x2: "0%", y2: "100%" });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#10213a" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#06111f" }));
  defs.appendChild(grad);

  const water = svgEl("linearGradient", { id: "waterGrad", x1: "0%", y1: "0%", x2: "100%", y2: "100%" });
  water.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#0b2136" }));
  water.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#071525" }));
  defs.appendChild(water);

  svg.appendChild(defs);
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

function forEachCoord(geometry, visitor) {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => ring.forEach(visitor));
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach(visitor)));
  }
}

function mercatorPoint(coord) {
  const lon = Number(coord[0]);
  const lat = Math.max(-85, Math.min(85, Number(coord[1])));
  const x = lon * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return { x, y };
}

function makeProjection(features) {
  const rawPoints = [];
  features.forEach((feature) => forEachCoord(feature.geometry, (coord) => rawPoints.push(mercatorPoint(coord))));

  if (!rawPoints.length) {
    return null;
  }

  const minX = Math.min(...rawPoints.map((p) => p.x));
  const maxX = Math.max(...rawPoints.map((p) => p.x));
  const minY = Math.min(...rawPoints.map((p) => p.y));
  const maxY = Math.max(...rawPoints.map((p) => p.y));

  const width = 1000;
  const height = 1120;
  const pad = 26;
  const scale = Math.min((width - pad * 2) / (maxX - minX), (height - pad * 2) / (maxY - minY));
  const mapWidth = (maxX - minX) * scale;
  const mapHeight = (maxY - minY) * scale;
  const offsetX = (width - mapWidth) / 2;
  const offsetY = (height - mapHeight) / 2;

  return {
    width,
    height,
    project(coord) {
      const p = mercatorPoint(coord);
      return {
        x: offsetX + (p.x - minX) * scale,
        y: offsetY + (maxY - p.y) * scale
      };
    }
  };
}

function ringAreaAndCentroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 0.00001) {
    const avg = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { area: 0, x: avg.x / points.length, y: avg.y / points.length };
  }
  return { area, x: cx / (6 * area), y: cy / (6 * area) };
}

function featureToPathAndCentroid(feature) {
  const projection = state.projection;
  let d = "";
  let bestCentroid = null;
  let bestArea = 0;

  const drawRing = (ring) => {
    const points = ring.map((coord) => projection.project(coord));
    if (points.length < 3) return;
    d += points.map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + " Z ";
    const centroid = ringAreaAndCentroid(points);
    const areaAbs = Math.abs(centroid.area);
    if (areaAbs > bestArea) {
      bestArea = areaAbs;
      bestCentroid = { x: centroid.x, y: centroid.y };
    }
  };

  if (feature.geometry?.type === "Polygon") {
    feature.geometry.coordinates.forEach(drawRing);
  } else if (feature.geometry?.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((polygon) => polygon.forEach(drawRing));
  }

  return { d, centroid: bestCentroid, area: bestArea };
}

function buildLocalDistrictShape(district, index) {
  const lng = Number(district.lng);
  const lat = Number(district.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !state.projection) return null;

  const center = state.projection.project([lng, lat]);
  const total = Number(district.counts.totalInstitutions || 0);
  const radius = Math.max(13, Math.min(24, markerRadius(total) * 0.72));
  const wobble = (index % 5) * 0.9;
  const points = [
    { x: center.x, y: center.y - radius - wobble },
    { x: center.x + radius * 1.05, y: center.y - radius * 0.25 },
    { x: center.x + radius * 0.85, y: center.y + radius * 0.75 },
    { x: center.x - radius * 0.25, y: center.y + radius * 1.05 },
    { x: center.x - radius * 1.05, y: center.y + radius * 0.15 },
    { x: center.x - radius * 0.70, y: center.y - radius * 0.75 }
  ];
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") + " Z";
  return { feature: null, rawName: district.district, district, d, centroid: center, area: radius * radius, localProjected: true };
}

function initBoundaryFeatures() {
  const geojson = state.boundaryPayload?.geojson;
  if (!geojson?.features?.length) return false;

  state.projection = makeProjection(geojson.features);
  if (!state.projection) return false;

  const byDistrict = new Map();
  const unmatched = [];
  geojson.features.forEach((feature) => {
    const rawName = getFeatureName(feature);
    const district = state.districtByKey.get(canonicalKey(rawName));
    const shape = featureToPathAndCentroid(feature);
    if (district && shape.d && shape.centroid) {
      const existing = byDistrict.get(district.district);
      if (existing) {
        existing.d += " " + shape.d;
        if (Number(shape.area || 0) > Number(existing.area || 0)) {
          existing.centroid = shape.centroid;
          existing.area = shape.area;
        }
      } else {
        byDistrict.set(district.district, { feature, rawName, district, d: shape.d, centroid: shape.centroid, area: shape.area, localProjected: false });
      }
    } else if (rawName) {
      unmatched.push(rawName);
    }
  });

  const realFeatures = Array.from(byDistrict.values());
  const missingDistricts = state.districts.filter((district) => !byDistrict.has(district.district));
  const localFeatures = missingDistricts
    .map((district, index) => buildLocalDistrictShape(district, index))
    .filter(Boolean);

  state.boundaryFeatures = realFeatures.concat(localFeatures);
  state.unmatchedBoundaryNames = unmatched;
  state.realBoundaryMatchCount = realFeatures.length;
  state.projectedLocalDistrictCount = localFeatures.length;
  state.hasRealMap = state.boundaryFeatures.length === state.districts.length;
  state.mapBaseViewBox = { x: 0, y: 0, width: state.projection.width, height: state.projection.height };
  state.mapViewBox = { ...state.mapBaseViewBox };
  return state.hasRealMap;
}

function applyViewBox() {
  const b = state.mapViewBox;
  state.svg.setAttribute("viewBox", `${b.x} ${b.y} ${b.width} ${b.height}`);
}

function renderGrid(svg) {
  const vb = state.mapBaseViewBox;
  svg.appendChild(svgEl("rect", { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: "url(#waterGrad)" }));

  const grid = svgEl("g", { class: "map-grid" });
  for (let i = 1; i < 8; i += 1) {
    const x = vb.x + i * (vb.width / 8);
    grid.appendChild(svgEl("line", { x1: x, y1: vb.y, x2: x, y2: vb.y + vb.height }));
  }
  for (let i = 1; i < 10; i += 1) {
    const y = vb.y + i * (vb.height / 10);
    grid.appendChild(svgEl("line", { x1: vb.x, y1: y, x2: vb.x + vb.width, y2: y }));
  }
  svg.appendChild(grid);
}

function renderRealBoundaryMap() {
  const svg = state.svg;
  svg.innerHTML = "";
  addSvgDefs(svg);
  renderGrid(svg);

  const mapLayer = svgEl("g", { class: "real-map-layer" });
  const labelLayer = svgEl("g", { class: "map-label-layer" });

  state.boundaryFeatures
    .slice()
    .sort((a, b) => Number(a.district.counts.totalInstitutions || 0) - Number(b.district.counts.totalInstitutions || 0))
    .forEach((item) => {
      const { district, centroid } = item;
      const total = Number(district.counts.totalInstitutions || 0);
      const zoneIndex = getDistrictZoneIndex(district.district);
      const zone = zoneIndex >= 0 ? state.zones[zoneIndex] : null;
      const isHighlighted = state.highlightedDistrict === district.district;
      const fill = zone ? zone.color : institutionColor(total);

      const path = svgEl("path", {
        class: "district-shape" + (item.localProjected ? " local-projected" : "") + (zone ? " assigned" : "") + (isHighlighted ? " highlighted" : ""),
        d: item.d,
        tabindex: "0",
        role: "button",
        "aria-label": `${district.district}: ${total} institutions`,
        "data-district": district.district,
        fill,
        stroke: zone ? zone.color : "rgba(226,232,240,0.72)"
      });
      path.style.setProperty("--zone-color", zone ? zone.color : institutionColor(total));

      path.addEventListener("click", (event) => {
        if (state.suppressClick) return;
        event.stopPropagation();
        toggleDistrict(district.district);
      });
      path.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        focusDistrict(district.district);
      });
      path.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleDistrict(district.district);
        }
      });
      path.addEventListener("mousemove", (event) => showTooltip(event, district));
      path.addEventListener("mouseleave", hideTooltip);
      path.addEventListener("focus", (event) => showTooltip(event, district));
      path.addEventListener("blur", hideTooltip);
      mapLayer.appendChild(path);

      const badgeR = markerRadius(total);
      const badgeGroup = svgEl("g", {
        class: "district-badge" + (zone ? " assigned" : ""),
        "data-district": district.district
      });
      badgeGroup.style.setProperty("--badge-color", fill);
      badgeGroup.appendChild(svgEl("circle", { class: "count-badge-circle", cx: centroid.x, cy: centroid.y, r: badgeR }));
      const countText = svgEl("text", { class: "count-badge-text", x: centroid.x, y: centroid.y + 4.2, "text-anchor": "middle" });
      countText.textContent = String(total);
      badgeGroup.appendChild(countText);
      badgeGroup.addEventListener("click", (event) => {
        if (state.suppressClick) return;
        event.stopPropagation();
        toggleDistrict(district.district);
      });
      badgeGroup.addEventListener("mousemove", (event) => showTooltip(event, district));
      badgeGroup.addEventListener("mouseleave", hideTooltip);
      labelLayer.appendChild(badgeGroup);

      if (state.showLabels || zone || total >= 7 || isHighlighted) {
        const label = svgEl("text", {
          class: "district-label" + (zone ? " assigned" : ""),
          x: centroid.x,
          y: centroid.y + badgeR + 16,
          "text-anchor": "middle"
        });
        label.textContent = district.district;
        labelLayer.appendChild(label);
      }
    });

  svg.appendChild(mapLayer);
  svg.appendChild(labelLayer);
  applyViewBox();

  const displayed = new Set(state.boundaryFeatures.map((item) => item.district.district)).size;
  const source = state.boundaryPayload?.source || "district boundary GeoJSON";
  const projectedNote = state.projectedLocalDistrictCount
    ? ` ${state.realBoundaryMatchCount} exact boundary matches + ${state.projectedLocalDistrictCount} locally positioned districts.`
    : ` All districts matched as boundary shapes.`;
  $("mapStatus").textContent = `Digital district map loaded from ${source}. ${displayed}/64 districts displayed.${projectedNote} Click any district shape to add/remove.`;
}

function projectDistrictMarkers() {
  const width = 1000;
  const height = 900;
  const padX = 78;
  const padY = 68;
  const lats = state.districts.map((d) => Number(d.lat));
  const lngs = state.districts.map((d) => Number(d.lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const project = (district) => ({
    x: padX + ((Number(district.lng) - minLng) / (maxLng - minLng)) * (width - padX * 2),
    y: padY + ((maxLat - Number(district.lat)) / (maxLat - minLat)) * (height - padY * 2)
  });
  state.projection = { width, height, project };
  state.mapBaseViewBox = { x: 0, y: 0, width, height };
  state.mapViewBox = { ...state.mapBaseViewBox };
}

function renderFallbackMarkerMap() {
  const svg = state.svg;
  svg.innerHTML = "";
  addSvgDefs(svg);
  renderGrid(svg);
  const layer = svgEl("g", { class: "district-layer fallback-layer" });

  state.districts.forEach((district) => {
    const point = state.projection.project(district);
    const total = Number(district.counts.totalInstitutions || 0);
    const r = markerRadius(total);
    const zoneIndex = getDistrictZoneIndex(district.district);
    const zone = zoneIndex >= 0 ? state.zones[zoneIndex] : null;
    const group = svgEl("g", { class: "district-marker" + (zone ? " assigned" : ""), tabindex: "0", role: "button" });
    group.style.setProperty("--marker-color", zone ? zone.color : institutionColor(total));
    group.style.setProperty("--stroke-color", zone ? zone.color : "#e5e7eb");
    group.appendChild(svgEl("circle", { class: "district-dot", cx: point.x, cy: point.y, r }));
    const countText = svgEl("text", { class: "district-count", x: point.x, y: point.y + 4, "text-anchor": "middle" });
    countText.textContent = String(total);
    group.appendChild(countText);
    if (state.showLabels || zone || total >= 7) {
      const label = svgEl("text", { class: "district-label", x: point.x, y: point.y + r + 17, "text-anchor": "middle" });
      label.textContent = district.district;
      group.appendChild(label);
    }
    group.addEventListener("click", () => toggleDistrict(district.district));
    group.addEventListener("mousemove", (event) => showTooltip(event, district));
    group.addEventListener("mouseleave", hideTooltip);
    layer.appendChild(group);
  });

  svg.appendChild(layer);
  applyViewBox();
  $("mapStatus").textContent = "Boundary download failed, so all 64 districts are shown as local coordinate markers. Connect to internet once and reload for boundary shapes.";
}

function showTooltip(event, district) {
  const tooltip = state.tooltip;
  if (!tooltip) return;
  tooltip.innerHTML = popupHtml(district) + `<div class="tooltip-action">Click to add/remove from ${escapeHtml(activeZone().name)}</div>`;
  tooltip.hidden = false;

  const shell = $("map").getBoundingClientRect();
  const clientX = event.clientX || shell.left + shell.width / 2;
  const clientY = event.clientY || shell.top + shell.height / 2;
  let left = clientX - shell.left + 18;
  let top = clientY - shell.top + 18;
  const maxLeft = shell.width - 335;
  const maxTop = shell.height - 250;
  left = Math.max(10, Math.min(left, maxLeft));
  top = Math.max(10, Math.min(top, maxTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  if (state.tooltip) state.tooltip.hidden = true;
}

function renderSvgMap() {
  if (!state.svg) return;
  if (state.hasRealMap) renderRealBoundaryMap();
  else renderFallbackMarkerMap();
}

function zoomMap(factor, clientX, clientY) {
  const svg = state.svg;
  const rect = svg.getBoundingClientRect();
  const vb = state.mapViewBox;
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  const mapX = vb.x + px * vb.width;
  const mapY = vb.y + py * vb.height;
  const newWidth = Math.max(state.mapBaseViewBox.width / 5.5, Math.min(state.mapBaseViewBox.width * 1.3, vb.width * factor));
  const newHeight = Math.max(state.mapBaseViewBox.height / 5.5, Math.min(state.mapBaseViewBox.height * 1.3, vb.height * factor));
  state.mapViewBox = {
    x: mapX - px * newWidth,
    y: mapY - py * newHeight,
    width: newWidth,
    height: newHeight
  };
  applyViewBox();
}

function wireMapInteraction() {
  const svg = state.svg;
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 0.86 : 1.16, event.clientX, event.clientY);
  }, { passive: false });

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    state.isDragging = true;
    state.suppressClick = false;
    state.dragStart = {
      x: event.clientX,
      y: event.clientY,
      viewBox: { ...state.mapViewBox }
    };
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener("pointermove", (event) => {
    if (!state.isDragging || !state.dragStart) return;
    const rect = svg.getBoundingClientRect();
    const dx = (event.clientX - state.dragStart.x) / rect.width * state.dragStart.viewBox.width;
    const dy = (event.clientY - state.dragStart.y) / rect.height * state.dragStart.viewBox.height;
    if (Math.abs(event.clientX - state.dragStart.x) > 4 || Math.abs(event.clientY - state.dragStart.y) > 4) {
      state.suppressClick = true;
    }
    state.mapViewBox = {
      ...state.dragStart.viewBox,
      x: state.dragStart.viewBox.x - dx,
      y: state.dragStart.viewBox.y - dy
    };
    applyViewBox();
  });

  const stopDrag = () => {
    state.isDragging = false;
    state.dragStart = null;
    setTimeout(() => { state.suppressClick = false; }, 0);
  };
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointerleave", stopDrag);
}

function initMap() {
  state.svg = $("districtSvg");
  state.tooltip = $("mapTooltip");
  if (!initBoundaryFeatures()) {
    projectDistrictMarkers();
  }
  wireMapInteraction();
  renderSvgMap();
}

function refreshMapStyles() {
  renderSvgMap();
}

function focusDistrict(districtName) {
  state.highlightedDistrict = districtName;
  if (state.hasRealMap) {
    const item = state.boundaryFeatures.find((f) => f.district.district === districtName);
    if (item) {
      const w = state.mapBaseViewBox.width / 3.2;
      const h = state.mapBaseViewBox.height / 3.2;
      state.mapViewBox = { x: item.centroid.x - w / 2, y: item.centroid.y - h / 2, width: w, height: h };
    }
  }
  renderSvgMap();
  $("map").scrollIntoView({ behavior: "smooth", block: "center" });
}

function removeDistrictFromZones(districtName) {
  state.zones.forEach((zone) => {
    zone.districts = zone.districts.filter((name) => name !== districtName);
  });
}

function toggleDistrict(districtName) {
  const zone = activeZone();
  const alreadyInActive = zone.districts.includes(districtName);
  removeDistrictFromZones(districtName);

  if (!alreadyInActive) {
    zone.districts.push(districtName);
    zone.districts.sort();
  }

  state.highlightedDistrict = districtName;
  renderAll();
  saveZonesToStorage(false);
}

function renderAll() {
  renderZoneTabs();
  renderZoneSummary();
  renderDistrictList();
  renderDistrictTable();
  refreshMapStyles();
}

function saveZonesToStorage(showNotice = true) {
  localStorage.setItem("bdInstitutionZonesV4", JSON.stringify({
    activeZoneIndex: state.activeZoneIndex,
    zones: state.zones
  }));
  if (showNotice) alert("Zones saved in this browser.");
}

function loadZonesFromStorage() {
  const raw = localStorage.getItem("bdInstitutionZonesV4") || localStorage.getItem("bdInstitutionZonesV3") || localStorage.getItem("bdInstitutionZones");
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.zones) || saved.zones.length !== 5) return;
    state.zones = saved.zones.map((zone, index) => ({
      ...state.zones[index],
      ...zone,
      districts: Array.isArray(zone.districts)
        ? zone.districts.filter((name) => state.districtByName.has(name))
        : []
    }));
    state.activeZoneIndex = Math.min(4, Math.max(0, Number(saved.activeZoneIndex || 0)));
  } catch (error) {
    console.warn("Unable to read saved zones", error);
  }
}

function exportZones() {
  const payload = {
    exportedAt: new Date().toISOString(),
    zones: state.zones.map((zone) => ({
      name: zone.name,
      color: zone.color,
      districts: zone.districts,
      counts: zoneCounts(zone)
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, "bd-institution-zones.json");
}

function downloadCsv() {
  const rows = [
    ["Division", "District", "Total Institutions", "Total Universities", "Public Universities", "Private/International Universities", "Medical Colleges"]
  ];

  state.districts
    .slice()
    .sort((a, b) => a.division.localeCompare(b.division) || a.district.localeCompare(b.district))
    .forEach((d) => rows.push([
      d.division,
      d.district,
      d.counts.totalInstitutions,
      d.counts.totalUniversities,
      d.counts.publicUniversities,
      Number(d.counts.privateUniversities || 0) + Number(d.counts.internationalUniversities || 0),
      d.counts.totalMedicalColleges
    ]));

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  downloadBlob(new Blob([csv], { type: "text/csv" }), "bd-district-institution-counts.csv");
}

function downloadBlob(blob, fileName) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetZones() {
  if (!confirm("Clear all zone selections?")) return;
  state.zones.forEach((zone, index) => {
    zone.name = `Zone ${index + 1}`;
    zone.districts = [];
  });
  state.activeZoneIndex = 0;
  state.highlightedDistrict = null;
  localStorage.removeItem("bdInstitutionZonesV4");
  localStorage.removeItem("bdInstitutionZonesV3");
  localStorage.removeItem("bdInstitutionZones");
  renderAll();
}

function wireEvents() {
  $("districtSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderDistrictList();
  });

  $("divisionFilter").addEventListener("change", (event) => {
    state.division = event.target.value;
    renderDistrictList();
  });

  $("zoneNameInput").addEventListener("input", (event) => {
    activeZone().name = event.target.value.trim() || `Zone ${state.activeZoneIndex + 1}`;
    renderZoneTabs();
    renderZoneSummary();
    refreshMapStyles();
    saveZonesToStorage(false);
  });

  $("clearActiveZoneBtn").addEventListener("click", () => {
    activeZone().districts = [];
    renderAll();
    saveZonesToStorage(false);
  });

  $("saveZonesBtn").addEventListener("click", () => saveZonesToStorage(true));
  $("resetZonesBtn").addEventListener("click", resetZones);
  $("exportZonesBtn").addEventListener("click", exportZones);
  $("downloadCsvBtn").addEventListener("click", downloadCsv);
  $("fitMapBtn").addEventListener("click", () => {
    state.highlightedDistrict = null;
    state.mapViewBox = { ...state.mapBaseViewBox };
    renderSvgMap();
  });
  $("labelToggle").addEventListener("change", (event) => {
    state.showLabels = event.target.checked;
    renderSvgMap();
  });
}

async function loadBoundaryPayload() {
  try {
    const response = await fetch("/api/boundaries", { cache: "no-store" });
    if (!response.ok) throw new Error(`Boundary endpoint returned ${response.status}`);
    state.boundaryPayload = await response.json();
  } catch (error) {
    console.warn("Boundary GeoJSON unavailable", error);
    state.boundaryPayload = null;
  }
}

async function init() {
  const response = await fetch("/api/districts", { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load districts: ${response.status}`);
  state.data = await response.json();
  state.districts = state.data.districts;
  state.districtByName = new Map(state.districts.map((district) => [district.district, district]));
  state.districtByKey = new Map(state.districts.map((district) => [canonicalKey(district.district), district]));

  await loadBoundaryPayload();
  loadZonesFromStorage();
  populateDivisionFilter();
  wireEvents();
  initMap();
  renderNationalStats();
  renderAll();
}

init().catch((error) => {
  console.error(error);
  $("mapStatus").textContent = "Failed to load district data.";
});
