
d3.csv("data/acs_metro_web.csv").then(data => {

  const margin = { top: 20, right: 20, bottom: 55, left: 300 };
  const width = 800 - margin.left - margin.right;

  const svg = d3.select("#barchartsvg")
    .attr("width", 800)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const yearDropdown = d3.select("#chartyear");
  const modeDropdown = d3.select("#chartmode");
  const countInput = d3.select("#chartcount");

  // Tooltip
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "bar-tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("pointer-events", "none");

  let selectedMetro = null;

  function drawChart(year) {

    svg.selectAll("*").remove();

    const metrosForYear = data.filter(d => d.year === year);

    const ranked = metrosForYear
      .filter(d => d.renter_burden_pct.trim() !== "")
      .sort((a, b) =>
        Number(b.renter_burden_pct) - Number(a.renter_burden_pct)
      );

    const mode = modeDropdown.property("value");
    const requestedCount =
      Math.floor(countInput.property("valueAsNumber")) || 10;

    const n = Math.max(1, Math.min(requestedCount, ranked.length));

    countInput
      .attr("max", ranked.length)
      .property("disabled", mode === "all");

    let visibleMetros = ranked;

    if (mode === "top") {
      visibleMetros = ranked.slice(0, n);
    }

    if (mode === "bottom") {
      visibleMetros = ranked.slice(-n).reverse();
    }

    const height = Math.max(1, visibleMetros.length) * 26;
    const svgHeight = height + margin.top + margin.bottom;

    d3.select("#barchartsvg")
      .attr("height", svgHeight)
      .attr("viewBox", `0 0 800 ${svgHeight}`);

    const xScale = d3.scaleLinear()
      .domain([
        0,
        d3.max(visibleMetros, d => Number(d.renter_burden_pct)) || 1
      ])
      .nice()
      .range([0, width]);

    const yScale = d3.scaleBand()
      .domain(visibleMetros.map(d => d.metro_name))
      .range([0, height])
      .padding(0.2);

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `${d}%`));

    svg.append("g")
      .call(d3.axisLeft(yScale));

    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height + 42)
      .attr("text-anchor", "middle")
      .text("Housing cost burden (%)");

    svg.append("text")
      .attr("x", -margin.left + 10)
      .attr("y", -6)
      .attr("font-weight", "bold")
      .text("Metro Area");

    // Bars
    svg.selectAll(".metro-bar")
      .data(visibleMetros)
      .join("rect")
      .attr("class", "metro-bar")
      .attr("x", xScale(0))
      .attr("y", d => yScale(d.metro_name))
      .attr("width", d =>
        xScale(Number(d.renter_burden_pct)) - xScale(0)
      )
      .attr("height", yScale.bandwidth())
      .attr("fill", d =>
        d.cbsa_code === selectedMetro ? "#ef8735" : "steelblue"
      )
      .style("cursor", "pointer")

      // Tooltip
      .on("mouseover", function(event, d) {
        tooltip
          .style("display", "block")
          .text(
            `${d.metro_name}: ${Number(d.renter_burden_pct).toFixed(1)}%`
          );
      })

      .on("mousemove", function(event) {
        tooltip
          .style("left", `${event.pageX + 12}px`)
          .style("top", `${event.pageY - 25}px`);
      })

      .on("mouseout", function() {
        tooltip.style("display", "none");
      })

      // Select metro
      .on("click", function(event, d) {

        selectedMetro = d.cbsa_code;

        document.dispatchEvent(
          new CustomEvent("housing:metroSelected", {
            detail: {
              cbsa_code: d.cbsa_code,
              source: "barchart"
            }
          })
        );

        updateChart();
      });
  }

  function updateChart() {
    drawChart(yearDropdown.property("value"));
  }

  // Receive selection from other charts
  document.addEventListener("housing:metroSelected", function(event) {

    selectedMetro = event.detail.cbsa_code;

    svg.selectAll(".metro-bar")
      .attr("fill", d =>
        d.cbsa_code === selectedMetro ? "#ef8735" : "steelblue"
      );
  });

  yearDropdown.on("change", updateChart);
  modeDropdown.on("change", updateChart);
  countInput.on("change", updateChart);

  updateChart();

}).catch(error => {
  console.error("Failed to load bar chart data:", error);
});
