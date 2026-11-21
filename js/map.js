
/*
 * Brush enabled by default.
 * Click and brush work together.
 *
 * Normal click: replace selection
 * Modifier click: add/remove
 * Normal brush: replace selection
 * Modifier brush: add
 *
 * Selected: orange solid halo
 * Hover: orange dashed halo
 *
 * No HTML changes.
 */

const state = {
  year: Number(
    d3.select("#year-select").property("value")
  ) || 2024,

  metric:
    d3.select("#metric-select").property("value") ||
    "renter",

  selectedMetros: [],
  cbsa: null,
  compare: null
};

const events = window.dashboardEvents ||
  d3.dispatch(
    "selectionchange",
    "yearchange",
    "metricchange"
  );

window.dashboardEvents = events;

const MAP_ORANGE = "#e68132";

const metrics = {
  renter: {
    label: "Renter Cost Burden",
    column: "renter_burden_pct",
    type: "pct",
    palette: d3.interpolateBlues
  },

  owner: {
    label: "Mortgage-Owner Cost Burden",
    column: "mortgage_owner_burden_pct",
    type: "pct",
    palette: d3.interpolateBlues
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
    palette: d3.interpolateGreens
  },

  value: {
    label: "Median Home Value",
    column: "median_owner_home_value",
    type: "money",
    palette: d3.interpolatePurples
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

const mapSvg = d3.select("#map");

const mapTooltip = d3.select("body")
  .selectAll("#tooltip")
  .data([null])
  .join("div")
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

// -----------------------------------------
// Utilities
// -----------------------------------------

function getCode(value) {
  return value == null || String(value).trim() === ""
    ? ""
    : String(value).trim().padStart(5, "0");
}

function toNumber(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metricValue(row, metric) {
  if (!row) return null;

  let value = toNumber(
    row[metrics[metric].column]
  );

  if (metric === "gap" && value === null) {
    const renter = metricValue(row, "renter");
    const owner = metricValue(row, "owner");

    value =
      renter === null || owner === null
        ? null
        : renter - owner;
  }

  if (value === null) return null;

  if (
    metrics[metric].type === "pct" &&
    (value < 0 || value > 100)
  ) {
    return null;
  }

  if (
    metrics[metric].type === "money" &&
    value < 0
  ) {
    return null;
  }

  return value;
}

function formatMetric(value, type) {
  if (value === null) return "No data";

  if (type === "money") {
    return "$" +
      Math.round(value).toLocaleString("en-US");
  }

  return value.toFixed(1) +
    (type === "gap" ? " pp" : "%");
}

function shortMetric(value, type) {
  if (type === "money") {
    return Math.abs(value) >= 1000000
      ? "$" + (value / 1000000).toFixed(1) + "M"
      : "$" + Math.round(value / 1000) + "k";
  }

  return Math.round(value) +
    (type === "gap" ? " pp" : "%");
}

function asGeoJSON(raw) {
  if (raw.type === "FeatureCollection") {
    return raw;
  }

  if (raw.type !== "Topology") {
    throw new Error("Unsupported geography format");
  }

  const entries = Object.entries(raw.objects || {});

  const entry =
    entries.find(([name]) => /cbsa/i.test(name)) ||
    entries.find(([, obj]) =>
      obj.type === "GeometryCollection"
    ) ||
    entries[0];

  if (!entry) {
    throw new Error("CBSA geography not found");
  }

  const result = topojson.feature(raw, entry[1]);

  return result.type === "FeatureCollection"
    ? result
    : {
        type: "FeatureCollection",
        features: [result]
      };
}

function fixWinding(feature) {
  const geometry = feature.geometry;
  if (!geometry) return;

  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  for (const polygon of polygons) {
    const area = d3.geoArea({
      type: "Polygon",
      coordinates: polygon
    });

    if (area > 2 * Math.PI) {
      polygon.forEach(ring => ring.reverse());
    }
  }
}


// Map initialization


async function start() {
  const [csv, raw2020, raw2024, usa] =
    await Promise.all([
      d3.csv(
        "data/acs_metro_web_with_comparability.csv"
      ),

      d3.json(
        "data/cb_2020_us_cbsa_5m.json"
      ),

      d3.json(
        "data/cb_2024_us_cbsa_5m.json"
      ),

      d3.json(
        "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"
      )
    ]);

  const geo2020 = asGeoJSON(raw2020);
  const geo2024 = asGeoJSON(raw2024);

  geo2020.features.forEach(fixWinding);
  geo2024.features.forEach(fixWinding);

  const geos = {
    2021: geo2020,
    2022: geo2020,
    2023: geo2024,
    2024: geo2024
  };

 
  // ACS rows by year
 

  const dataByYear = new Map();

  for (const year of [2021, 2022, 2023, 2024]) {
    dataByYear.set(
      year,
      new Map(
        csv
          .filter(d => Number(d.year) === year)
          .map(d => [
            getCode(d.cbsa_code),
            d
          ])
      )
    );
  }

  const rowFor = (year, id) =>
    dataByYear.get(year)?.get(id);

 
  // Consistent color scales
 

  const ranges = {};

  for (const key of Object.keys(metrics)) {
    const values = csv
      .map(row => metricValue(row, key))
      .filter(v => v !== null)
      .sort(d3.ascending);

    if (!values.length) {
      throw new Error("No valid values for " + key);
    }

    let min = d3.quantileSorted(values, 0.05);
    let max = d3.quantileSorted(values, 0.95);

    let scale;

    if (key === "gap") {
      const distances = values
        .map(Math.abs)
        .sort(d3.ascending);

      const bound = Math.max(
        5,
        d3.quantileSorted(distances, 0.95)
      );

      min = -bound;
      max = bound;

      // scale = d3.scaleDiverging(
      //   t => d3.interpolateRdBu(1 - t)
      // )
      //   .domain([min, 0, max])
      //   .clamp(true);
      scale = d3.scaleSequential(d3.interpolateBlues)
        .domain([min, max])
        .clamp(true);

    } else {
      if (max <= min) max = min + 1;

      scale = d3.scaleSequential(
        metrics[key].palette
      )
        .domain([min, max])
        .clamp(true);
    }

    ranges[key] = { min, max, scale };
  }

 
  // Geography
 

  const nation = topojson.feature(
    usa,
    usa.objects.nation
  );

  const states = topojson.feature(
    usa,
    usa.objects.states
  ).features;

  const projection = d3.geoAlbersUsa()
    .fitExtent(
      [[30, 30], [1020, 615]],
      nation
    );

  const path = d3.geoPath(projection);

  const stateLayer = mapSvg.append("g");
  const metroLayer = mapSvg.append("g");
  const borderLayer = mapSvg.append("g");
  const labelLayer = mapSvg.append("g");

  const selectionLayer = mapSvg.append("g")
    .attr("pointer-events", "none");

  const hoverLayer = mapSvg.append("g")
    .attr("pointer-events", "none");

  stateLayer.selectAll("path")
    .data(states)
    .join("path")
    .attr("class", "state")
    .attr("d", path);

  borderLayer.append("path")
    .datum(
      topojson.mesh(
        usa,
        usa.objects.states,
        (a, b) => a !== b
      )
    )
    .attr("class", "state-border")
    .attr("d", path);

 
  // State labels
 

  const candidates = states
    .map(feature => {
      const [x, y] = path.centroid(feature);

      return {
        x,
        y,
        area: path.area(feature),
        abbr: stateAbbr[
          String(feature.id).padStart(2, "0")
        ]
      };
    })
    .filter(d =>
      d.abbr &&
      d.area >= 180 &&
      Number.isFinite(d.x) &&
      Number.isFinite(d.y)
    )
    .sort((a, b) => b.area - a.area);

  const placed = [];

  for (const candidate of candidates) {
    const overlap = placed.some(other =>
      Math.abs(candidate.x - other.x) < 22 &&
      Math.abs(candidate.y - other.y) < 15
    );

    if (!overlap) placed.push(candidate);
  }

  labelLayer.selectAll("text")
    .data(placed)
    .join("text")
    .attr("class", "state-label")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.abbr);

  let visibleFeatures = [];
  let hovered = null;

 
  // Highlight outlines
 

  function drawHalo(layer, feature, hover = false) {
    layer.append("path")
      .datum(feature)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "white")
      .attr("stroke-width", hover ? 5 : 7)
      .attr("stroke-linejoin", "round");

    layer.append("path")
      .datum(feature)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", MAP_ORANGE)
      .attr("stroke-width", hover ? 3 : 3.6)
      .attr(
        "stroke-dasharray",
        hover ? "5,3" : null
      )
      .attr("stroke-linejoin", "round");

    // Additional marker for small metros.
    if (path.area(feature) < 60) {
      const [x, y] = path.centroid(feature);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        layer.append("circle")
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", hover ? 7.5 : 6)
          .attr("fill", hover ? "none" : MAP_ORANGE)
          .attr(
            "stroke",
            hover ? MAP_ORANGE : "white"
          )
          .attr("stroke-width", 2.2)
          .attr(
            "stroke-dasharray",
            hover ? "3,2" : null
          );
      }
    }
  }

  function mapHover(id) {
    hovered = getCode(id);

    hoverLayer.selectAll("*").remove();

    if (!hovered) return;

    const feature = visibleFeatures.find(
      f => getCode(f.properties.GEOID) === hovered
    );

    if (feature) {
      drawHalo(hoverLayer, feature, true);
    }
  }

  window.mapHover = mapHover;

  function updateSelection() {
    const selected = new Set(state.selectedMetros);

    d3.select("#selection")
      .style(
        "display",
        selected.size ? "flex" : "none"
      );

    d3.select("#selected-name")
      .text(
        selected.size === 1
          ? (
              rowFor(
                state.year,
                state.selectedMetros[0]
              )?.metro_name ||
              state.selectedMetros[0]
            )
          : `${selected.size} metros selected`
      );

    // Preserve original choropleth colors.
    metroLayer.selectAll(".metro")
      .classed("selected", false)
      .classed("comparison-metro", false)
      .classed("multi-selected", false)
      .style("stroke", "#ffffff", "important")
      .style("stroke-width", "0.5px", "important");

    selectionLayer.selectAll("*").remove();

    for (const feature of visibleFeatures) {
      if (
        selected.has(
          getCode(feature.properties.GEOID)
        )
      ) {
        drawHalo(selectionLayer, feature);
      }
    }

    mapHover(hovered);
  }

 
  // Tooltip
 

  function showTooltip(event, feature) {
    const id = getCode(feature.properties.GEOID);
    const row = rowFor(state.year, id);

    d3.select("#tip-name")
      .text(
        row?.metro_name ||
        feature.properties.NAME ||
        id
      );

    d3.select("#tip-meta")
      .text(`${state.year} · CBSA ${id}`);

    for (const key of Object.keys(metrics)) {
      d3.select("#tip-" + key)
        .text(
          formatMetric(
            metricValue(row, key),
            metrics[key].type
          )
        );
    }

    const comparable = String(
      row?.trend_comparable ?? ""
    ).trim().toLowerCase();

    const yes =
      comparable === "true" ||
      comparable === "1";

    const no =
      comparable === "false" ||
      comparable === "0";

    d3.select("#tip-comparable")
      .text(
        yes
          ? "2021–2024 trend: Comparable"
          : no
            ? "2021–2024 trend: Not strictly comparable"
            : "2021–2024 trend: Unknown"
      );

    d3.select("#trend-icon")
      .text(yes ? "✓" : no ? "!" : "?")
      .classed("warning", no)
      .classed("unknown", !yes && !no);

    mapTooltip.style("display", "block");

    const node = mapTooltip.node();

    let left = event.clientX + 15;
    let top = event.clientY + 15;

    if (left + node.offsetWidth > window.innerWidth - 8) {
      left = event.clientX - node.offsetWidth - 15;
    }

    if (top + node.offsetHeight > window.innerHeight - 8) {
      top = event.clientY - node.offsetHeight - 15;
    }

    mapTooltip
      .style("left", Math.max(8, left) + "px")
      .style("top", Math.max(8, top) + "px");
  }

  function hideTooltip() {
    mapTooltip.style("display", "none");
  }


  // Map legend
 

  function updateLegend() {
    const info = metrics[state.metric];

    const { min, max, scale } =
      ranges[state.metric];

    const stops = d3.range(41).map(i => {
      const t = i / 40;

      return (
        scale(min + t * (max - min)) +
        " " + t * 100 + "%"
      );
    });

    d3.select("#legend-title")
      .text(info.label);

    d3.select("#legend-gradient")
      .style(
        "background",
        `linear-gradient(to right,${stops.join(",")})`
      );

    d3.select("#legend-min")
      .text(shortMetric(min, info.type));

    d3.select("#legend-mid")
      .text(
        shortMetric((min + max) / 2, info.type)
      );

    d3.select("#legend-max")
      .text(shortMetric(max, info.type));

    d3.select("#legend-note")
      .text(
        state.metric === "gap"
          ? "Light blue: owner burden higher (−) · Dark blue: renter burden higher (+)"
          : "Same color scale across all four years."
      );
  }

 
  // Draw map
 

  function updateMap() {
    const yearData = dataByYear.get(state.year);

    visibleFeatures = geos[state.year].features
      .filter(feature =>
        yearData.has(
          getCode(feature.properties?.GEOID)
        )
      );

    hideTooltip();

    metroLayer.selectAll("path.metro")
      .data(
        visibleFeatures,
        d => getCode(d.properties.GEOID)
      )
      .join("path")
      .attr("class", "metro")
      .attr("d", path)
      .style("fill", feature => {
        const id = getCode(
          feature.properties.GEOID
        );

        const value = metricValue(
          rowFor(state.year, id),
          state.metric
        );

        return value === null
          ? "#cbd0d6"
          : ranges[state.metric].scale(value);
      }, "important")

      .on("mousemove", showTooltip)

      .on("mouseenter", (event, feature) => {
        window.hoverMetro?.(
          getCode(feature.properties.GEOID),
          "map"
        );
      })

      .on("mouseleave", () => {
        hideTooltip();
        window.hoverMetro?.(null, "map");
      })

      .on("click", (event, feature) => {
        event.stopPropagation();

        window.handleMetroClick?.(
          getCode(feature.properties.GEOID),
          event,
          "map"
        );
      });

    updateSelection();
    updateLegend();

    d3.select("#map-heading")
      .text(
        `${metrics[state.metric].label} · ${state.year}`
      );

    const validCount = visibleFeatures
      .filter(feature =>
        metricValue(
          rowFor(
            state.year,
            getCode(feature.properties.GEOID)
          ),
          state.metric
        ) !== null
      ).length;

    d3.select("#status")
      .text(
        `${state.year}: ${visibleFeatures.length} Metro areas · ` +
        `${validCount} valid values · ` +
        `${visibleFeatures.length - validCount} missing`
      );
  }

  
  // Brush + Click + Hover
  

  let brushLabel = d3.select("#map-brush-label");

  if (brushLabel.empty()) {
    const container =
      !d3.select(".map-options").empty()
        ? d3.select(".map-options")
        : d3.select(".map-card");

    brushLabel = container.append("label")
      .attr("id", "map-brush-label")
      // .style("display", "inline-flex")
      .style("display", "none")
      .style("align-items", "center")
      .style("gap", "7px")
      .style("margin-left", "14px")
      .style("cursor", "pointer");

    brushLabel.append("input")
      .attr("id", "map-brush-toggle")
      .attr("type", "checkbox");

    brushLabel.append("span")
      .text("Brush Select");
  }

  const brushInput =
    d3.select("#map-brush-toggle");

  // Default ON.
  brushInput.property("checked", true);

  const viewBox = mapSvg.attr("viewBox");

  const viewValues = viewBox
    ? viewBox.trim().split(/[\s,]+/).map(Number)
    : [0, 0, 1050, 650];

  const [vx, vy, vw, vh] =
    viewValues.length === 4
      ? viewValues
      : [0, 0, 1050, 650];

  let blockClickUntil = 0;

  const brush = d3.brush()
    .extent([
      [vx, vy],
      [vx + vw, vy + vh]
    ])

    // Let our shared coordinator handle
    // Shift, Ctrl, Option and Command.
    .keyModifiers(false)

    // Allow modifier + mouse drag.
    .filter(event => event.button === 0)

    .on("end.map", event => {
      if (!event.sourceEvent || !event.selection) {
        return;
      }

      const [[x0, y0], [x1, y1]] =
        event.selection;

      brushLayer.call(brush.move, null);

      if (x1 - x0 < 5 || y1 - y0 < 5) {
        return;
      }

      blockClickUntil = Date.now() + 180;

      // Use projected metro representative points.
      const matched = visibleFeatures
        .filter(feature => {
          const [px, py] = path.centroid(feature);

          return (
            Number.isFinite(px) &&
            Number.isFinite(py) &&
            px >= x0 &&
            px <= x1 &&
            py >= y0 &&
            py <= y1
          );
        })
        .map(feature =>
          getCode(feature.properties.GEOID)
        );

      window.handleMetroBrush?.(
        matched,
        event.sourceEvent,
        "map-brush"
      );
    });

  const brushLayer = mapSvg.append("g")
    .attr("class", "map-brush")
    .call(brush);

  brushLayer.selectAll(".selection")
    .attr("fill", "#3281b9")
    .attr("fill-opacity", 0.13)
    .attr("stroke", "#3281b9")
    .attr("stroke-dasharray", "5,4");

  // The brush overlay covers the metro paths.
  // Look beneath the overlay to identify the metro.
  function featureUnderPointer(event) {
    const node = document
      .elementsFromPoint(
        event.clientX,
        event.clientY
      )
      .find(element =>
        element.matches?.("path.metro") &&
        mapSvg.node().contains(element)
      );

    return node
      ? d3.select(node).datum()
      : null;
  }

  const brushOverlay =
    brushLayer.select(".overlay");

  brushOverlay
    .on("mousemove.mapPreview", event => {
      if (event.buttons !== 0) {
        hideTooltip();
        window.hoverMetro?.(null, "map");
        return;
      }

      const feature = featureUnderPointer(event);

      if (feature) {
        showTooltip(event, feature);

        window.hoverMetro?.(
          getCode(feature.properties.GEOID),
          "map"
        );
      } else {
        hideTooltip();
        window.hoverMetro?.(null, "map");
      }
    })

    .on("mouseleave.mapPreview", () => {
      hideTooltip();
      window.hoverMetro?.(null, "map");
    })

    .on("click.mapSelect", event => {
      if (
        event.defaultPrevented ||
        Date.now() < blockClickUntil
      ) {
        return;
      }

      const feature = featureUnderPointer(event);

      if (!feature) return;

      event.stopPropagation();

      window.handleMetroClick?.(
        getCode(feature.properties.GEOID),
        event,
        "map"
      );
    });

  function updateBrushMode() {
    brushLayer.style(
      "display",
      brushInput.property("checked")
        ? null
        : "none"
    );

    if (!brushInput.property("checked")) {
      brushLayer.call(brush.move, null);
    }

    hideTooltip();
  }

  brushInput.on(
    "change.map",
    updateBrushMode
  );

  updateBrushMode();

 
  // Original controls
 

  d3.select("#year-select")
    .on("change", function() {
      state.year = Number(this.value);

      updateMap();

      events.call("yearchange", null, {
        year: state.year,
        source: "map"
      });
    });

  d3.select("#metric-select")
    .on("change", function() {
      state.metric = this.value;

      updateMap();

      events.call("metricchange", null, {
        metric: state.metric,
        source: "map"
      });
    });

  d3.select("#show-labels")
    .on("change", function() {
      labelLayer.style(
        "display",
        this.checked ? null : "none"
      );
    });

  d3.select("#clear-selection")
    .on("click", () => {
      window.clearSelectedMetros?.("map");
    });

 
  // Cross-view selection
 

  events.on("selectionchange.map", detail => {
    if (!detail) return;

    state.selectedMetros =
      Array.isArray(detail.selectedMetros)
        ? [...detail.selectedMetros]
        : [
            detail.cbsa,
            detail.compare
          ].filter(Boolean);

    state.cbsa = state.selectedMetros[0] || null;
    state.compare = state.selectedMetros[1] || null;

    updateSelection();
  });

  // Preserve selections that happened
  // before map geography finished loading.
  if (window.dashboardState) {
    state.year = window.dashboardState.year;

    state.selectedMetros = [
      ...(window.dashboardState.selectedMetros || [])
    ];

    state.cbsa = state.selectedMetros[0] || null;
    state.compare = state.selectedMetros[1] || null;
  }

  state.metric =
    d3.select("#metric-select").property("value") ||
    "renter";

  labelLayer.style(
    "display",
    d3.select("#show-labels").property("checked")
      ? null
      : "none"
  );

  updateMap();
}

start().catch(error => {
  console.error("Map error:", error);

  d3.select("#status")
    .text("Error: " + error.message);
});
