
/*
 * Metro Rankings
 *
 * Top N / Bottom N / Top N + Bottom N / All
 *
 * - Default: Top N / Bottom N, N = 10
 * - Selected metros retain their actual rank order
 * - No separate Additional selected metros section
 * - Chart height grows with the number of rows
 * - Blue: unselected, orange: selected
 * - Click to toggle selection
 * - Always-on brush selection
 * - Clear All
 * - Linked hover
 * - Supports negative burden gaps
 */

function drawBarChart(data, cbsa, year) {

  // 1. Elements and settings

  const svg = d3.select("#barchart");
  svg.selectAll("*").remove();

  const tooltip = d3.select("#bar-tooltip");

  const yearInput = d3.select("#chartyear");
  const modeInput = d3.select("#chartmode");
  const countInput = d3.select("#chartcount");
  const countField = d3.select("#bar-count-field");
  const metricInput = d3.select("#bar-metric");

  const description = d3.select("#bar-description");
  const clearButton = d3.select("#bar-clear-all");

  const COLORS = {
    normal: "#477fb2",
    selected: "#e68132",
    hover: "#e68132",
    median: "#8496a8"
  };

  function normalize(value) {
    if (
      value == null ||
      String(value).trim() === ""
    ) {
      return null;
    }

    return String(value).trim().padStart(5, "0");
  }

  function numeric(value) {
    if (
      value == null ||
      String(value).trim() === ""
    ) {
      return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // Shared selection from all four charts.

  const storedSelection =
    window.dashboardState?.selectedMetros;

  const selected = [
    ...new Set(
      Array.from(
        storedSelection ??
        (cbsa ? [cbsa] : [])
      )
        .map(normalize)
        .filter(Boolean)
    )
  ];

  const selectedSet = new Set(selected);

  const metric =
    metricInput.property("value") ||
    "renter_burden_pct";

  const requestedMode =
    modeInput.property("value");

  const mode = [
    "top",
    "bottom",
    "both",
    "all"
  ].includes(requestedMode)
    ? requestedMode
    : "both";

  const isMoney = metric.startsWith("median_");

  const isGap =
    metric ===
    "burden_gap_renter_minus_mortgage_pp";

  const metricNames = {
    renter_burden_pct: "Renter burden",
    mortgage_owner_burden_pct:
      "Mortgage-owner burden",
    burden_gap_renter_minus_mortgage_pp:
      "Renter − owner burden gap",
    median_household_income:
      "Median household income",
    median_owner_home_value:
      "Median home value"
  };

  function format(value) {
    if (value == null) return "No data";

    if (isMoney) {
      return "$" + d3.format(",.0f")(value);
    }

    if (isGap) {
      return d3.format("+.1f")(value) + " pp";
    }

    return d3.format(".1f")(value) + "%";
  }

  function tickFormat(value) {
    if (isMoney) {
      return "$" + d3.format("~s")(value);
    }

    return d3.format("~g")(value) +
      (isGap ? "" : "%");
  }

  
  // 2. Prepare ranking data

  const ranked = data
    .filter(row =>
      Number(row.year) === Number(year)
    )
    .map(row => ({
      id: normalize(row.cbsa_code),
      name:
        row.metro_name ||
        String(row.cbsa_code),
      value: numeric(row[metric])
    }))
    .filter(d =>
      d.id &&
      d.value !== null &&
      (isGap || d.value >= 0) &&
      (
        isMoney ||
        isGap ||
        d.value <= 100
      )
    )
    .sort((a, b) =>
      b.value - a.value ||
      a.name.localeCompare(b.name)
    );

  // Competition ranking:
  // Equal values share a rank, e.g. 1, 1, 3.

  let currentRank = 0;
  let previousValue = null;

  ranked.forEach((d, index) => {
    if (
      previousValue === null ||
      d.value !== previousValue
    ) {
      currentRank = index + 1;
    }

    d.rank = currentRank;
    previousValue = d.value;
  });

  const totalMetros = ranked.length;

  const byCode = new Map(
    ranked.map(d => [d.id, d])
  );

  const nationalMedian = d3.median(
    ranked,
    d => d.value
  );

   
  // 3. Ranking controls
   

  yearInput.property("value", String(year));
  modeInput.property("value", mode);

  const inputN = Number(
    countInput.property("value")
  );

  const n = Math.max(
    1,
    Math.min(
      totalMetros || 1,
      Number.isInteger(inputN) && inputN > 0
        ? inputN
        : 10
    )
  );

  countInput.attr(
    "max",
    Math.max(1, totalMetros)
  );

  const usesN = mode !== "all";

  countInput.property(
    "disabled",
    !usesN
  );

  if (!countField.empty()) {
    countField.property(
      "hidden",
      !usesN
    );
  }

  // Clear all selections.

  if (!clearButton.empty()) {
    clearButton
      .property(
        "disabled",
        selected.length === 0
      )
      .on("click.bar", () => {
        window.clearSelectedMetros?.("barchart");
      });
  }

   
  // 4. Top / Bottom ranking membership
   

  const top = ranked.slice(0, n);

  const bottom = ranked.slice(
    Math.max(0, totalMetros - n)
  );

  const topIds = new Set(
    top.map(d => d.id)
  );

  const bottomIds = new Set(
    bottom.map(d => d.id)
  );

  let base = [];

  if (mode === "top") {
    base = top;

  } else if (mode === "bottom") {
    base = bottom;

  } else if (mode === "both") {
    const seen = new Set();

    base = [...top, ...bottom].filter(d => {
      if (seen.has(d.id)) return false;

      seen.add(d.id);
      return true;
    });

  } else {
    base = ranked;
  }

   
  // 5. Merge additional selected metros
   

  const baseIds = new Set(
    base.map(d => d.id)
  );

  // Find selected metros outside the
  // requested Top N / Bottom N set.

  const extraSelected = mode === "all"
    ? []
    : selected
        .map(id => byCode.get(id))
        .filter(d =>
          d && !baseIds.has(d.id)
        );

  // IMPORTANT:
  // Merge everything into ONE ranking.
  //
  // Filtering the already sorted ranked array
  // preserves the exact national rank order.
  //
  // No "Additional selected metros" section.

  const visibleIds = new Set(
    [...base, ...extraSelected]
      .map(d => d.id)
  );

  const visible = ranked.filter(
    d => visibleIds.has(d.id)
  );

   
  // 6. Dynamic chart height and sections
   

  const W = 800;

  const margin = {
    top: 35,
    right: 72,
    bottom: 58,
    left: 288
  };

  const plotWidth =
    W - margin.left - margin.right;

  const rowHeight = 29;
  const barHeight = 20;
  const headingHeight = 26;

  let cursorY = 5;

  const headings = [];
  const rows = [];

  let topHeadingShown = false;
  let bottomHeadingShown = false;
  let allHeadingShown = false;

  const hasOverlap =
    mode === "both" &&
    top.some(d => bottomIds.has(d.id));

  // Add a heading only where needed.
  // Selected metros between Top and Bottom
  // have no separate heading.

  function addHeading(label) {
    headings.push({
      label,
      y: cursorY + 16
    });

    cursorY += headingHeight;
  }

  for (const d of visible) {

    if (mode === "all") {
      if (!allHeadingShown) {
        addHeading("All metros");
        allHeadingShown = true;
      }

    } else if (mode === "both" && hasOverlap) {
      if (!topHeadingShown) {
        addHeading(`Top ${n} / Bottom ${n}`);
        topHeadingShown = true;
      }

    } else {
      if (
        (mode === "top" || mode === "both") &&
        topIds.has(d.id) &&
        !topHeadingShown
      ) {
        addHeading(`Top ${n}`);
        topHeadingShown = true;
      }

      if (
        (mode === "bottom" || mode === "both") &&
        bottomIds.has(d.id) &&
        !bottomHeadingShown
      ) {
        addHeading(`Bottom ${n}`);
        bottomHeadingShown = true;
      }
    }

    rows.push({
      ...d,
      rowY: cursorY
    });

    cursorY += rowHeight;
  }

  // No fixed chart height.
  // Every additional metro adds one row.

  const plotHeight = Math.max(
    50,
    cursorY + 10
  );

  const totalHeight =
    margin.top +
    plotHeight +
    margin.bottom;

  svg
    .attr(
      "viewBox",
      `0 0 ${W} ${totalHeight}`
    )
    .attr("height", totalHeight)
    .attr(
      "preserveAspectRatio",
      "xMinYMin meet"
    );

  const chart = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top})`
    );

   
  // 7. X-axis scale
   

  // Use the entire ranked dataset for the
  // scale, keeping bar lengths comparable
  // when switching ranking modes.

  const maxValue = d3.max(
    ranked,
    d => d.value
  ) ?? 1;

  const gapLimit = Math.max(
    1,
    d3.max(
      ranked,
      d => Math.abs(d.value)
    ) ?? 0
  );

  const x = d3.scaleLinear()
    .domain(
      isGap
        ? [-gapLimit, gapLimit]
        : [0, Math.max(1, maxValue)]
    )
    .nice(5)
    .range([0, plotWidth]);

  const zeroX = x(0);

   
  // 8. Axes
   

  chart.append("g")
    .attr("class", "bar-x-axis")
    .attr(
      "transform",
      `translate(0,${plotHeight})`
    )
    .call(
      d3.axisBottom(x)
        .ticks(5)
        .tickFormat(tickFormat)
        .tickSizeOuter(0)
    );

  chart.append("text")
    .attr("class", "bar-axis-label")
    .attr("x", plotWidth / 2)
    .attr("y", plotHeight + 42)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#53677d")
    .text(
      isGap
        ? "Renter − owner burden gap (pp)"
        : isMoney
          ? "Value (USD)"
          : "Housing cost burden rate (%)"
    );

  chart.append("text")
    .attr("x", -margin.left + 10)
    .attr("y", -15)
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .attr("fill", "#304a64")
    .text("Metro area · national rank");

   
  // 9. Zero and median reference lines
   

  if (isGap) {
    chart.append("line")
      .attr("x1", zeroX)
      .attr("x2", zeroX)
      .attr("y1", 0)
      .attr("y2", plotHeight)
      .attr("stroke", "#617b93")
      .attr("stroke-width", 1.3)
      .attr("pointer-events", "none");
  }

  if (nationalMedian != null) {
    chart.append("line")
      .attr("x1", x(nationalMedian))
      .attr("x2", x(nationalMedian))
      .attr("y1", 0)
      .attr("y2", plotHeight)
      .attr("stroke", COLORS.median)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4,4")
      .attr("pointer-events", "none");
  }

   
  // 10. Section headings
   

  chart.selectAll(".bar-section-label")
    .data(headings)
    .join("text")
    .attr("class", "bar-section-label")
    .attr("x", -margin.left + 10)
    .attr("y", d => d.y)
    .attr("font-size", 11)
    .attr("font-weight", 700)
    .attr("fill", "#506981")
    .text(d => d.label);

   
  // 11. Bar colors
   

  function colorFor(d) {
    return selectedSet.has(d.id)
      ? COLORS.selected
      : COLORS.normal;
  }

   
  // 12. Draw bars
   

  const bars = chart
    .selectAll(".metro-bar")
    .data(rows, d => d.id)
    .join("rect")
    .attr("class", "metro-bar")
    .attr("data-cbsa", d => d.id)
    .classed(
      "multi-selected",
      d => selectedSet.has(d.id)
    )
    .attr(
      "x",
      d => Math.min(zeroX, x(d.value))
    )
    .attr("y", d => d.rowY)
    .attr(
      "width",
      d => Math.abs(x(d.value) - zeroX)
    )
    .attr("height", barHeight)
    .attr("rx", 3)
    .style(
      "fill",
      colorFor,
      "important"
    )
    .style(
      "opacity",
      1,
      "important"
    )
    .style(
      "stroke",
      d => selectedSet.has(d.id)
        ? "#ffffff"
        : "none",
      "important"
    )
    .style(
      "stroke-width",
      d => selectedSet.has(d.id)
        ? "1.5px"
        : "0px",
      "important"
    )
    .style("cursor", "pointer");

   
  // 13. Metro labels
   

  function shortName(name) {
    const text = String(name || "");

    return text.length > 34
      ? text.slice(0, 31) + "…"
      : text;
  }

  const labels = chart
    .selectAll(".bar-label")
    .data(rows, d => d.id)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", -10)
    .attr(
      "y",
      d => d.rowY + barHeight / 2 + 4
    )
    .attr("text-anchor", "end")
    .attr("font-size", 11)
    .attr(
      "font-weight",
      d => selectedSet.has(d.id)
        ? 700
        : 400
    )
    .attr("fill", "#304a64")
    .style("cursor", "pointer")
    .text(d =>
      `#${d.rank} ${shortName(d.name)}`
    );

  labels.append("title")
    .text(d =>
      `#${d.rank} ${d.name}`
    );

   
  // 14. Value labels
   

  chart.selectAll(".bar-value")
    .data(rows, d => d.id)
    .join("text")
    .attr("class", "bar-value")
    .attr(
      "x",
      d => x(d.value) +
        (d.value < 0 ? -5 : 5)
    )
    .attr(
      "y",
      d => d.rowY + barHeight / 2 + 4
    )
    .attr(
      "text-anchor",
      d => d.value < 0
        ? "end"
        : "start"
    )
    .attr("font-size", 10)
    .attr("fill", "#4b6178")
    .attr("pointer-events", "none")
    .text(d => format(d.value));

  if (!rows.length) {
    chart.append("text")
      .attr("x", 8)
      .attr("y", 28)
      .attr("font-size", 12)
      .attr("fill", "#718398")
      .text(
        "No valid data for this indicator."
      );
  }

   
  // 15. Tooltip
   

  function showTooltip(event, d) {
    tooltip
      .style("display", "block")
      .style("position", "fixed")
      .style("pointer-events", "none")
      .text(
        `${d.name} · ` +
        `Rank #${d.rank}/${totalMetros} · ` +
        `${metricNames[metric]}: ${format(d.value)}`
      );

    const node = tooltip.node();

    if (!node) return;

    const left = Math.max(
      8,
      Math.min(
        event.clientX + 14,
        window.innerWidth -
          node.offsetWidth - 8
      )
    );

    const top = Math.max(
      8,
      event.clientY -
        node.offsetHeight - 14
    );

    tooltip
      .style("left", left + "px")
      .style("top", top + "px");
  }

  function hideTooltip() {
    tooltip.style("display", "none");
  }

   
  // 16. Click and hover on labels
   

  labels
    .on("mouseenter.bar", (event, d) => {
      window.hoverMetro?.(
        d.id,
        "barchart"
      );

      showTooltip(event, d);
    })

    .on("mousemove.bar", (event, d) => {
      showTooltip(event, d);
    })

    .on("mouseleave.bar", () => {
      hideTooltip();

      window.hoverMetro?.(
        null,
        "barchart"
      );
    })

    .on("click.bar", (event, d) => {
      event.stopPropagation();

      // Click to add or remove.
      window.toggleMetro?.(
        d.id,
        "barchart"
      );
    });

   
  // 17. Linked hover from other charts
   

  window.barHover = code => {
    const hoveredId = normalize(code);

    bars
      .classed(
        "linked-hover",
        d => d.id === hoveredId
      )
      .style(
        "fill",
        colorFor,
        "important"
      )
      .style(
        "opacity",
        1,
        "important"
      )
      .style(
        "stroke",
        d => {
          if (d.id === hoveredId) {
            return selectedSet.has(d.id)
              ? "#9f4e17"
              : COLORS.hover;
          }

          return selectedSet.has(d.id)
            ? "#ffffff"
            : "none";
        },
        "important"
      )
      .style(
        "stroke-width",
        d =>
          d.id === hoveredId
            ? "3px"
            : selectedSet.has(d.id)
              ? "1.5px"
              : "0px",
        "important"
      )
      .style(
        "stroke-dasharray",
        d =>
          d.id === hoveredId
            ? "5,3"
            : "none",
        "important"
      );
  };

   
  // 18. Always-on Brush Select
   

  let suppressClickUntil = 0;

  const brush = d3.brushY()
    .extent([
      [0, 0],
      [plotWidth, plotHeight]
    ])
    .keyModifiers(false)
    .filter(event => event.button === 0)

    .on("start.bar", () => {
      hideTooltip();

      window.hoverMetro?.(
        null,
        "barchart"
      );
    })

    .on("end.bar", event => {
      if (
        !event.sourceEvent ||
        !event.selection
      ) {
        return;
      }

      const [y0, y1] = event.selection;

      // Clear brush rectangle after selection.
      brushLayer.call(brush.move, null);

      if (y1 - y0 < 5) return;

      suppressClickUntil = Date.now() + 200;

      const matched = rows
        .filter(d => {
          const center =
            d.rowY + barHeight / 2;

          return (
            center >= y0 &&
            center <= y1
          );
        })
        .map(d => d.id);

      window.handleMetroBrush?.(
        matched,
        event.sourceEvent,
        "bar-brush"
      );
    });

  const brushLayer = chart
    .append("g")
    .attr("class", "bar-brush")
    .call(brush);

  brushLayer.selectAll(".selection")
    .attr("fill", "#3281b9")
    .attr("fill-opacity", 0.14)
    .attr("stroke", "#3281b9")
    .attr("stroke-dasharray", "5,3");

   
  // 19. Click and hover through brush overlay
   

  function barUnderPointer(event) {
    const [px, py] = d3.pointer(
      event,
      chart.node()
    );

    const item = rows.find(d =>
      py >= d.rowY &&
      py <= d.rowY + barHeight
    );

    if (!item) return null;

    const left = Math.min(
      zeroX,
      x(item.value)
    );

    const right = Math.max(
      zeroX,
      x(item.value)
    );

    if (
      px < left ||
      px > right
    ) {
      return null;
    }

    return item;
  }

  const overlay =
    brushLayer.select(".overlay");

  overlay
    .style("cursor", "crosshair")

    .on("mousemove.barPreview", event => {
      if (event.buttons !== 0) {
        hideTooltip();

        window.hoverMetro?.(
          null,
          "barchart"
        );

        return;
      }

      const item = barUnderPointer(event);

      window.hoverMetro?.(
        item?.id || null,
        "barchart"
      );

      if (item) {
        showTooltip(event, item);
      } else {
        hideTooltip();
      }
    })

    .on("mouseleave.barPreview", () => {
      hideTooltip();

      window.hoverMetro?.(
        null,
        "barchart"
      );
    })

    .on("click.barSelect", event => {
      if (
        event.defaultPrevented ||
        Date.now() < suppressClickUntil
      ) {
        return;
      }

      const item = barUnderPointer(event);

      if (!item) return;

      event.stopPropagation();

      // Toggle selected metro.
      window.toggleMetro?.(
        item.id,
        "barchart"
      );
    });

   
  // 20. Ranking description
   

  const modeNames = {
    top: `Top ${n}`,
    bottom: `Bottom ${n}`,
    both: `Top ${n} / Bottom ${n}`,
    all: "All"
  };

  const modeLabel =
    modeNames[mode] || `Top ${n} / Bottom ${n}`;

  description.text(
    `${metricNames[metric]} · ${year} · ` +
    `${modeLabel} · ` +
    `${rows.length} displayed · ` +
    `${totalMetros} ranked metros · ` +
    `${selected.length} selected`
  );
}
