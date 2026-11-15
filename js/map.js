const state = {
  year: 2024,
  metric: "renter",
  cbsa: null,
  name: null
};

const events = d3.dispatch("selectionchange", "yearchange");
window.dashboardEvents = events;

const metrics = {
  renter: {
    label: "Renter Cost Burden",
    column: "renter_burden_pct",
    type: "pct",
    color: d3.interpolateBlues
  },
  owner: {
    label: "Mortgage-Owner Cost Burden",
    column: "mortgage_owner_burden_pct",
    type: "pct",
    color: d3.interpolateBlues
  },
  gap: {
    label: "Renter − Owner Burden Gap",
    column: "burden_gap_renter_minus_mortgage_pp",
    type: "gap"
  },
  income: {
    label: "Median Household Income",
    column: "median_household_income",
    type: "money",
    color: d3.interpolateGreens
  },
  value: {
    label: "Median Home Value",
    column: "median_owner_home_value",
    type: "money",
    color: d3.interpolatePurples
  }
};

const stateAbbr = {
  "01":"AL","02":"AK","04":"AZ","05":"AR",
  "06":"CA","08":"CO","09":"CT","10":"DE",
  "11":"DC","12":"FL","13":"GA","15":"HI",
  "16":"ID","17":"IL","18":"IN","19":"IA",
  "20":"KS","21":"KY","22":"LA","23":"ME",
  "24":"MD","25":"MA","26":"MI","27":"MN",
  "28":"MS","29":"MO","30":"MT","31":"NE",
  "32":"NV","33":"NH","34":"NJ","35":"NM",
  "36":"NY","37":"NC","38":"ND","39":"OH",
  "40":"OK","41":"OR","42":"PA","44":"RI",
  "45":"SC","46":"SD","47":"TN","48":"TX",
  "49":"UT","50":"VT","51":"VA","53":"WA",
  "54":"WV","55":"WI","56":"WY"
};

const svg = d3.select("#map");
// const tooltip = d3.select("#tooltip");

const tooltip = d3.select("body")
  .append("div")
  .attr("id", "tooltip")
  .html(`
    <strong id="tip-name"></strong>
    <div id="tip-meta"></div>

    <div class="tip-row">
      <span>Renter burden</span>
      <span id="tip-renter"></span>
    </div>

    <div class="tip-row">
      <span>Mortgage-owner burden</span>
      <span id="tip-owner"></span>
    </div>

    <div class="tip-row">
      <span>Burden gap</span>
      <span id="tip-gap"></span>
    </div>

    <div class="tip-row">
      <span>Median household income</span>
      <span id="tip-income"></span>
    </div>

    <div class="tip-row">
      <span>Median home value</span>
      <span id="tip-value"></span>
    </div>

    <div class="tip-trend">
      <span id="trend-icon" class="trend-icon"></span>
      <span id="tip-comparable"></span>
    </div>
  `);


function getCode(value) {
  if (value == null || String(value).trim() === "") return "";
  return String(value).trim().padStart(5, "0");
}

