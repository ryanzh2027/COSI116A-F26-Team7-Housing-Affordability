
/*
 *
 * Controls are defined in index.html.
 * Visual styling is defined in css/linechart.css.
 *
 * Features:
 * - Searchable multi-select metro picker
 * - Linked selection across four charts
 * - National median when no metros selected
 * - Optional median summary of selected metros
 * - Individual lines when summary is disabled
 * - Optional all-metro background trends
 * - Interactive hover and tooltips
 * - Orange / blue indicator colors
 * - Matching dashed hover previews
 * - Auto-scale Y-axis
 *
 * No HTML or CSS is generated here.
 */

(() => {
  "use strict";

 
  // 1. Existing HTML elements
 

  const svg = d3.select("#line-chart");

  const metricInput =
    d3.select("#line-metric-select");

  const contextInput =
    d3.select("#show-context");

  const summaryInput =
    d3.select("#line-median-summary");

  const autoInput =
    d3.select("#auto-scale-y");

  const countLabel =
    d3.select("#line-count");

  const note =
    d3.select("#line-message");

  const legend =
    d3.select(".trend-key");

  const tooltip =
    d3.select("#line-tooltip");

  const pickerField =
    document.querySelector(".trend-metro-field");

  const pickerButton =
    document.getElementById("line-metro-picker-button");

  const pickerMenu =
    document.getElementById("line-metro-picker-menu");

  const pickerSearch =
    document.getElementById("line-metro-picker-search");

  const pickerList =
    document.getElementById("line-metro-picker-list");

  const pickerCount =
    document.getElementById("line-metro-picker-count");

  const pickerClear =
    document.getElementById("line-metro-picker-clear");

  const pickerCaption =
    pickerButton?.querySelector(".line-picker-caption");

  const pickerArrow =
    pickerButton?.querySelector(".line-picker-arrow");

  // Check that the updated HTML is present.
  const required = {
    "#line-chart": svg.node(),
    "#line-metric-select": metricInput.node(),
    "#show-context": contextInput.node(),
    "#line-median-summary": summaryInput.node(),
    "#auto-scale-y": autoInput.node(),
    "#line-count": countLabel.node(),
    "#line-message": note.node(),
    ".trend-key": legend.node(),
    "#line-tooltip": tooltip.node(),
    ".trend-metro-field": pickerField,
    "#line-metro-picker-button": pickerButton,
    "#line-metro-picker-menu": pickerMenu,
    "#line-metro-picker-search": pickerSearch,
    "#line-metro-picker-list": pickerList,
    "#line-metro-picker-count": pickerCount,
    "#line-metro-picker-clear": pickerClear,
    ".line-picker-caption": pickerCaption,
    ".line-picker-arrow": pickerArrow
  };

  const missing = Object.entries(required)
    .filter(([, element]) => !element)
    .map(([selector]) => selector);

  if (missing.length) {
    console.error(
      "Line Chart: missing HTML elements:",
      missing.join(", ")
    );

    return;
  }

 
  // 2. Constants
 

  const W = 800;
  const H = 480;

  const margin = {
    top: 24,
    right: 64,
    bottom: 45,
    left: 77
  };

  const plotWidth =
    W - margin.left - margin.right;

  const plotHeight =
    H - margin.top - margin.bottom;

  const YEARS = [2021, 2022, 2023, 2024];

  const ORANGE = "#e68132";
  const BLUE = "#3281b9";

  function normalize(value) {
    if (
      value == null ||
      String(value).trim() === ""
    ) {
      return null;
    }

    return String(value).trim().padStart(5, "0");
  }

  function valid(value) {
    return (
      typeof value === "number" &&
      Number.isFinite(value)
    );
  }

  function indicatorColor(index) {
    return index === 0 ? ORANGE : BLUE;
  }

 
  // 3. Indicator modes
 

  const modes = {
    burden_compare: {
      label: "Renter vs. Mortgage-Owner Burden",
      unit: "percent",
      indicators: [
        {
          key: "renter_burden_pct",
          label: "Renter burden"
        },
        {
          key: "mortgage_owner_burden_pct",
          label: "Mortgage-owner burden"
        }
      ]
    },

    market_compare: {
      label:
        "Income vs. Home Value — Growth Index (2021 = 100)",
      unit: "index",
      indexed: true,
      indicators: [
        {
          key: "median_household_income",
          label: "Income"
        },
        {
          key: "median_owner_home_value",
          label: "Home value"
        }
      ]
    },

    market_actual: {
      label:
        "Income vs. Home Value — Actual Values ($)",
      unit: "usd",
      indicators: [
        {
          key: "median_household_income",
          label: "Income"
        },
        {
          key: "median_owner_home_value",
          label: "Home value"
        }
      ]
    },

    renter_burden_pct: {
      label: "Renter Burden",
      unit: "percent",
      indicators: [
        {
          key: "renter_burden_pct",
          label: "Renter burden"
        }
      ]
    },

    mortgage_owner_burden_pct: {
      label: "Mortgage-Owner Burden",
      unit: "percent",
      indicators: [
        {
          key: "mortgage_owner_burden_pct",
          label: "Mortgage-owner burden"
        }
      ]
    },

    burden_gap_renter_minus_mortgage_pp: {
      label: "Renter − Owner Burden Gap",
      unit: "pp",
      indicators: [
        {
          key:
            "burden_gap_renter_minus_mortgage_pp",
          label: "Renter − owner burden gap"
        }
      ]
    },

    median_household_income: {
      label: "Median Household Income",
      unit: "usd",
      indicators: [
        {
          key: "median_household_income",
          label: "Median household income"
        }
      ]
    },

    median_owner_home_value: {
      label: "Median Home Value",
      unit: "usd",
      indicators: [
        {
          key: "median_owner_home_value",
          label: "Median home value"
        }
      ]
    }
  };

  // Keep HTML dropdown options.
  // Add only missing options.

  for (const [key, mode] of Object.entries(modes)) {
    const existing = metricInput
      .selectAll("option")
      .filter(function() {
        return this.value === key;
      });

    if (existing.empty()) {
      metricInput.append("option")
        .attr("value", key)
        .text(mode.label);
    }
  }

  if (!modes[metricInput.property("value")]) {
    metricInput.property(
      "value",
      "burden_compare"
    );
  }

 
  // 4. Chart state
 

  let metros = [];

  let byCode = new Map();

  let comparable = [];

  let selected = [];

  let hovered = null;

  let activeYear = 2024;

  let currentMode =
    modes.burden_compare;

  let x = null;
  let y = null;

  let focusLayer = null;
  let hoverLayer = null;

  let hoverExpandedScale = false;

  let menuOpen = false;

  svg
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr(
      "preserveAspectRatio",
      "xMidYMid meet"
    );

  // Tooltip positioning only.
  // Appearance remains in linechart.css.

  tooltip
    .style("position", "fixed", "important")
    .style("pointer-events", "none")
    .style("display", "none");

 
  // 5. Multi-select picker
 

  function updatePickerCaption() {
    const count = selected.length;

    if (count === 0) {
      pickerCaption.textContent =
        "No metros selected";

    } else if (count === 1) {
      pickerCaption.textContent =
        byCode.get(selected[0])?.name ||
        "1 metro selected";

    } else {
      pickerCaption.textContent =
        `${count} metros selected`;
    }

    pickerCount.textContent =
      `${count} selected`;

    pickerClear.disabled =
      count === 0;
  }

  // Do not rebuild checkboxes every time
  // the selected metros change.
  // Only synchronize checked properties.

  function syncPickerChecks() {
    const selectedSet =
      new Set(selected);

    pickerList
      .querySelectorAll(
        'input[type="checkbox"][data-metro-code]'
      )
      .forEach(checkbox => {
        checkbox.checked = selectedSet.has(
          checkbox.dataset.metroCode
        );
      });

    updatePickerCaption();
  }

  function renderPickerOptions() {
    const query = pickerSearch.value
      .trim()
      .toLowerCase();

    const selectedSet =
      new Set(selected);

    const matches = metros.filter(metro =>
      metro.name.toLowerCase().includes(query) ||
      metro.code.includes(query)
    );

    pickerList.replaceChildren();

    if (!matches.length) {
      const message =
        document.createElement("div");

      message.className =
        "line-metro-empty";

      message.textContent =
        "No matching metro areas";

      pickerList.appendChild(message);

      return;
    }

    const fragment =
      document.createDocumentFragment();

    for (const metro of matches) {
      const label =
        document.createElement("label");

      label.className =
        "line-metro-option";

      const checkbox =
        document.createElement("input");

      checkbox.type = "checkbox";

      checkbox.dataset.metroCode =
        metro.code;

      checkbox.checked =
        selectedSet.has(metro.code);

      const title =
        document.createElement("span");

      title.textContent = metro.name;

      // -------------------------------------
      // Actual checkbox selection
      // -------------------------------------

      checkbox.addEventListener("change", () => {
        const next = new Set(selected);

        if (checkbox.checked) {
          next.add(metro.code);
        } else {
          next.delete(metro.code);
        }

        if (
          typeof window.setSelectedMetros !==
          "function"
        ) {
          console.error(
            "Missing window.setSelectedMetros. " +
            "Check visualization.js."
          );
          return;
        }

        // Shared selection triggers all
        // four linked charts to update.
        window.setSelectedMetros(
          [...next],
          "linechart-picker"
        );

        // The picker stays open.
        // The list itself is not rebuilt here.
      });

      label.append(
        checkbox,
        title
      );

      fragment.appendChild(label);
    }

    pickerList.appendChild(fragment);
  }

  function setMenuOpen(open) {
    menuOpen = Boolean(open);

    pickerMenu.hidden = !menuOpen;

    pickerButton.setAttribute(
      "aria-expanded",
      String(menuOpen)
    );

    pickerArrow.textContent =
      menuOpen ? "⌃" : "⌄";

    if (menuOpen) {
      renderPickerOptions();
      pickerSearch.focus();
    }
  }

  pickerButton.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      setMenuOpen(!menuOpen);
    }
  );

  // Keep clicks inside the menu from
  // closing the dropdown.

  pickerMenu.addEventListener(
    "click",
    event => {
      event.stopPropagation();
    }
  );

  pickerSearch.addEventListener(
    "input",
    () => {
      renderPickerOptions();
    }
  );

  pickerClear.addEventListener(
    "click",
    () => {
      window.clearSelectedMetros?.(
        "linechart-picker"
      );
    }
  );

  document.addEventListener(
    "pointerdown",
    event => {
      if (
        menuOpen &&
        !pickerField.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        menuOpen
      ) {
        setMenuOpen(false);
        pickerButton.focus();
      }
    }
  );

  updatePickerCaption();

 
  // 6. Data helpers
 

  function rawValue(metro, year, key) {
    const row = metro?.rows.find(
      d => d.year === year
    );

    const value = row?.[key];

    return valid(value) ? value : null;
  }

  function valueAt(metro, year, indicator) {
    const raw = rawValue(
      metro,
      year,
      indicator.key
    );

    if (raw === null) return null;

    if (!currentMode.indexed) {
      return raw;
    }

    const baseline = rawValue(
      metro,
      2021,
      indicator.key
    );

    if (
      baseline === null ||
      baseline <= 0
    ) {
      return null;
    }

    return 100 * raw / baseline;
  }

  function individualSeries(
    metro,
    indicator
  ) {
    return YEARS.map(year => ({
      year,

      value: valueAt(
        metro,
        year,
        indicator
      ),

      actual: rawValue(
        metro,
        year,
        indicator.key
      )
    }));
  }

  function summarySeries(
    group,
    indicator
  ) {
    return YEARS.map(year => {
      const values = group
        .map(metro =>
          valueAt(
            metro,
            year,
            indicator
          )
        )
        .filter(valid)
        .sort(d3.ascending);

      return {
        year,

        value: values.length
          ? d3.median(values)
          : null,

        q25: values.length
          ? d3.quantileSorted(
              values,
              0.25
            )
          : null,

        q75: values.length
          ? d3.quantileSorted(
              values,
              0.75
            )
          : null,

        count: values.length
      };
    });
  }

  function selectedGroup() {
    return selected
      .map(id => byCode.get(id))
      .filter(Boolean);
  }

  function formatNumber(value) {
    if (!valid(value)) {
      return "No data";
    }

    if (currentMode.unit === "usd") {
      return (
        "$" +
        d3.format(",.0f")(value)
      );
    }

    if (currentMode.unit === "index") {
      return d3.format(".1f")(value);
    }

    return (
      d3.format(".1f")(value) +
      (
        currentMode.unit === "pp"
          ? " pp"
          : "%"
      )
    );
  }

 
  // 7. Build displayed series
 

  function buildSeries() {
    const chosen = selectedGroup();

    // No selection always uses national median.
    // With a selection, respect the checkbox.

    const summarize =
      chosen.length === 0 ||
      summaryInput.property("checked");

    const showAll =
      contextInput.property("checked");

    const chosenCodes = new Set(
      chosen.map(metro => metro.code)
    );

    const main = [];
    const context = [];

    // ---------------------------------------
    // Median summary
    // ---------------------------------------

    if (summarize) {
      const group = chosen.length
        ? chosen
        : metros;

      const name = chosen.length
        ? `${chosen.length} selected metros · median`
        : "All metro areas · median";

      currentMode.indicators.forEach(
        (indicator, index) => {
          main.push({
            code: null,
            name,
            indicator,
            index,

            color:
              indicatorColor(index),

            aggregate: true,
            selected: false,

            points: summarySeries(
              group,
              indicator
            )
          });
        }
      );
    }

    // ---------------------------------------
    // Individual selected metro trends
    // ---------------------------------------

    else {
      for (const metro of chosen) {
        currentMode.indicators.forEach(
          (indicator, index) => {
            main.push({
              code: metro.code,
              name: metro.name,
              indicator,
              index,

              color:
                indicatorColor(index),

              aggregate: false,
              selected: true,

              points: individualSeries(
                metro,
                indicator
              )
            });
          }
        );
      }
    }

    // ---------------------------------------
    // Optional background trends
    // ---------------------------------------

    if (showAll) {
      for (const metro of metros) {
        // Avoid drawing a selected trend
        // twice in individual mode.
        if (
          !summarize &&
          chosenCodes.has(metro.code)
        ) {
          continue;
        }

        currentMode.indicators.forEach(
          (indicator, index) => {
            context.push({
              code: metro.code,
              name: metro.name,
              indicator,
              index,

              color: "#a6b8c9",

              context: true,
              selected: false,
              aggregate: false,

              points: individualSeries(
                metro,
                indicator
              )
            });
          }
        );
      }
    }

    return {
      chosen,
      summarize,
      showAll,
      main,
      context,

      showIQR:
        summarize &&
        (
          chosen.length === 0 ||
          chosen.length > 5
        )
    };
  }

  function linePath(points) {
    return d3.line()
      .defined(
        d => valid(d.value)
      )
      .x(
        d => x(d.year)
      )
      .y(
        d => y(d.value)
      )(points);
  }

 
  // 8. Y-axis scaling
 

  function getDomain(info) {
    let values = [];

    if (autoInput.property("checked")) {
      const entries = [
        ...info.main,
        ...info.context
      ];

      values = entries.flatMap(entry =>
        entry.points.flatMap(point => [
          point.value,

          ...(
            info.showIQR &&
            entry.aggregate
              ? [
                  point.q25,
                  point.q75
                ]
              : []
          )
        ].filter(valid))
      );

      // Include externally hovered metro.
      if (hovered) {
        const metro =
          byCode.get(hovered);

        if (metro) {
          values.push(
            ...currentMode.indicators.flatMap(
              indicator =>
                individualSeries(
                  metro,
                  indicator
                )
                  .map(d => d.value)
                  .filter(valid)
            )
          );
        }
      }

    } else {
      // Full range across available metros.
      values = metros.flatMap(metro =>
        currentMode.indicators.flatMap(
          indicator =>
            individualSeries(
              metro,
              indicator
            )
              .map(d => d.value)
              .filter(valid)
        )
      );
    }

    if (!values.length) {
      return [0, 1];
    }

    const [minimum, maximum] =
      d3.extent(values);

    const padding = Math.max(
      (maximum - minimum) * 0.10,
      currentMode.unit === "usd"
        ? 100
        : 1
    );

    let domain = [
      minimum - padding,
      maximum + padding
    ];

    if (currentMode.unit === "usd") {
      domain = [
        0,
        Math.max(
          1,
          maximum + padding
        )
      ];

    } else if (
      currentMode.unit === "percent"
    ) {
      domain = [
        Math.max(0, domain[0]),
        Math.min(100, domain[1])
      ];

    } else if (
      currentMode.unit === "pp"
    ) {
      domain = [
        Math.min(0, domain[0]),
        Math.max(0, domain[1])
      ];

    } else if (
      currentMode.unit === "index"
    ) {
      domain = [
        Math.max(0, domain[0]),
        Math.max(100, domain[1])
      ];
    }

    if (domain[1] <= domain[0]) {
      domain[1] = domain[0] + 1;
    }

    return domain;
  }

 
  // 9. Compact legend
 

  function addLegendItem(
    label,
    color,
    dashed = false
  ) {
    const item = legend.append("span")
      .attr("class", "trend-legend-item");

    item.append("i")
      .attr("class", "key-line")
      .style(
        "border-top-color",
        color,
        "important"
      )
      .style(
        "border-top-style",
        dashed ? "dashed" : "solid",
        "important"
      )
      .style(
        "border-top-width",
        "3px",
        "important"
      );

    item.append("span")
      .text(label);
  }

  function updateLegend(info) {
    legend.selectAll("*").remove();

    // Colors represent indicators,
    // not individual metro names.
    currentMode.indicators.forEach(
      (indicator, index) => {
        addLegendItem(
          indicator.label,
          indicatorColor(index)
        );
      }
    );

    addLegendItem(
      "Hover: same colors, dashed",
      "#718198",
      true
    );

    if (info.showIQR) {
      legend.append("span")
        .text(
          "Shading = 25th–75th percentile"
        );
    }

    if (info.context.length) {
      legend.append("span")
        .text(
          "Light gray = other metro trends"
        );
    }
  }

 
  // 10. Tooltip
 

  function showTooltip(event, entry) {
    const [px] = d3.pointer(
      event,
      svg.node()
    );

    const closest = YEARS.reduce(
      (best, year) =>
        Math.abs(x(year) - px) <
        Math.abs(x(best) - px)
          ? year
          : best,
      YEARS[0]
    );

    const point = entry.points.find(
      d => d.year === closest
    );

    const actual =
      currentMode.indexed &&
      valid(point?.actual)
        ? (
            " · Actual: $" +
            d3.format(",.0f")(point.actual)
          )
        : "";

    tooltip
      .style("display", "block")
      .text(
        `${entry.name} · ` +
        `${entry.indicator.label} · ` +
        `${closest}: ` +
        `${formatNumber(point?.value)}` +
        actual
      );

    const element = tooltip.node();

    const left = Math.max(
      8,
      Math.min(
        event.clientX + 14,
        window.innerWidth -
          element.offsetWidth - 8
      )
    );

    const top = Math.max(
      8,
      event.clientY -
        element.offsetHeight - 14
    );

    tooltip
      .style("left", left + "px")
      .style("top", top + "px");
  }

  function hideTooltip() {
    tooltip.style(
      "display",
      "none"
    );
  }

 
  // 11. Hover highlight
 

  function paintHover() {
    if (
      !hoverLayer ||
      !x ||
      !y
    ) {
      return;
    }

    hoverLayer.selectAll("*").remove();

    if (focusLayer) {
      focusLayer.selectAll(".focus-line")
        .style(
          "opacity",
          entry => {
            if (
              hovered &&
              entry.code &&
              selected.includes(hovered)
            ) {
              return entry.code === hovered
                ? 1
                : 0.18;
            }

            return entry.baseOpacity;
          },
          "important"
        )
        .style(
          "stroke-width",
          entry =>
            entry.code === hovered
              ? "4px"
              : entry.baseWidth + "px",
          "important"
        );

      focusLayer
        .selectAll(".focus-markers")
        .style(
          "opacity",
          entry =>
            hovered &&
            entry.code &&
            selected.includes(hovered) &&
            entry.code !== hovered
              ? 0.18
              : 1
        );
    }

    const metro =
      byCode.get(hovered);

    if (!metro) return;

    // Orange / blue dashed preview.
    currentMode.indicators.forEach(
      (indicator, index) => {
        const color =
          indicatorColor(index);

        const points =
          individualSeries(
            metro,
            indicator
          );

        hoverLayer.append("path")
          .attr(
            "d",
            linePath(points)
          )
          .style(
            "fill",
            "none",
            "important"
          )
          .style(
            "stroke",
            color,
            "important"
          )
          .style(
            "stroke-width",
            "3.2px",
            "important"
          )
          .style(
            "stroke-dasharray",
            "6,4",
            "important"
          )
          .style(
            "pointer-events",
            "none",
            "important"
          );

        hoverLayer.append("g")
          .selectAll("circle")
          .data(
            points.filter(
              d => valid(d.value)
            )
          )
          .join("circle")
          .attr(
            "cx",
            d => x(d.year)
          )
          .attr(
            "cy",
            d => y(d.value)
          )
          .attr("r", 4.8)
          .attr("fill", "white")
          .attr(
            "stroke",
            color
          )
          .attr(
            "stroke-width",
            2
          )
          .attr(
            "pointer-events",
            "none"
          );
      }
    );
  }


  // 12. Nearest-series calculation
 

  function segmentDistanceSquared(
    px, py,
    ax, ay,
    bx, by
  ) {
    const dx = bx - ax;
    const dy = by - ay;

    const lengthSquared =
      dx * dx + dy * dy;

    if (!lengthSquared) {
      return (
        (px - ax) ** 2 +
        (py - ay) ** 2
      );
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        (
          (px - ax) * dx +
          (py - ay) * dy
        ) / lengthSquared
      )
    );

    const nearestX =
      ax + t * dx;

    const nearestY =
      ay + t * dy;

    return (
      (px - nearestX) ** 2 +
      (py - nearestY) ** 2
    );
  }

  function distanceToSeries(
    px,
    py,
    entry
  ) {
    const points = entry.points
      .filter(
        p => valid(p.value)
      )
      .map(p => ({
        year: p.year,
        x: x(p.year),
        y: y(p.value)
      }));

    if (!points.length) {
      return Infinity;
    }

    let best = Infinity;

    for (const point of points) {
      best = Math.min(
        best,
        (px - point.x) ** 2 +
        (py - point.y) ** 2
      );
    }

    // Connect consecutive available years only.
    for (
      let i = 1;
      i < points.length;
      i++
    ) {
      if (
        points[i].year -
        points[i - 1].year !== 1
      ) {
        continue;
      }

      best = Math.min(
        best,
        segmentDistanceSquared(
          px,
          py,
          points[i - 1].x,
          points[i - 1].y,
          points[i].x,
          points[i].y
        )
      );
    }

    return best;
  }

 
  // 13. Draw chart
 

  function draw() {
    svg.selectAll("*").remove();

    hideTooltip();

    focusLayer = null;
    hoverLayer = null;

    if (!metros.length) return;

    currentMode =
      modes[metricInput.property("value")] ||
      modes.burden_compare;

    const info = buildSeries();

    updateLegend(info);

    x = d3.scalePoint()
      .domain(YEARS)
      .range([
        margin.left,
        W - margin.right
      ]);

    y = d3.scaleLinear()
      .domain(getDomain(info))
      .nice(5)
      .range([
        H - margin.bottom,
        margin.top
      ]);

    // ---------------------------------------
    // Grid
    // ---------------------------------------

    const grid = svg.append("g")
      .attr("class", "trend-grid")
      .attr(
        "transform",
        `translate(${margin.left},0)`
      )
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickSize(-plotWidth)
          .tickFormat("")
      );

    grid.select(".domain").remove();

    // ---------------------------------------
    // Axes
    // ---------------------------------------

    const tick =
      currentMode.unit === "usd"
        ? value =>
            "$" + d3.format("~s")(value)
        : currentMode.unit === "percent"
          ? value =>
              d3.format("~g")(value) + "%"
          : value =>
              d3.format("~g")(value);

    svg.append("g")
      .attr("class", "trend-axis")
      .attr(
        "transform",
        `translate(0,${H - margin.bottom})`
      )
      .call(
        d3.axisBottom(x)
          .tickSizeOuter(0)
      );

    svg.append("g")
      .attr("class", "trend-axis")
      .attr(
        "transform",
        `translate(${margin.left},0)`
      )
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickFormat(tick)
          .tickSizeOuter(0)
      );

    if (currentMode.indexed) {
      svg.append("text")
        .attr("x", margin.left + 3)
        .attr("y", 14)
        .attr("font-size", 11)
        .attr("fill", "#71819a")
        .text("2021 = 100");
    }

    // ---------------------------------------
    // Clip plot area
    // ---------------------------------------

    const clipId =
      "line-chart-plot-clip";


