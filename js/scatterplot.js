
/*
 * COSI 116A — Housing Scatterplot
 *
 * Click: replace selection
 * Modifier + click: add/remove one
 * Drag: replace selection
 * Modifier + drag: add
 *
 * Selected orange, hover orange ring.
 * No HTML changes.
 */

function drawScatterplot(data, cbsa, year) {
  const svg = d3.select("#scatterplot");
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", "0 0 760 520")
    .attr("preserveAspectRatio", "xMidYMid meet");

  const W = 760;
  const H = 520;

  const margin = {
    top: 65,
    right: 36,
    bottom: 76,
    left: 85
  };

  const w = W - margin.left - margin.right;
  const h = H - margin.top - margin.bottom;

  const COLOR = {
    default: "#367bb4",
    faded: "#a7b5c4",
    selected: "#e68132",
    guide: "#7d93a8"
  };

  function normalize(value) {
    return value == null || String(value).trim() === ""
      ? null
      : String(value).trim().padStart(5, "0");
  }

  function number(value) {
    if (value == null || String(value).trim() === "") {
      return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  const selected = [
    ...(
      window.dashboardState?.selectedMetros ||
      (cbsa ? [cbsa] : [])
    )
  ].map(normalize).filter(Boolean);

  const selectedSet = new Set(selected);

  const market =
    d3.select("#scatter-mode").property("value") === "market";

  const xKey = market
    ? "median_household_income"
    : "mortgage_owner_burden_pct";

  const yKey = market
    ? "median_owner_home_value"
    : "renter_burden_pct";

 
  // Controls
 

  const controls = d3.select(".scatter-controls");

  if (
    !controls.empty() &&
    controls.select("#scatter-options").empty()
  ) {
    const options = controls.append("div")
      .attr("id", "scatter-options")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("align-items", "center")
      .style("gap", "9px 16px")
      .style("margin-top", "9px")
      .style("font", "12px Arial, sans-serif");

    function addCheck(id, labelText) {
      const label = options.append("label")
        .style("display", "inline-flex")
        .style("align-items", "center")
        .style("gap", "6px")
        .style("cursor", "pointer");

      label.append("input")
        .attr("type", "checkbox")
        .attr("id", id)
        .property("checked", true);

      label.append("span").text(labelText);

      return label;
    }

    addCheck(
      "scatter-focus-zoom",
      "Focus on typical metros"
    );

    addCheck(
      "scatter-show-guides",
      "Show ±5 pp band and 50% / 75% guides"
    ).attr("id", "scatter-guide-label");

    options.append("button")
      .attr("type", "button")
      .attr("id", "scatter-clear-selection")
      .text("Clear All")
      .style("padding", "5px 10px")
      .style("background", "white")
      .style("border", "1px solid #cad7e4")
      .style("border-radius", "6px")
      .style("color", "#3c6487")
      .style("cursor", "pointer");
  }

  d3.select("#scatter-guide-label")
    .style(
      "display",
      market ? "none" : "inline-flex"
    );

  const focusInput =
    d3.select("#scatter-focus-zoom");

  const guideInput =
    d3.select("#scatter-show-guides");

  const focused = focusInput.empty()
    ? true
    : focusInput.property("checked");

  const guides = guideInput.empty()
    ? true
    : guideInput.property("checked");

  focusInput.on("change.scatter", () => {
    window.redrawScatterplot?.();
  });

  guideInput.on("change.scatter", () => {
    window.redrawScatterplot?.();
  });

  d3.select("#scatter-clear-selection")
    .property("disabled", !selected.length)
    .on("click.scatter", () => {
      window.clearSelectedMetros?.("scatterplot");
    });

 
  // Data
 

  const all = data.map(row => ({
    year: Number(row.year),
    code: normalize(row.cbsa_code),
    name: row.metro_name,
    x: number(row[xKey]),
    y: number(row[yKey])
  }))
    .filter(d =>
      d.code &&
      d.x !== null &&
      d.y !== null &&
      d.x >= 0 &&
      d.y >= 0 &&
      (
        market ||
        (d.x <= 100 && d.y <= 100)
      )
    );

  const current = all.filter(
    d => d.year === Number(year)
  );

  const chosen = current.filter(
    d => selectedSet.has(d.code)
  );

  const chart = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top})`
    );

 
  // Axis range
 

  function domain(key) {
    const source = focused ? current : all;

    const values = source
      .map(d => d[key])
      .sort(d3.ascending);

    if (!values.length) return [0, 1];

    let low = focused
      ? d3.quantileSorted(values, 0.05)
      : values[0];

    let high = focused
      ? d3.quantileSorted(values, 0.95)
      : values[values.length - 1];

    // Keep selected metros in the visible range.
    for (const metro of chosen) {
      low = Math.min(low, metro[key]);
      high = Math.max(high, metro[key]);
    }

    const pad = Math.max(
      (high - low) * 0.08,
      market ? 100 : 0.6
    );

    return [
      Math.max(0, low - pad),
      high + pad
    ];
  }

  const x = d3.scaleLinear()
    .domain(domain("x"))
    .nice(5)
    .range([0, w]);

  const y = d3.scaleLinear()
    .domain(domain("y"))
    .nice(5)
    .range([h, 0]);

  function inside(d) {
    const px = x(d.x);
    const py = y(d.y);

    return (
      px >= 0 && px <= w &&
      py >= 0 && py <= h
    );
  }

  const visible = current.filter(inside);

 
  // Grid and clip
 

  const clipId = "scatter-clip-multi";

  svg.append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("width", w)
    .attr("height", h);

  const grid = chart.append("g")
    .attr("class", "scatter-grid")
    .call(
      d3.axisLeft(y)
        .ticks(6)
        .tickSize(-w)
        .tickFormat("")
    );

  grid.select(".domain").remove();

  grid.selectAll("line")
    .attr("stroke", "#e8eef4");

 
  // Burden reference guides
 

  if (!market) {
    if (guides) {
      const [xLow, xHigh] = x.domain();

      const corners = [
        [xLow, xLow - 5],
        [xHigh, xHigh - 5],
        [xHigh, xHigh + 5],
        [xLow, xLow + 5]
      ];

      chart.append("path")
        .attr(
          "d",
          d3.line()
            .x(d => x(d[0]))
            .y(d => y(d[1]))(corners) + "Z"
        )
        .attr("clip-path", `url(#${clipId})`)
        .attr("fill", "#b5c4d2")
        .attr("fill-opacity", 0.25)
        .attr("pointer-events", "none");

      for (const threshold of [50, 75]) {
        if (
          threshold >= y.domain()[0] &&
          threshold <= y.domain()[1]
        ) {
          chart.append("line")
            .attr("x1", 0)
            .attr("x2", w)
            .attr("y1", y(threshold))
            .attr("y2", y(threshold))
            .attr("stroke", COLOR.guide)
            .attr("stroke-dasharray", "3,5")
            .attr("pointer-events", "none");

          chart.append("text")
            .attr("x", w - 5)
            .attr("y", y(threshold) - 5)
            .attr("text-anchor", "end")
            .attr("font-size", 10)
            .attr("fill", "#5c738b")
            .attr("paint-order", "stroke")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .text(`Renter ${threshold}%`);
        }

        if (
          threshold >= x.domain()[0] &&
          threshold <= x.domain()[1]
        ) {
          chart.append("line")
            .attr("x1", x(threshold))
            .attr("x2", x(threshold))
            .attr("y1", 0)
            .attr("y2", h)
            .attr("stroke", COLOR.guide)
            .attr("stroke-dasharray", "3,5")
            .attr("pointer-events", "none");

          chart.append("text")
            .attr("x", x(threshold) + 5)
            .attr("y", 14)
            .attr("font-size", 10)
            .attr("fill", "#5c738b")
            .attr("paint-order", "stroke")
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .text(`Owner ${threshold}%`);
        }
      }

      chart.append("text")
        .attr("x", 0)
        .attr("y", -13)
        .attr("font-size", 11)
        .attr("fill", "#63798d")
        .text(
          "Shaded band: renter and owner burden differ by no more than ±5 pp"
        );
    }

    const low = Math.max(
      x.domain()[0],
      y.domain()[0]
    );

    const high = Math.min(
      x.domain()[1],
      y.domain()[1]
    );

    if (low <= high) {
      chart.append("line")
        .attr("x1", x(low))
        .attr("y1", y(low))
        .attr("x2", x(high))
        .attr("y2", y(high))
        .attr("stroke", "#6d8192")
        .attr("stroke-width", 1.3)
        .attr("stroke-dasharray", "6,5")
        .attr("pointer-events", "none");
    }
  }

 
  // Axes
 

  const tick = market
    ? d => "$" + d3.format("~s")(d)
    : d => d3.format("~g")(d) + "%";

  chart.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(
      d3.axisBottom(x)
        .ticks(6)
        .tickFormat(tick)
    );

  chart.append("g")
    .call(
      d3.axisLeft(y)
        .ticks(6)
        .tickFormat(tick)
    );

  chart.append("text")
    .attr("class", "axis-label")
    .attr("x", w / 2)
    .attr("y", h + 52)
    .attr("text-anchor", "middle")
    .text(
      market
        ? "Median household income ($)"
        : "Mortgage-owner cost burden rate (%)"
    );

  chart.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -h / 2)
    .attr("y", -57)
    .attr("text-anchor", "middle")
    .text(
      market
        ? "Median owner-occupied home value ($)"
        : "Renter cost burden rate (%)"
    );

 
  // Background dots
 

  const dotsLayer = chart.append("g")
    .attr("clip-path", `url(#${clipId})`)
    .attr("pointer-events", "none");

  dotsLayer.selectAll(".scatter-data-dot")
    .data(current, d => d.code)
    .join("circle")
    .attr("class", "scatter-data-dot")
    .attr("cx", d => x(d.x))
    .attr("cy", d => y(d.y))
    .attr("r", selected.length ? 4.2 : 5.5)
    .style(
      "fill",
      selected.length
        ? COLOR.faded
        : COLOR.default,
      "important"
    )
    .style(
      "opacity",
      selected.length ? 0.33 : 0.90,
      "important"
    )
    .style(
      "stroke",
      selected.length ? "none" : "#ffffff"
    )
    .style("stroke-width", "0.4px");

 
  // Selected + hover points
 

  const focusLayer = chart.append("g")
    .attr("pointer-events", "none");

  let hovered = null;

  function shortName(name) {
    return String(name || "Unknown")
      .split(",")[0]
      .split("-")[0]
      .trim();
  }

  function paintFocus() {
    focusLayer.selectAll("*").remove();

    for (const d of chosen) {
      focusLayer.append("circle")
        .attr("cx", x(d.x))
        .attr("cy", y(d.y))
        .attr("r", chosen.length > 12 ? 6.6 : 9.3)
        .attr("fill", COLOR.selected)
        .attr("stroke", "white")
        .attr("stroke-width", 2.2);
    }

    // Persistent labels when few metros selected.
    if (chosen.length <= 3) {
      const placed = [];

      for (const d of chosen) {
        const px = x(d.x);
        const py = y(d.y);
        const label = shortName(d.name);

        const boxW = Math.min(
          160,
          Math.max(58, label.length * 6.6 + 18)
        );

        const boxH = 22;

        let left = px + boxW + 18 <= w
          ? px + 15
          : px - boxW - 15;

        left = Math.max(
          0,
          Math.min(w - boxW, left)
        );

        let top = Math.max(
          0,
          Math.min(h - boxH, py - 32)
        );

        for (const previous of placed) {
          if (
            left < previous.left + previous.width + 5 &&
            left + boxW > previous.left - 5 &&
            Math.abs(top - previous.top) < 25
          ) {
            top = Math.min(
              h - boxH,
              previous.top + 27
            );
          }
        }

        placed.push({
          left,
          top,
          width: boxW
        });

        focusLayer.append("line")
          .attr("x1", px)
          .attr("y1", py)
          .attr(
            "x2",
            left > px ? left : left + boxW
          )
          .attr("y2", top + boxH / 2)
          .attr("stroke", COLOR.selected)
          .attr("stroke-width", 1.2);

        const group = focusLayer.append("g")
          .attr(
            "transform",
            `translate(${left},${top})`
          );

        group.append("rect")
          .attr("width", boxW)
          .attr("height", boxH)
          .attr("rx", 5)
          .attr("fill", "white")
          .attr("stroke", COLOR.selected)
          .attr("stroke-width", 1.3);

        group.append("text")
          .attr("x", 8)
          .attr("y", 15)
          .attr("font-size", 11)
          .attr("font-weight", 600)
          .attr("fill", COLOR.selected)
          .text(label);
      }
    }

    // Hover ring, preserving fill colors.
    const point = visible.find(
      d => d.code === hovered
    );

    if (point) {
      focusLayer.append("circle")
        .attr("cx", x(point.x))
        .attr("cy", y(point.y))
        .attr(
          "r",
          selectedSet.has(point.code) ? 12 : 10
        )
        .attr("fill", "none")
        .attr("stroke", COLOR.selected)
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "4,3");
    }
  }

  paintFocus();


  // Tooltip
 

  const tooltip = d3.select("#scatter-tooltip")
    .style("position", "fixed")
    .style("display", "none")
    .style("pointer-events", "none");

  function showTooltip(event, d) {
    const fmt = value =>
      market
        ? "$" + d3.format(",.0f")(value)
        : d3.format(".1f")(value) + "%";

    const description = market
      ? (
          `Income: ${fmt(d.x)} · ` +
          `Home value: ${fmt(d.y)} · ` +
          `Ratio: ${
            d.x > 0
              ? (d.y / d.x).toFixed(1)
              : "N/A"
          }×`
        )
      : (
          `Owner: ${fmt(d.x)} · ` +
          `Renter: ${fmt(d.y)} · ` +
          `Gap: ${(d.y - d.x).toFixed(1)} pp`
        );

    tooltip
      .style("display", "block")
      .text(
        `${d.name} · ${year} · ${description}`
      );

    const node = tooltip.node();

    tooltip
      .style(
        "left",
        Math.max(
          8,
          Math.min(
            event.clientX + 12,
            window.innerWidth - node.offsetWidth - 8
          )
        ) + "px"
      )
      .style(
        "top",
        Math.max(
          8,
          event.clientY - node.offsetHeight - 14
        ) + "px"
      );
  }

  // =========================================
  // Click + Brush
  // =========================================

  const tree = d3.quadtree(
    visible,
    d => x(d.x),
    d => y(d.y)
  );

  let blockClickUntil = 0;

  const brush = d3.brush()
    .extent([[0, 0], [w, h]])
    .keyModifiers(false)
    .filter(event => event.button === 0)

    .on("end.scatter", event => {
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

      const matched = visible.filter(d => {
        const px = x(d.x);
        const py = y(d.y);

        return (
          px >= x0 &&
          px <= x1 &&
          py >= y0 &&
          py <= y1
        );
      }).map(d => d.code);

      window.handleMetroBrush?.(
        matched,
        event.sourceEvent,
        "scatter-brush"
      );
    });

  const brushLayer = chart.append("g")
    .attr("class", "scatter-brush")
    .call(brush);

  brushLayer.selectAll(".selection")
    .attr("fill", "#3281b9")
    .attr("fill-opacity", 0.13)
    .attr("stroke", "#3281b9")
    .attr("stroke-dasharray", "5,3");

  function nearest(event) {
    const [mx, my] = d3.pointer(
      event,
      chart.node()
    );

    return tree.find(mx, my, 15) || null;
  }

  brushLayer.selectAll(".overlay")
    .style("cursor", "crosshair")

    .on("mousemove.preview", event => {
      if (event.buttons !== 0) {
        tooltip.style("display", "none");
        window.hoverMetro?.(null, "scatterplot");
        return;
      }

      const point = nearest(event);
      const next = point?.code || null;

      if (next !== hovered) {
        hovered = next;
        paintFocus();

        window.hoverMetro?.(
          next,
          "scatterplot"
        );
      }

      if (point) {
        showTooltip(event, point);
      } else {
        tooltip.style("display", "none");
      }
    })

    .on("mouseleave.preview", () => {
      tooltip.style("display", "none");

      if (hovered) {
        hovered = null;
        paintFocus();
        window.hoverMetro?.(null, "scatterplot");
      }
    });

  brushLayer.on("click.scatter-select", event => {
    if (
      event.defaultPrevented ||
      Date.now() < blockClickUntil
    ) {
      return;
    }

    const point = nearest(event);

    if (!point) return;

    event.stopPropagation();

    window.handleMetroClick?.(
      point.code,
      event,
      "scatterplot"
    );
  });

 
  // External hover
 

  window.scatterHover = value => {
    const next = normalize(value);

    if (next !== hovered) {
      hovered = next;
      paintFocus();
    }
  };

 
  // Status line
 

  d3.select("#scatter-count")
    .text(
      `${current.length} metros with both measures · ${year} · ` +
      `${visible.length} visible ` +
      (
        focused
          ? "(focused 5th–95th percentile)"
          : "(full range)"
      ) +
      ` · ${selected.length} selected · ` +
      "Click to select · Drag to replace · " +
      "Shift / Ctrl / Option / Command to add" +
      (
        !market && guides
          ? " · Shaded band = ±5 percentage points"
          : ""
      )
    );
}