function num(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metricValue(row, key) {
  if (!row) return null;

  if (key === "gap") {
    const saved = num(row[metrics.gap.column]);

    if (saved !== null && Math.abs(saved) <= 100) {
      return saved;
    }

    const renter = metricValue(row, "renter");
    const owner = metricValue(row, "owner");

    return renter === null || owner === null
      ? null
      : renter - owner;
  }

  const value = num(row[metrics[key].column]);
  if (value === null) return null;

  if (metrics[key].type === "pct") {
    return value >= 0 && value <= 100 ? value : null;
  }

  return value >= 0 ? value : null;
}

function format(value, type) {
  if (value == null) return "No data";

  if (type === "money") {
    return "$" + Math.round(value).toLocaleString("en-US");
  }

  if (type === "gap") {
    return value.toFixed(1) + " pp";
  }

  return value.toFixed(1) + "%";
}

function shortFormat(value, type) {
  if (type === "money") {
    return Math.abs(value) >= 1000000
      ? "$" + (value / 1000000).toFixed(1) + "M"
      : "$" + Math.round(value / 1000) + "k";
  }

  return Math.round(value) + (type === "gap" ? " pp" : "%");
}

function fixWinding(feature) {
  if (!feature.geometry) return;

  function fixPolygon(polygon) {
    const area = d3.geoArea({
      type: "Polygon",
      coordinates: polygon
    });

    if (area > 2 * Math.PI) {
      polygon.forEach(ring => ring.reverse());
    }
  }

  const geometry = feature.geometry;

  if (geometry.type === "Polygon") {
    fixPolygon(geometry.coordinates);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach(fixPolygon);
  }
}

function toGeoJSON(raw) {
  if (raw.type === "FeatureCollection") return raw;

  if (raw.type === "Topology") {
    const entries = Object.entries(raw.objects || {});

    const entry =
      entries.find(([name]) => /cbsa/i.test(name)) ||
      entries.find(([, object]) =>
        object.type === "GeometryCollection"
      ) ||
      entries[0];

    if (!entry) throw new Error("No geography found in TopoJSON.");

    const result = topojson.feature(raw, entry[1]);

    return result.type === "FeatureCollection"
      ? result
      : { type: "FeatureCollection", features: [result] };
  }

  throw new Error("Unsupported map format: " + raw.type);
}

async function start() {
  const [csv, raw2020, raw2024, usa] = await Promise.all([
    d3.csv("data/acs_metro_web_with_comparability.csv"),
    d3.json("data/cb_2020_us_cbsa_5m.json"),
    d3.json("data/cb_2024_us_cbsa_5m.json"),
    d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json")
  ]);

  const geo2020 = toGeoJSON(raw2020);
  const geo2024 = toGeoJSON(raw2024);

  geo2020.features.forEach(fixWinding);
  geo2024.features.forEach(fixWinding);

  const maps = {
    2021: geo2020,
    2022: geo2020,
    2023: geo2024,
    2024: geo2024
  };

  const dataByYear = new Map();

  [2021, 2022, 2023, 2024].forEach(year => {
    const rows = csv.filter(d => +d.year === year);

    dataByYear.set(
      year,
      new Map(rows.map(d => [getCode(d.cbsa_code), d]))
    );
  });

  const ranges = {};

  for (const key of Object.keys(metrics)) {
    const values = csv
      .map(row => metricValue(row, key))
      .filter(value => value !== null)
      .sort(d3.ascending);

    if (!values.length) {
      throw new Error("Missing data for " + metrics[key].label);
    }

    let min = d3.quantile(values, 0.05);
    let max = d3.quantile(values, 0.95);
    let scale;

    if (key === "gap") {
      const absValues = values.map(Math.abs).sort(d3.ascending);
      const limit = Math.max(5, d3.quantile(absValues, 0.95));

      min = -limit;
      max = limit;

      scale = d3.scaleDiverging(
        t => d3.interpolateRdBu(1 - t)
      ).domain([min, 0, max]).clamp(true);
    } else {
      if (max <= min) max = min + 1;

      scale = d3.scaleSequential(metrics[key].color)
        .domain([min, max])
        .clamp(true);
    }

    ranges[key] = { min, max, scale };
  }

  const nation = topojson.feature(usa, usa.objects.nation);
  const states = topojson.feature(usa, usa.objects.states).features;

  const projection = d3.geoAlbersUsa()
    .fitExtent([[30, 30], [1020, 615]], nation);

  const path = d3.geoPath(projection);

  const stateLayer = svg.append("g");
  const metroLayer = svg.append("g");
  const borderLayer = svg.append("g");
  const labelLayer = svg.append("g");

  stateLayer.selectAll("path")
    .data(states)
    .join("path")
    .attr("class", "state")
    .attr("d", path);

  borderLayer.append("path")
    .datum(topojson.mesh(
      usa, usa.objects.states, (a, b) => a !== b
    ))
    .attr("class", "state-border")
    .attr("d", path);

  const candidates = states.map(feature => {
    const [x, y] = path.centroid(feature);
    const area = path.area(feature);
    const fips = String(feature.id).padStart(2, "0");

    return {
      x, y, area,
      abbr: stateAbbr[fips]
    };
  }).filter(d =>
    d.abbr &&
    Number.isFinite(d.x) &&
    Number.isFinite(d.y) &&
    d.area >= 180
  ).sort((a, b) => b.area - a.area);

  const labels = [];

  for (const candidate of candidates) {
    const overlaps = labels.some(d =>
      Math.abs(d.x - candidate.x) < 22 &&
      Math.abs(d.y - candidate.y) < 15
    );

    if (!overlaps) labels.push(candidate);
  }

  labelLayer.selectAll("text")
    .data(labels)
    .join("text")
    .attr("class", "state-label")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.abbr);

  function rowFor(year, cbsa) {
    return dataByYear.get(year)?.get(cbsa);
  }

  function metroName(feature, row) {
    return row?.metro_name ||
      row?.NAME ||
      feature.properties?.NAME ||
      getCode(feature.properties?.GEOID);
  }

  function moveTooltip(event) {
    const element = tooltip.node();

    let x = event.clientX + 15;
    let y = event.clientY + 15;

    if (x + element.offsetWidth > window.innerWidth - 8) {
      x = event.clientX - element.offsetWidth - 15;
    }

    if (y + element.offsetHeight > window.innerHeight - 8) {
      y = event.clientY - element.offsetHeight - 15;
    }

    tooltip
      .style("left", Math.max(8, x) + "px")
      .style("top", Math.max(8, y) + "px");
  }

  function showTooltip(event, feature) {
    const cbsa = getCode(feature.properties.GEOID);
    const row = rowFor(state.year, cbsa);

    d3.select("#tip-name").text(metroName(feature, row));
    d3.select("#tip-meta").text(
      state.year + " · CBSA " + cbsa
    );

    for (const key of Object.keys(metrics)) {
      d3.select("#tip-" + key).text(
        format(metricValue(row, key), metrics[key].type)
      );
    }

    const comparable = String(row?.trend_comparable ?? "")
      .trim()
      .toLowerCase();

    const isComparable =
      comparable === "true" || comparable === "1";

    const isNotComparable =
      comparable === "false" || comparable === "0";

    const statusText = isComparable
      ? "2021–2024 trend: Comparable"
      : isNotComparable
        ? "2021–2024 trend: Not strictly comparable"
        : "2021–2024 trend: Unknown";

    d3.select("#tip-comparable").text(statusText);

    d3.select("#trend-icon")
      .text(isComparable ? "✓" : isNotComparable ? "!" : "?")
      .classed("warning", isNotComparable)
      .classed("unknown", !isComparable && !isNotComparable);

    tooltip.style("display", "block");
    moveTooltip(event);
  }

  function hideTooltip() {
    tooltip.style("display", "none");
  }

  function updateSelection() {
    const selected = state.cbsa !== null;

    d3.select("#selection")
      .style("display", selected ? "flex" : "none");

    if (selected) {
      const row = rowFor(state.year, state.cbsa);

      d3.select("#selected-name").text(
        row?.metro_name || state.name || state.cbsa
      );
    }

    metroLayer.selectAll(".metro")
      .classed("selected", feature =>
        getCode(feature.properties.GEOID) === state.cbsa
      );

    metroLayer.selectAll(".metro.selected").raise();
  }

  function updateLegend() {
    const info = metrics[state.metric];
    const { min, max, scale } = ranges[state.metric];

    const stops = d3.range(41).map(i => {
      const t = i / 40;
      const value = min + t * (max - min);
      return scale(value) + " " + (t * 100) + "%";
    });

    d3.select("#legend-title").text(info.label);
    d3.select("#legend-gradient").style(
      "background",
      "linear-gradient(to right," + stops.join(",") + ")"
    );

    d3.select("#legend-min").text(shortFormat(min, info.type));
    d3.select("#legend-mid").text(
      shortFormat((min + max) / 2, info.type)
    );
    d3.select("#legend-max").text(shortFormat(max, info.type));

    d3.select("#legend-note").text(
      state.metric === "gap"
        ? "Blue: owner burden higher · Red: renter burden higher"
        : "Same color scale across all four years."
    );
  }

  function updateMap() {
    hideTooltip();

    const geo = maps[state.year];
    const yearData = dataByYear.get(state.year);
    const metric = state.metric;
    const scale = ranges[metric].scale;

    const features = geo.features.filter(feature =>
      yearData.has(getCode(feature.properties?.GEOID))
    );

    metroLayer.selectAll(".metro")
      .data(features, feature =>
        getCode(feature.properties.GEOID)
      )
      .join("path")
      .attr("class", "metro")
      .attr("d", path)
      .attr("fill", feature => {
        const cbsa = getCode(feature.properties.GEOID);
        const value = metricValue(
          rowFor(state.year, cbsa), metric
        );

        return value === null ? "#cbd0d6" : scale(value);
      })
      .on("mousemove", showTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (event, feature) => {
        const cbsa = getCode(feature.properties.GEOID);
        const row = rowFor(state.year, cbsa);

        state.cbsa = cbsa;
        state.name = metroName(feature, row);

        updateSelection();

        events.call("selectionchange", null, {
          cbsa: state.cbsa,
          year: state.year
        });
      });

    updateSelection();
    updateLegend();

    d3.select("#map-heading").text(
      metrics[metric].label + " · " + state.year
    );

    const valid = features.filter(feature => {
      const cbsa = getCode(feature.properties.GEOID);
      return metricValue(
        rowFor(state.year, cbsa), metric
      ) !== null;
    }).length;

    d3.select("#status").text(
      `${state.year}: ${features.length} Metro areas · ` +
      `${valid} valid values · ` +
      `${features.length - valid} missing`
    );

    console.log({
      year: state.year,
      metric,
      matched: features.length,
      valid
    });
  }

  d3.select("#year-select").on("change", function() {
    state.year = Number(this.value);
    updateMap();

    events.call("yearchange", null, {
      year: state.year,
      cbsa: state.cbsa
    });
  });

  d3.select("#metric-select").on("change", function() {
    state.metric = this.value;
    updateMap();
  });

  d3.select("#show-labels").on("change", function() {
    labelLayer.style(
      "display",
      this.checked ? null : "none"
    );
  });

  d3.select("#clear-selection").on("click", function() {
    state.cbsa = null;
    state.name = null;
    updateSelection();

    events.call("selectionchange", null, {
      cbsa: null,
      year: state.year
    });
  });

  updateMap();
}

start().catch(error => {
  console.error(error);
  d3.select("#status").text("Error: " + error.message);
});