/* Allow endpoint circles to appear fully */

const clipPadding = 10;

    svg.append("defs")
      .append("clipPath")
      .attr("id", "trend-plot-clip-v4")
      .append("rect")
      .attr("x", margin.left - clipPadding)
      .attr("y", margin.top - clipPadding)
      .attr(
        "width",
        W - margin.left - margin.right
          + 2 * clipPadding
      )
      .attr(
        "height",
        H - margin.top - margin.bottom
          + 2 * clipPadding
      );

    const plot = svg.append("g")
      .attr(
        "clip-path",
        `url(#${clipId})`
      );

    // Current map year.
    plot.append("line")
      .attr(
        "class",
        "selected-year-guide"
      )
      .attr(
        "x1",
        x(activeYear)
      )
      .attr(
        "x2",
        x(activeYear)
      )
      .attr(
        "y1",
        margin.top
      )
      .attr(
        "y2",
        H - margin.bottom
      )
      .attr(
        "pointer-events",
        "none"
      );

    const contextLayer =
      plot.append("g")
        .attr(
          "pointer-events",
          "none"
        );

    focusLayer =
      plot.append("g")
        .attr(
          "pointer-events",
          "none"
        );

    hoverLayer =
      plot.append("g")
        .attr(
          "pointer-events",
          "none"
        );

    // ---------------------------------------
    // Background trends
    // ---------------------------------------

    contextLayer
      .selectAll("path.context-line")
      .data(info.context)
      .join("path")
      .attr(
        "class",
        "context-line"
      )
      .attr(
        "d",
        entry => linePath(entry.points)
      )
      .style(
        "fill",
        "none",
        "important"
      )
      .style(
        "stroke",
        "#a6b8c9",
        "important"
      )
      .style(
        "stroke-width",
        "1px",
        "important"
      )
      .style(
        "stroke-opacity",
        0.18,
        "important"
      );

    // ---------------------------------------
    // Selected / summary trends
    // ---------------------------------------

    const manyIndividual =
      !info.summarize &&
      info.chosen.length > 15;

    for (const entry of info.main) {

      // IQR shading.
      if (
        info.showIQR &&
        entry.aggregate
      ) {
        const area = d3.area()
          .defined(
            p =>
              valid(p.q25) &&
              valid(p.q75)
          )
          .x(
            p => x(p.year)
          )
          .y0(
            p => y(p.q25)
          )
          .y1(
            p => y(p.q75)
          );

        focusLayer.append("path")
          .attr(
            "d",
            area(entry.points)
          )
          .attr(
            "fill",
            entry.color
          )
          .attr(
            "fill-opacity",
            0.15
          );
      }

      entry.baseOpacity =
        entry.aggregate
          ? 1
          : manyIndividual
            ? 0.35
            : 0.85;

      entry.baseWidth =
        entry.aggregate
          ? 3.2
          : manyIndividual
            ? 1.6
            : 2.7;

      focusLayer.append("path")
        .datum(entry)
        .attr(
          "class",
          "focus-line"
        )
        .attr(
          "d",
          linePath(entry.points)
        )
        .style(
          "fill",
          "none",
          "important"
        )
        .style(
          "stroke",
          entry.color,
          "important"
        )
        .style(
          "stroke-width",
          entry.baseWidth + "px",
          "important"
        )
        .style(
          "opacity",
          entry.baseOpacity,
          "important"
        );

      // Avoid excessive markers.
      const showMarkers =
        entry.aggregate ||
        info.chosen.length <= 12;

      if (showMarkers) {
        const markers = focusLayer.append("g")
          .datum(entry)
          .attr(
            "class",
            "focus-markers"
          );

        markers.selectAll("circle")
          .data(
            entry.points.filter(
              p => valid(p.value)
            )
          )
          .join("circle")
          .attr(
            "class",
            "trend-point"
          )
          .attr(
            "cx",
            p => x(p.year)
          )
          .attr(
            "cy",
            p => y(p.value)
          )
          .attr(
            "r",
            p =>
              p.year === activeYear
                ? 6.3
                : 3.6
          )
          .attr(
            "fill",
            entry.color
          )
          .attr(
            "stroke",
            p =>
              p.year === activeYear
                ? "#1b3148"
                : "white"
          )
          .attr(
            "stroke-width",
            p =>
              p.year === activeYear
                ? 1.8
                : 1.2
          );
      }
    }

    // =====================================
    // Interactive plot area
    // =====================================

    const interactiveSeries = [
      ...info.main,
      ...info.context
    ].filter(
      entry =>
        entry.points.some(
          p => valid(p.value)
        )
    );

    const overlay = plot.append("rect")
      .attr(
        "x",
        margin.left
      )
      .attr(
        "y",
        margin.top
      )
      .attr(
        "width",
        plotWidth
      )
      .attr(
        "height",
        plotHeight
      )
      .attr(
        "fill",
        "transparent"
      )
      .attr(
        "pointer-events",
        "all"
      )
      .style(
        "cursor",
        "crosshair"
      );

    let localHover = null;


    function nearestSeries(event) {
      const [px, py] = d3.pointer(
        event,
        svg.node()
      );

      let nearestMetro = null;
      let metroDistance = Infinity;

      let nearestSummary = null;
      let summaryDistance = Infinity;

      for (const entry of interactiveSeries) {
        const distance = distanceToSeries(
          px,
          py,
          entry
        );

        if (entry.code) {
          // Individual metro trend.
          if (distance < metroDistance) {
            metroDistance = distance;
            nearestMetro = entry;
          }
        } else {
          // Median summary trend.
          if (distance < summaryDistance) {
            summaryDistance = distance;
            nearestSummary = entry;
          }
        }
      }

      // Give an individual metro priority
      // when the pointer is close to its line.
      if (
        nearestMetro &&
        metroDistance <= 9 * 9
      ) {
        return nearestMetro;
      }

      // Otherwise allow the median line
      // to display its summary tooltip.
      if (
        nearestSummary &&
        summaryDistance <= 7 * 7
      ) {
        return nearestSummary;
      }

      if (
        nearestMetro &&
        metroDistance <= 14 * 14
      ) {
        return nearestMetro;
      }

      return null;
    }


    function clearLocalHover() {
      hideTooltip();

      if (localHover !== null) {
        localHover = null;
        hovered = null;

        paintHover();

        window.hoverMetro?.(
          null,
          "linechart"
        );
      }
    }

    overlay.on(
      "mousemove.trend",
      event => {
        const entry =
          nearestSeries(event);

        if (!entry) {
          clearLocalHover();
          return;
        }

        showTooltip(
          event,
          entry
        );

        const next =
          entry.code || null;

        if (next !== localHover) {
          localHover = next;
          hovered = next;

          paintHover();

          window.hoverMetro?.(
            next,
            "linechart"
          );
        }
      }
    );

    overlay.on(
      "mouseleave.trend",
      clearLocalHover
    );


 

    overlay.on("click.trend", event => {
      const entry = nearestSeries(event);

      // Median lines do not represent individual metros.
      if (!entry || !entry.code) return;

      event.stopPropagation();

      // First click: add metro.
      // Click again: remove metro.
      // Keep all other selected metros unchanged.
      window.toggleMetro?.(
        entry.code,
        "linechart"
      );
    });



    paintHover();

    // =====================================
    // Status text
    // =====================================

    countLabel.text(
      `${selected.length} selected · ` +
      `${metros.length} metros available`
    );

    if (!selected.length) {
      note.text(
        "National overview: yearly median across " +
        "all metros with available data. " +
        "Shading = 25th–75th percentile. " +
        "The number of valid metros may differ by year."
      );

    } else if (info.summarize) {
      note.text(
        `${info.chosen.length} selected metros · ` +
        "Each solid line shows the yearly median " +
        "for its indicator." +
        (
          info.showIQR
            ? " Shading = 25th–75th percentile."
            : ""
        )
      );

    } else {
      note.text(
        `${info.chosen.length} selected metros · ` +
        `${info.main.length} individual trend lines. ` +
        "No aggregation is applied. " +
        "Hover a line to identify its metro."
      );
    }

    if (info.context.length) {
      note.text(
        note.text() +
        ` · ${info.context.length} background ` +
        "indicator trends displayed."
      );
    }
  }

 
  // 14. Selection synchronization
 

  function selectMetros(codes, year) {
    selected = [
      ...new Set(
        (codes || [])
          .map(normalize)
          .filter(Boolean)
      )
    ];

    if (
      YEARS.includes(Number(year))
    ) {
      activeYear =
        Number(year);
    }

    hovered = normalize(
      window.dashboardState?.hovered
    );

    hoverExpandedScale = false;

    // Update picker without replacing nodes.
    syncPickerChecks();

    // Do not close the dropdown.
    // Do not clear its search text.
    draw();
  }

  function setMetric(key) {
    if (!modes[key]) return;

    metricInput.property(
      "value",
      key
    );

    draw();
  }

  function setYear(year) {
    selectMetros(
      selected,
      year
    );
  }

 
  // 15. Initialize data
 

  function init(rows) {
    const grouped = d3.group(
      rows,
      row => normalize(
        row.cbsa_code
      )
    );

    metros = Array.from(
      grouped,
      ([id, list]) => ({
        code: id,

        name:
          list[0].metro_name ||
          id,

        rows: YEARS.map(
          year =>
            list.find(
              row => row.year === year
            ) || {
              year,
              cbsa_code: id,
              trend_comparable: false
            }
        )
      })
    )
      .filter(
        metro => metro.code
      )
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );

    byCode = new Map(
      metros.map(
        metro => [
          metro.code,
          metro
        ]
      )
    );

    comparable = metros.filter(
      metro =>
        metro.rows.every(
          row => row.trend_comparable
        )
    );

    activeYear =
      Number(
        d3.select("#year-select")
          .property("value")
      ) || 2024;

    // Populate searchable options once.
    renderPickerOptions();

    selectMetros(
      window.dashboardState
        ?.selectedMetros || [],
      activeYear
    );
  }

 
  // 16. Existing HTML controls
 

  metricInput.on(
    "change.line",
    draw
  );

  contextInput.on(
    "change.line",
    draw
  );

  summaryInput.on(
    "change.line",
    draw
  );

  autoInput.on(
    "change.line",
    draw
  );

 
  // 17. Hover from other charts
 

  document.addEventListener(
    "housing:metroHovered",
    event => {
      // Prevent local Hover feedback loops.
      if (
        event.detail?.source === "linechart"
      ) {
        return;
      }

      const next = normalize(
        event.detail?.cbsa_code
      );

      if (next === hovered) {
        return;
      }

      hovered = next;

      if (
        autoInput.property("checked") &&
        y &&
        hovered
      ) {
        const metro =
          byCode.get(hovered);

        const values = metro
          ? currentMode.indicators.flatMap(
              indicator =>
                individualSeries(
                  metro,
                  indicator
                )
                  .map(
                    point => point.value
                  )
                  .filter(valid)
            )
          : [];

        const outside = values.some(
          value =>
            value < y.domain()[0] ||
            value > y.domain()[1]
        );

        if (outside) {
          hoverExpandedScale = true;
          draw();
          return;
        }
      }

      if (
        !hovered &&
        hoverExpandedScale
      ) {
        hoverExpandedScale = false;
        draw();
        return;
      }

      paintHover();
    }
  );

 
  // 18. Public chart API
 

  window.housingLineChart = {
    init,
    selectMetros,
    setMetric,
    setYear,

    selectMetro(id) {
      window.setSelectedMetros?.(
        id ? [id] : [],
        "linechart"
      );
    },

    setCompare(id) {
      if (id) {
        window.addSelectedMetros?.(
          [id],
          "linechart"
        );
      }
    }
  };

})();
