
/*
 *
 * Click:
 *   Normal = replace selection
 *   Modifier = add/remove one metro
 *
 * Brush:
 *   Normal = replace selection
 *   Modifier = add to selection
 *
 * Modifiers: Shift, Ctrl, Alt/Option, Meta/Command
 *
 * No HTML modifications.
 */

(() => {
  "use strict";

  function code(value) {
    if (value == null || String(value).trim() === "") {
      return null;
    }
    return String(value).trim().padStart(5, "0");
  }

  function unique(values) {
    return [...new Set(
      (values || []).map(code).filter(Boolean)
    )];
  }

  function multiKey(event) {
    return Boolean(
      event?.shiftKey ||
      event?.ctrlKey ||
      event?.altKey ||
      event?.metaKey
    );
  }

  const YEARS = [2021, 2022, 2023, 2024];
  const firstYear = Number(
    d3.select("#year-select").property("value")
  );

  const shared = {
    year: YEARS.includes(firstYear) ? firstYear : 2024,
    selectedMetros: [],
    cbsa: null,
    compare: null,
    hovered: null,
    rows: null
  };

  window.dashboardState = shared;

  const ORANGE = "#e68132";

  window.housingSelectionColors = [
    ORANGE, ORANGE, ORANGE, ORANGE, ORANGE
  ];

  window.metroSelectionColor = value =>
    shared.selectedMetros.includes(code(value))
      ? ORANGE
      : null;

  const dispatch = window.dashboardEvents ||
    d3.dispatch(
      "selectionchange",
      "yearchange",
      "metricchange"
    );

  window.dashboardEvents = dispatch;


  // Selection panel
 

  // const mapCard = d3.select(".map-card");

  // let panel = mapCard.select("#multi-selection-panel");

  // if (panel.empty() && !mapCard.empty()) {
  //   panel = mapCard.insert("div", "#map-heading")
  //     .attr("id", "multi-selection-panel");
  // }


  const mapCard = d3.select(".map-card");
  const toolbar = mapCard.select(".toolbar");

  let panel = toolbar.select("#multi-selection-panel");

  if (panel.empty() && !toolbar.empty()) {
    panel = toolbar.append("div")
      .attr("id", "multi-selection-panel");
  }



  // panel
  //   .style("padding", "10px 16px")
  //   .style("border-top", "1px solid #e6edf4")
  //   .style("font", "12px Arial, sans-serif")
  //   .style("color", "#52677d");


  panel
    .style("position", "relative")
    .style("margin-left", "auto")
    .style("align-self", "flex-end")
    .style("padding", "0")
    .style("border-top", "none")
    .style("font", "12px Arial, sans-serif")
    .style("color", "#52677d")
    .style("z-index", "20");


  let expanded = false;

  function metroName(id) {
    return shared.rows?.find(
      d => d.cbsa_code === id && d.year === shared.year
    )?.metro_name ||
      shared.rows?.find(
        d => d.cbsa_code === id
      )?.metro_name ||
      id;
  }

  function renderPanel() {
    if (panel.empty()) return;

    panel.selectAll("*").remove();

    // const count = shared.selectedMetros.length;

    // if (!count) expanded = false;
    const count = shared.selectedMetros.length;

    if (!count) {
      expanded = false;
      panel.style("display", "none");
      return;
    }

    panel.style("display", "block");

    const header = panel.append("div")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("align-items", "center")
      .style("flex-wrap", "wrap")
      .style("gap", "8px 14px");

    header.append("span")
      .style("font-weight", "600")
      .text(
        count
          ? `${count} Metro${count === 1 ? "" : "s"} selected`
          : "No metros selected"
      );

    const actions = header.append("div")
      .style("display", "flex")
      .style("gap", "8px");

    actions.append("button")
      .attr("type", "button")
      .attr("aria-expanded", String(expanded))
      .attr("aria-controls", "selected-metro-list")
      .property("disabled", !count)
      .text(
        expanded
          ? "Hide Selection ▲"
          : "View / Edit Selection ▼"
      )
      .style("padding", "6px 10px")
      .style("background", "#fff")
      .style("border", "1px solid #cbd9e7")
      .style("border-radius", "6px")
      .style("color", "#315878")
      .style("cursor", "pointer")
      .on("click", () => {
        expanded = !expanded;
        renderPanel();
      });

    actions.append("button")
      .attr("type", "button")
      .property("disabled", !count)
      .text("Clear All")
      .style("padding", "6px 10px")
      .style("background", "#fff")
      .style("border", "1px solid #cbd9e7")
      .style("border-radius", "6px")
      .style("color", "#315878")
      .style("cursor", "pointer")
      .on("click", () => {
        window.clearSelectedMetros("selection-panel");
      });

    if (!expanded || !count) return;

    const dropdown = panel.append("div")
      .style("position", "absolute")
      .style("top", "calc(100% + 8px)")
      .style("right", "0")
      .style("width", "min(380px, 90vw)")
      .style("box-sizing", "border-box")
      .style("padding", "10px 12px")
      .style("background", "#fff")
      .style("border", "1px solid #cbd9e7")
      .style("border-radius", "8px")
      .style("box-shadow", "0 5px 18px rgba(30,55,80,0.14)")
      .style("z-index", "100");


    dropdown.append("div")
      .style("margin", "9px 0 6px")
      .style("font-size", "11px")
      .text(
        "Click a metro below to remove it from the selection."
      );

    const list = dropdown.append("div")
      .attr("id", "selected-metro-list")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "6px")
      .style("max-height", "172px")
      .style("overflow-y", "auto")
      .style("padding", "4px 0 6px");

    list.selectAll("button.metro-chip")
      .data(shared.selectedMetros, d => d)
      .join("button")
      .attr("type", "button")
      .attr("class", "metro-chip")
      .text(d => `${metroName(d)} ×`)
      .attr("title", d => `Remove ${metroName(d)}`)
      .style("padding", "5px 9px")
      .style("max-width", "260px")
      .style("overflow", "hidden")
      .style("text-overflow", "ellipsis")
      .style("white-space", "nowrap")
      .style("background", "#fffaf5")
      .style("border", `1px solid ${ORANGE}`)
      .style("border-radius", "14px")
      .style("color", "#c56a1f")
      .style("cursor", "pointer")
      .on("click", (event, id) => {
        // This panel is an explicit removal tool.
        window.toggleMetro(id, "selection-panel");
      });
  }

 
  // Selection state
 

  function updateAliases() {
    shared.cbsa = shared.selectedMetros[0] || null;
    shared.compare = shared.selectedMetros[1] || null;
  }

  function commitSelection(values, source = "chart") {
    const next = unique(values);

    if (
      next.length === shared.selectedMetros.length &&
      next.every((id, i) => id === shared.selectedMetros[i])
    ) {
      return;
    }

    shared.selectedMetros = next;
    updateAliases();

    shared.hovered = null;

    renderPanel();

    dispatch.call("selectionchange", null, {
      selectedMetros: [...next],
      cbsa: shared.cbsa,
      compare: shared.compare,
      year: shared.year,
      source
    });

    document.dispatchEvent(
      new CustomEvent("housing:metroHovered", {
        detail: {
          cbsa_code: null,
          source: "coordinator"
        }
      })
    );
  }

  window.setSelectedMetros = (values, source = "chart") =>
    commitSelection(values, source);

  window.addSelectedMetros = (values, source = "chart") =>
    commitSelection(
      [...shared.selectedMetros, ...(values || [])],
      source
    );

  window.clearSelectedMetros = (source = "clear") =>
    commitSelection([], source);

  // Direct toggle remains available for the
  // explicit removal buttons in the selection panel.
  window.toggleMetro = (value, source = "chart") => {
    const id = code(value);
    if (!id) return;

    const current = [...shared.selectedMetros];
    const index = current.indexOf(id);

    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }

    commitSelection(current, source);
  };

 
  // Unified click behavior
 

  window.handleMetroClick = (
    value,
    event,
    source = "chart"
  ) => {
    const id = code(value);
    if (!id) return;

    if (multiKey(event)) {
      // Modifier + click adds or removes one.
      window.toggleMetro(id, source);
      return;
    }

    // Normal click replaces selection.
    // Clicking the sole selected metro clears it.
    if (
      shared.selectedMetros.length === 1 &&
      shared.selectedMetros[0] === id
    ) {
      commitSelection([], source);
    } else {
      commitSelection([id], source);
    }
  };

 
  // Unified brush behavior
 

  window.handleMetroBrush = (
    values,
    event,
    source = "brush"
  ) => {
    const matched = unique(values);

    if (multiKey(event)) {
      // Modifier + brush adds to previous selection.
      window.addSelectedMetros(matched, source);
    } else {
      // Normal brush replaces previous selection.
      window.setSelectedMetros(matched, source);
    }
  };

  // Legacy function compatibility.
  window.selectMetro = (id, source = "chart") => {
    if (!id) {
      window.clearSelectedMetros(source);
    } else {
      window.handleMetroClick(id, null, source);
    }
  };

 
  // Linked hover
 

  function updateHover() {
    window.mapHover?.(shared.hovered);
    window.scatterHover?.(shared.hovered);
    window.barHover?.(shared.hovered);
  }

  window.hoverMetro = (value, source = "chart") => {
    const next = code(value);

    if (next === shared.hovered) return;

    shared.hovered = next;
    updateHover();

    document.dispatchEvent(
      new CustomEvent("housing:metroHovered", {
        detail: {
          cbsa_code: next,
          source
        }
      })
    );
  };

  document.addEventListener(
    "housing:metroHovered",
    event => {
      const next = code(event.detail?.cbsa_code);

      if (next !== shared.hovered) {
        shared.hovered = next;
        updateHover();
      }
    }
  );

 
  // Four-view updates
 

  function updateCharts() {
    if (!shared.rows) return;

    window.housingLineChart?.selectMetros?.(
      shared.selectedMetros,
      shared.year
    );

    window.drawScatterplot?.(
      shared.rows,
      shared.cbsa,
      shared.year
    );

    window.drawBarChart?.(
      shared.rows,
      shared.cbsa,
      shared.year
    );

    updateHover();
  }

  dispatch.on("selectionchange.coordinator", detail => {
    if (!detail) return;

    shared.selectedMetros = unique(
      Array.isArray(detail.selectedMetros)
        ? detail.selectedMetros
        : [detail.cbsa, detail.compare]
    );

    updateAliases();
    renderPanel();
    updateCharts();
  });

  dispatch.on("yearchange.coordinator", detail => {
    const next = Number(detail?.year);
    if (!YEARS.includes(next)) return;

    shared.year = next;

    d3.select("#chartyear")
      .property("value", String(next));

    renderPanel();
    updateCharts();
  });

  dispatch.on("metricchange.coordinator", detail => {
    const mapping = {
      renter: "burden_compare",
      owner: "burden_compare",
      gap: "burden_gap_renter_minus_mortgage_pp",
      income: "market_compare",
      value: "market_compare"
    };

    const next = mapping[detail?.metric];

    if (next) {
      window.housingLineChart?.setMetric?.(next);
    }
  });

  window.selectYear = value => {
    const next = Number(value);
    if (!YEARS.includes(next)) return;

    d3.select("#year-select")
      .property("value", String(next))
      .dispatch("change");
  };

  window.redrawScatterplot = () => {
    if (!shared.rows) return;

    drawScatterplot(
      shared.rows,
      shared.cbsa,
      shared.year
    );

    updateHover();
  };

  window.redrawBarChart = () => {
    if (!shared.rows) return;

    drawBarChart(
      shared.rows,
      shared.cbsa,
      shared.year
    );

    updateHover();
  };

  document.addEventListener(
    "housing:metroSelected",
    event => {
      const id = event.detail?.cbsa_code;

      if (id) {
        window.handleMetroClick(
          id,
          event.detail?.originalEvent || null,
          "linechart"
        );
      }
    }
  );

 
  // Existing controls
 

  d3.select("#scatter-mode")
    .on("change.coordinator", window.redrawScatterplot);

  for (const id of [
    "#chartmode",
    "#chartcount",
    "#bar-metric"
  ]) {
    d3.select(id)
      .on("change.coordinator", window.redrawBarChart);
  }

  d3.select("#chartyear")
    .on("change.coordinator", function() {
      window.selectYear(this.value);
    });

 
  // Load ACS data
 

  const numeric = [
    "renter_burden_pct",
    "mortgage_owner_burden_pct",
    "burden_gap_renter_minus_mortgage_pp",
    "median_household_income",
    "median_owner_home_value"
  ];

  d3.csv(
    "data/acs_metro_web_with_comparability.csv",
    raw => {
      const row = {
        ...raw,
        year: Number(raw.year),
        cbsa_code: code(raw.cbsa_code),
        trend_comparable:
          String(raw.trend_comparable)
            .trim().toLowerCase() === "true"
      };

      for (const key of numeric) {
        const value = raw[key];

        row[key] =
          value == null ||
          String(value).trim() === ""
            ? null
            : (
                Number.isFinite(Number(value))
                  ? Number(value)
                  : null
              );
      }

      return row;
    }
  )
    .then(rows => {
      shared.rows = rows;

      window.housingLineChart?.init(rows);

      renderPanel();
      updateCharts();
    })
    .catch(error => {
      console.error("ACS data load error:", error);

      d3.select("#dashboard-error")
        .text(
          "Unable to load ACS data. Open the project using a local HTTP server."
        );
    });

  renderPanel();
})();
