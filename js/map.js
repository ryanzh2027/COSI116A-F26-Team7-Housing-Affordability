
/*
 * Map interactions: click, pan, brush select, and zoom area.
 * Modifier clicks and brushes preserve multi-selection.
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

// Utilities

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

      scale = d3.scaleDiverging(
        t => d3.interpolateRdBu(1 - t)
      )
        .domain([min, 0, max])
        .clamp(true);

      // scale = d3.scaleSequential(d3.interpolateBlues)
      //   .domain([min, max])
      //   .clamp(true);

      // scale = d3.scaleDiverging(
      //   d3.piecewise(d3.interpolateRgb, [
      //     "#6b57a8",
      //     "#f0f2f5",
      //     "#087f8c"
      //   ])
      // )
      //   .domain([min, 0, max])
      //   .clamp(true);

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

  const mapContent = mapSvg.append("g")
    .attr("class", "map-zoom-content");

  let mapTransform = d3.zoomIdentity;

  const stateLayer = mapContent.append("g");
  const metroLayer = mapContent.append("g");
  const borderLayer = mapContent.append("g");
  const labelLayer = mapContent.append("g");

  const selectionLayer = mapContent.append("g")
    .attr("pointer-events", "none");

  const hoverLayer = mapContent.append("g")
    .attr("pointer-events", "none");

  stateLayer.selectAll("path")
    .data(states)
    .join("path")
    .attr("class", "state")
    .attr("d", path)
    .attr("vector-effect", "non-scaling-stroke");

  borderLayer.append("path")
    .datum(
      topojson.mesh(
        usa,
        usa.objects.states,
        (a, b) => a !== b
      )
    )
    .attr("class", "state-border")
    .attr("d", path)
    .attr("vector-effect", "non-scaling-stroke");

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

  const firstStateLabel =
    labelLayer.select(".state-label").node();

  const stateLabelFontSize = firstStateLabel
    ? parseFloat(
        window.getComputedStyle(firstStateLabel).fontSize
      ) || 11
    : 11;

  let visibleFeatures = [];
  let hovered = null;

  // Highlight outlines

  function drawHalo(layer, feature, hover = false) {
    layer.append("path")
      .datum(feature)
      .attr("d", path)
      .attr("fill", "none")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke", "white")
      .attr("stroke-width", hover ? 5 : 7)
      .attr("stroke-linejoin", "round");

    layer.append("path")
      .datum(feature)
      .attr("d", path)
      .attr("fill", "none")
      .attr("vector-effect", "non-scaling-stroke")
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
        const radius = hover ? 7.5 : 6;

        layer.append("circle")
          .attr("class", "metro-halo-marker")
          .attr("data-base-radius", radius)
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", radius / mapTransform.k)
          .attr("vector-effect", "non-scaling-stroke")
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

    // d3.select("#legend-note")
    //   .text(
    //     state.metric === "gap"
    //       ? "Owner burden higher | 0 pp | Renter burden higher"
    //       : "Same color scale across all four years."
    //   );

    const legendNote = d3.select("#legend-note");

    if (state.metric === "gap") {
      legendNote
        .classed("gap-legend-note", true)
        .html(`
          <span>Owner burden higher</span>
          <span>Equal burden</span>
          <span>Renter burden higher</span>
        `);
    } else {
      legendNote
        .classed("gap-legend-note", false)
        .text("Same color scale across all four years.");
    }
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
      .attr("vector-effect", "non-scaling-stroke")
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
        if (
          event.defaultPrevented ||
          Date.now() < blockClickUntil
        ) return;

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

  brushInput.property("checked", false);

  const viewBox = mapSvg.attr("viewBox");

  const viewValues = viewBox
    ? viewBox.trim().split(/[\s,]+/).map(Number)
    : [0, 0, 1050, 650];

  const [vx, vy, vw, vh] =
    viewValues.length === 4
      ? viewValues
      : [0, 0, 1050, 650];

  let blockClickUntil = 0;
  let interactionMode = "pan";

  const brush = d3.brush()
    .extent([
      [vx, vy],
      [vx + vw, vy + vh]
    ])

    // Let our shared coordinator handle
    // Shift, Ctrl, Option and Command.
    .keyModifiers(false)

    // Allow modifier + mouse drag.
    .filter(event =>
      event.button === 0 && interactionMode !== "pan"
    )

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

      if (interactionMode === "zoom-area") {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const [bx, by] = mapTransform.invert([cx, cy]);

        const targetK = Math.min(
          8,
          Math.max(
            mapTransform.k,
            mapTransform.k * 0.9 * Math.min(
              vw / (x1 - x0),
              vh / (y1 - y0)
            )
          )
        );

        const targetTransform = d3.zoomIdentity
          .translate(
            vx + vw / 2 - targetK * bx,
            vy + vh / 2 - targetK * by
          )
          .scale(targetK);

        setMode("pan");

        mapSvg.call(
          zoom.transform,
          zoom.constrain()(
            targetTransform,
            [[vx, vy], [vx + vw, vy + vh]],
            [[vx, vy], [vx + vw, vy + vh]]
          )
        );
        return;
      }

      const matched = visibleFeatures
        .filter(feature => {
          const center = path.centroid(feature);

          if (!center.every(Number.isFinite)) {
            return false;
          }

          const [px, py] =
            mapTransform.apply(center);

          return (
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

  // Look beneath the brush overlay.
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
      ) return;

      event.stopPropagation();

      const feature = featureUnderPointer(event);

      if (!feature) {
        window.clearSelectedMetros?.("map-background");
        return;
      }

      if (interactionMode === "brush") {
        window.handleMetroClick?.(
          getCode(feature.properties.GEOID),
          event,
          "map"
        );
      }
    });

  function updateBrushMode() {
    const active = interactionMode !== "pan";

    brushInput.property("checked", active);
    brushLayer.style(
      "display",
      active ? null : "none"
    );

    if (!active) {
      brushLayer.call(brush.move, null);
    }

    hideTooltip();
  }

  brushInput.on("change.map", function() {
    setMode(this.checked ? "brush" : "pan");
  });

  updateBrushMode();

  // Pan and zoom

  let panStartTransform = null;

  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .clickDistance(3)
    .extent([
      [vx, vy],
      [vx + vw, vy + vh]
    ])
    .translateExtent([
      [vx, vy],
      [vx + vw, vy + vh]
    ])
    .filter(event => {
      if (event.type === "wheel") {
        return event.ctrlKey || event.metaKey;
      }

      return (
        event.type === "mousedown" &&
        event.button === 0 &&
        interactionMode === "pan"
      );
    })
    .on("start.map", event => {
      panStartTransform =
        event.sourceEvent?.type === "mousedown"
          ? event.transform
          : null;

      hideTooltip();
    })
    .on("zoom.map", event => {
      mapTransform = event.transform;

      mapContent.attr(
        "transform",
        mapTransform
      );

      mapContent
        .selectAll("circle.metro-halo-marker")
        .attr("r", function() {
          return Number(
            this.getAttribute("data-base-radius")
          ) / mapTransform.k;
        });

      labelLayer
        .selectAll(".state-label")
        .style(
          "font-size",
          (stateLabelFontSize / mapTransform.k) + "px"
        );
    })
    .on("end.map", event => {
      if (
        panStartTransform &&
        event.sourceEvent?.type === "mouseup"
      ) {
        const delta = Math.hypot(
          event.transform.x - panStartTransform.x,
          event.transform.y - panStartTransform.y
        );

        if (delta > 3) {
          blockClickUntil = Date.now() + 180;
        }
      }

      panStartTransform = null;
    });

  mapSvg.call(zoom)
    .on("dblclick.zoom", null);

  // Clear selection only on background clicks.
  mapSvg.on("click.clearSelection", event => {
    if (
      event.defaultPrevented ||
      Date.now() < blockClickUntil ||
      event.target.closest?.(".map-zoom-controls") ||
      event.target.matches?.("path.metro")
    ) return;

    window.clearSelectedMetros?.("map-background");
  });



  // Map controls

  let AUTO_HIDE_MAP_TOOLS = true;

  let toolsOpen = !AUTO_HIDE_MAP_TOOLS;
  let searchOpen = false;

  const zoomButtons = [
    {
      mode: "pan",
      icon: "pan",
      tip: "Drag to move"
    },
    {
      mode: "brush",
      icon: "select",
      tip: "Drag to select metros"
    },
    {
      mode: "zoom-area",
      icon: "area",
      tip: "Drag to zoom"
    },
    {
      icon: "plus",
      tip: "Zoom in",
      action: () => mapSvg.call(zoom.scaleBy, 1.6)
    },
    {
      icon: "minus",
      tip: "Zoom out",
      action: () => mapSvg.call(zoom.scaleBy, 1 / 1.6)
    },
    {
      icon: "reset",
      tip: "Reset map view",
      action: () => mapSvg.call(
        zoom.transform,
        d3.zoomIdentity
      )
    },
    {
      icon: "search",
      tip: "Search metros"
    },
    {
      icon: "auto-hide",
      tip: "Auto-hide tools"
    }
  ];

  const iconPaths = {
    pan: [
      "M8 13V6a2 2 0 0 1 4 0v6",
      "M12 12a2 2 0 0 1 4 0v1",
      "M16 12a2 2 0 0 1 4 0v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-4.5-2L3 15a2 2 0 0 1 3-2.5L8 14"
    ],
    select: [
      "M5 3l14 9-7 1-3 7z"
    ],
    area: [
      "M4 9V4h5",
      "M15 4h5v5",
      "M20 15v5h-5",
      "M9 20H4v-5"
    ],
    plus: [
      "M12 5v14",
      "M5 12h14"
    ],
    minus: [
      "M5 12h14"
    ],
    reset: [
      "M3 11a9 9 0 1 1 2.2 6",
      "M3 4v7h7"
    ],
    search: [
      "M11 19a8 8 0 1 0 0-16a8 8 0 0 0 0 16",
      "M16.5 16.5L21 21"
    ],
    tools: [
      "M4 7h8",
      "M16 7h4",
      "M4 17h4",
      "M12 17h8",
      "M14 4v6",
      "M10 14v6"
    ]
  };

  const buttonSize = 30;
  const buttonStep = 33;
  const toggleY = zoomButtons.length * buttonStep;

  const toolbarHeight = AUTO_HIDE_MAP_TOOLS
    ? toggleY + buttonSize
    : toggleY - buttonStep + buttonSize;

  const zoomControls = mapSvg.append("g")
    .attr("class", "map-zoom-controls")
    .attr(
      "transform",
      `translate(
        ${vx + vw - buttonSize - 18},
        ${vy + vh - toolbarHeight - 14}
      )`
    );

  const backdrop = zoomControls.append("rect")
    .attr("x", -3)
    .attr("y", -3)
    .attr("width", buttonSize + 6)
    .attr("height", toolbarHeight + 6)
    .attr("rx", 8)
    .attr("fill", "#ffffff")
    .attr("fill-opacity", 0.94)
    .attr("stroke", "#d6e0eb");

  const toolList = zoomControls.append("g");

  function addIcon(parent, name) {

    if (name === "auto-hide") {
      const group = parent.append("g")
        .attr("class", "tool-icon")
        .attr("pointer-events", "none");

      group.append("rect")
        .attr("class", "auto-hide-track")
        .attr("x", 4)
        .attr("y", 10)
        .attr("width", 22)
        .attr("height", 11)
        .attr("rx", 5.5);

      group.append("circle")
        .attr("class", "auto-hide-knob")
        .attr("cy", 15.5)
        .attr("r", 4)
        .attr("fill", "#ffffff");

      return group;
    }

    const group = parent.append("g")
      .attr("class", "tool-icon")
      .attr("transform", "translate(5,5) scale(0.84)")
      .attr("fill", "none")
      .attr("stroke", "#24354e")
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("pointer-events", "none");

    for (const d of iconPaths[name]) {
      group.append("path").attr("d", d);
    }

    return group;
  }

  const controls = toolList
    .selectAll("g.map-zoom-button")
    .data(zoomButtons)
    .join("g")
    .attr("class", "map-zoom-button")
    .attr(
      "transform",
      (d, i) => `translate(0, ${i * buttonStep})`
    )
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", d => d.tip)
    .style("cursor", "pointer")
    .on("mousedown", event => {
      event.stopPropagation();
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      runTool(d);
    })
    .on("keydown", (event, d) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      runTool(d);
    })

    .on("mouseenter", (event, d) => {
      const i = zoomButtons.indexOf(d);

      const label = d.icon === "auto-hide"
        ? `Auto-hide: ${AUTO_HIDE_MAP_TOOLS ? "On" : "Off"}`
        : d.tip;

      showHint(
        label,
        i * buttonStep + buttonSize / 2
      );
    })

    .on("mouseleave", hideHint);

  controls.append("rect")
    .attr("width", buttonSize)
    .attr("height", buttonSize)
    .attr("rx", 6)
    .attr("stroke-width", 1);

  controls.each(function(d) {
    addIcon(d3.select(this), d.icon);
  });

  const toggle = zoomControls.append("g")
    .attr("transform", `translate(0, ${toggleY})`)
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", "Map tools")
    .style("cursor", "pointer")
    .style(
      "display",
      AUTO_HIDE_MAP_TOOLS ? null : "none"
    )
    .on("mousedown", event => {
      event.stopPropagation();
    })
    .on("click", event => {
      event.stopPropagation();
      toolsOpen = !toolsOpen;
      paintModeButtons();
    })
    .on("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      toolsOpen = !toolsOpen;
      paintModeButtons();
    })
    .on("mouseenter", () => {
      const modeNames = {
        pan: "Pan",
        brush: "Select",
        "zoom-area": "Zoom"
      };

      showHint(
        "Tools · " + modeNames[interactionMode],
        toggleY + buttonSize / 2
      );
    })
    .on("mouseleave", hideHint);

  toggle.append("rect")
    .attr("width", buttonSize)
    .attr("height", buttonSize)
    .attr("rx", 6)
    .attr("fill", "#ffffff")
    .attr("stroke", "#94a9c0");

  addIcon(toggle, "tools");

  const hint = zoomControls.append("g")
    .attr("pointer-events", "none")
    .style("display", "none");

  const hintRect = hint.append("rect")
    .attr("height", 24)
    .attr("rx", 5)
    .attr("fill", "#24354e");

  const hintText = hint.append("text")
    .attr("x", 8)
    .attr("y", 16)
    .attr("font-family", "Arial, sans-serif")
    .attr("font-size", 11)
    .attr("fill", "#ffffff");

  function showHint(label, centerY) {
    hint.style("display", null);
    hintText.text(label);

    const width =
      hintText.node().getComputedTextLength() + 16;

    hintRect.attr("width", width);

    hint.attr(
      "transform",
      `translate(${-width - 12}, ${centerY - 12})`
    );
  }

  function hideHint() {
    hint.style("display", "none");
  }

  function paintModeButtons() {

    const currentHeight = AUTO_HIDE_MAP_TOOLS
      ? toggleY + buttonSize
      : toggleY - buttonStep + buttonSize;

    zoomControls.attr(
      "transform",
      `translate(
        ${vx + vw - buttonSize - 18},
        ${vy + vh - currentHeight - 14}
      )`
    );

    backdrop.attr("height", currentHeight + 6);

    toggle.style(
      "display",
      AUTO_HIDE_MAP_TOOLS ? null : "none"
    );

    const showTools =
      !AUTO_HIDE_MAP_TOOLS || toolsOpen || searchOpen;

    toolList.style(
      "display",
      showTools ? null : "none"
    );

    backdrop.style(
      "display",
      showTools ? null : "none"
    );

    controls.select("rect")
      .attr("fill", d =>
        d.mode === interactionMode ||
        (d.icon === "search" && searchOpen)
          ? "#e7f0fa"
          : "#ffffff"
      )
      .attr("stroke", d =>
        d.mode === interactionMode ||
        (d.icon === "search" && searchOpen)
          ? "#4479ac"
          : "#cbd5e1"
      );

    controls.select(".tool-icon")
      .attr("stroke", d =>
        d.mode === interactionMode
          ? "#315f99"
          : "#24354e"
      );
    
  controls.filter(d => d.icon === "auto-hide")
    .select(".auto-hide-track")
    .attr(
      "fill",
      AUTO_HIDE_MAP_TOOLS ? "#4479ac" : "#cbd5e1"
    );

  controls.filter(d => d.icon === "auto-hide")
    .select(".auto-hide-knob")
    .attr(
      "cx",
      AUTO_HIDE_MAP_TOOLS ? 19 : 11
    );

  controls.filter(d => d.icon === "auto-hide")
    .attr(
      "aria-pressed",
      String(AUTO_HIDE_MAP_TOOLS)
    );

  }

  function setMode(nextMode) {
    if (nextMode === interactionMode) return;

    interactionMode = nextMode;

    updateBrushMode();
    hideTooltip();
    window.hoverMetro?.(null, "map");
    paintModeButtons();
  }

  // Metro search

  const searchPanel = d3.select("body")
    .append("div")
    .attr("class", "map-search-panel")
    .attr("role", "dialog")
    .attr("aria-label", "Search metro areas")
    .style("position", "fixed")
    .style("display", "none")
    .style("width", "270px")
    .style("max-width", "calc(100vw - 16px)")
    .style("box-sizing", "border-box")
    .style("padding", "10px")
    .style("background", "#ffffff")
    .style("border", "1px solid #d6e0eb")
    .style("border-radius", "8px")
    .style("box-shadow", "0 6px 18px rgba(30,55,80,0.14)")
    .style("z-index", "1000");

  const searchInput = searchPanel.append("input")
    .attr("type", "search")
    .attr("placeholder", "Search metro...")
    .attr("aria-label", "Metro name")
    .style("width", "100%")
    .style("box-sizing", "border-box")
    .style("padding", "8px")
    .style("border", "1px solid #cbd5e1")
    .style("border-radius", "5px")
    .style("font", "12px Arial, sans-serif");

  const searchResults = searchPanel.append("div")
    .style("max-height", "220px")
    .style("overflow-y", "auto")
    .style("margin-top", "6px");

  function matchingMetros() {
    const query = searchInput.property("value")
      .trim()
      .toLowerCase();

    if (!query) return [];

    return visibleFeatures
      .map(feature => {
        const id = getCode(feature.properties.GEOID);

        const name =
          rowFor(state.year, id)?.metro_name ||
          feature.properties.NAME ||
          id;

        return { id, name, feature };
      })
      .filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.id.includes(query)
      )
      .sort((a, b) => {
        const aStarts =
          a.name.toLowerCase().startsWith(query);

        const bStarts =
          b.name.toLowerCase().startsWith(query);

        return Number(bStarts) - Number(aStarts) ||
          a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }

  function renderSearchResults() {
    searchResults.selectAll("*").remove();

    const query = searchInput.property("value").trim();
    const matches = matchingMetros();

    if (!query || !matches.length) {
      searchResults.append("div")
        .style("padding", "9px 5px")
        .style("color", "#718096")
        .style("font", "12px Arial, sans-serif")
        .text(
          query ? "No matching metros" : "Enter a metro name"
        );

      return;
    }

    searchResults.selectAll("button")
      .data(matches)
      .join("button")
      .attr("type", "button")
      .attr("title", d => d.name)
      .style("display", "block")
      .style("width", "100%")
      .style("padding", "8px 6px")
      .style("text-align", "left")
      .style("background", "#ffffff")
      .style("border", "none")
      .style("border-bottom", "1px solid #edf1f5")
      .style("font", "12px Arial, sans-serif")
      .style("color", "#24354e")
      .style("cursor", "pointer")
      .style("white-space", "nowrap")
      .style("overflow", "hidden")
      .style("text-overflow", "ellipsis")
      .text(d => d.name)
      .on("mouseenter", function() {
        d3.select(this).style("background", "#f0f5fa");
      })
      .on("mouseleave", function() {
        d3.select(this).style("background", "#ffffff");
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        selectSearchResult(d);
      });
  }

  function selectSearchResult(item) {
    closeSearch();

    window.setSelectedMetros?.(
      [item.id],
      "map-search"
    );

    const bounds = path.bounds(item.feature);
    const [[x0, y0], [x1, y1]] = bounds;

    if (![x0, y0, x1, y1].every(Number.isFinite)) {
      return;
    }

    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const width = Math.max(24, x1 - x0);
    const height = Math.max(24, y1 - y0);

    const k = Math.max(
      2,
      Math.min(
        8,
        0.6 * Math.min(vw / width, vh / height)
      )
    );

    const target = d3.zoomIdentity
      .translate(
        vx + vw / 2 - k * cx,
        vy + vh / 2 - k * cy
      )
      .scale(k);

    const constrained = zoom.constrain()(
      target,
      [[vx, vy], [vx + vw, vy + vh]],
      [[vx, vy], [vx + vw, vy + vh]]
    );

    mapSvg.transition()
      .duration(450)
      .call(zoom.transform, constrained);
  }

  function positionSearch() {
    const searchButton = controls
      .filter(d => d.icon === "search")
      .select("rect")
      .node();

    if (!searchButton) return;

    const rect = searchButton.getBoundingClientRect();
    const panel = searchPanel.node();

    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - width - 8,
        rect.left - width - 10
      )
    );

    const top = Math.max(
      8,
      Math.min(
        window.innerHeight - height - 8,
        rect.bottom - height
      )
    );

    searchPanel
      .style("left", left + "px")
      .style("top", top + "px");
  }

  function openSearch() {
    searchOpen = true;
    toolsOpen = true;

    searchPanel.style("display", "block");
    searchInput.property("value", "");

    renderSearchResults();
    paintModeButtons();
    hideHint();
    positionSearch();

    searchInput.node().focus();
  }

  function closeSearch() {
    searchOpen = false;
    searchPanel.style("display", "none");

    if (AUTO_HIDE_MAP_TOOLS) {
      toolsOpen = false;
    }

    paintModeButtons();
  }

  searchInput
    .on("input", renderSearchResults)
    .on("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }

      if (event.key === "Enter") {
        const first = matchingMetros()[0];

        if (first) {
          event.preventDefault();
          selectSearchResult(first);
        }
      }
    });

  d3.select(document)
    .on("pointerdown.mapSearch", event => {
      if (!searchOpen) return;

      if (
        searchPanel.node().contains(event.target) ||
        zoomControls.node().contains(event.target)
      ) {
        return;
      }

      closeSearch();
    });

  d3.select(window)
    .on("resize.mapSearch", () => {
      if (searchOpen) positionSearch();
    });

  function runTool(d) {

    if (d.icon === "auto-hide") {
      if (searchOpen) closeSearch();

      AUTO_HIDE_MAP_TOOLS = !AUTO_HIDE_MAP_TOOLS;
      toolsOpen = !AUTO_HIDE_MAP_TOOLS;

      hideHint();
      paintModeButtons();
      return;
    }

    if (d.icon === "search") {
      if (searchOpen) {
        closeSearch();
      } else {
        openSearch();
      }

      return;
    }


    if (searchOpen) closeSearch();

    if (d.mode) {
      setMode(d.mode);
    } else {
      d.action();
    }

    paintModeButtons();
  }

  zoomControls
    .on("mouseenter.mapTools", () => {
      if (!AUTO_HIDE_MAP_TOOLS) return;

      toolsOpen = true;
      paintModeButtons();
    })
    .on("mouseleave.mapTools", () => {
      if (!AUTO_HIDE_MAP_TOOLS || searchOpen) return;

      toolsOpen = false;
      hideHint();
      paintModeButtons();
    });

  paintModeButtons();




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
