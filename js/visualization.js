d3.csv("data/acs_metro_web.csv").then(data => {
  console.log(data[0]);
  const metros2024 = data.filter(d => d.year === "2024");
  console.table(metros2024);
  console.log("2024 rows:", metros2024.length);

  const margin = {top: 20, right: 20, bottom: 55, left: 300};
  const width = 800 - margin.left - margin.right;


  const svg = d3.select("#barchartsvg")
    .attr("width", width + margin.left + margin.right)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  function drawChart(year) {
    svg.selectAll("*").remove(); 

    const metrosForYear = data.filter(d => d.year === year);
    const ranked = metrosForYear
      .filter(d => d.renter_burden_pct.trim() !== "")
      .sort((a, b) => Number(b.renter_burden_pct) - Number(a.renter_burden_pct));

    const mode = modeDropdown.property("value");
    const requestedCount = Math.floor(countInput.property("valueAsNumber")) || 10;
    const n = Math.max(1, Math.min(requestedCount, ranked.length));

    countInput.attr("max", ranked.length).property("disabled", mode === "all");

    let visibleMetros = ranked;
    if (mode === "top") visibleMetros = ranked.slice(0, n);
    if (mode === "bottom") visibleMetros = ranked.slice(-n).reverse();

    const height = Math.max(1, visibleMetros.length) * 26;
    const svgHeight = height + margin.top + margin.bottom;

    d3.select("#barchartsvg")
      .attr("height", svgHeight)
      .attr("viewBox", `0 0 800 ${svgHeight}`);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(visibleMetros, d => Number(d.renter_burden_pct))])
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

    svg.selectAll("rect")
      .data(visibleMetros)
      .join("rect")
      .attr("x", xScale(0))
      .attr("y", d => yScale(d.metro_name))
      .attr("width", d => xScale(Number(d.renter_burden_pct)) - xScale(0))
      .attr("height", yScale.bandwidth())
      .attr("fill", "steelblue");
    }
   const yearDropdown = d3.select("#chartyear");
   const modeDropdown = d3.select("#chartmode");
   const countInput = d3.select("#chartcount");

   function updateChart() {
      drawChart(yearDropdown.property("value"));
    }

    yearDropdown.on("change", updateChart);
    modeDropdown.on("change", updateChart);
    countInput.on("change", updateChart);

    updateChart();
      
});
