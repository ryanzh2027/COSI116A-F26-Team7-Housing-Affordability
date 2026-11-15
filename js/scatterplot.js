function renderScatterplot() {

  // -----------------------------
  // 1. Chart size and margins
  // -----------------------------
  const margin = {
    top: 60,
    right: 40,
    bottom: 75,
    left: 80
  };

  const width = 760 - margin.left - margin.right;
  const height = 520 - margin.top - margin.bottom;


  // -----------------------------
  // 2. Load ACS data
  // -----------------------------
  d3.csv("data/acs_metro_web_with_comparability.csv", d => ({

    year: +d.year,

    cbsa_code: d.cbsa_code,

    metro_name: d.metro_name,

    renter_burden_pct:
      d.renter_burden_pct === ""
        ? NaN
        : +d.renter_burden_pct,

    mortgage_owner_burden_pct:
      d.mortgage_owner_burden_pct === ""
        ? NaN
        : +d.mortgage_owner_burden_pct,

    gap:
      d.burden_gap_renter_minus_mortgage_pp === ""
        ? NaN
        : +d.burden_gap_renter_minus_mortgage_pp,

    trend_comparable:
      d.trend_comparable === "True"

  })).then(data => {


    // -----------------------------
    // 3. Keep only comparable 2024 metros
    // -----------------------------
    const filteredData = data.filter(d =>
      d.year === 2024 &&
      d.trend_comparable &&
      Number.isFinite(d.renter_burden_pct) &&
      Number.isFinite(d.mortgage_owner_burden_pct) &&
      Number.isFinite(d.gap)
    );


    // -----------------------------
    // 4. Create SVG
    // -----------------------------
    const svg = d3.select("#scatterplot")
      .append("svg")
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right}
        ${height + margin.top + margin.bottom}`
      )
      .attr("preserveAspectRatio", "xMidYMid meet");


    const chart = svg.append("g")
      .attr(
        "transform",
        `translate(${margin.left},${margin.top})`
      );


    // -----------------------------
    // 5. Create scales
    // -----------------------------
    const x = d3.scaleLinear()
      .domain(
        d3.extent(
          filteredData,
          d => d.mortgage_owner_burden_pct
        )
      )
      .nice()
      .range([0, width]);


    const y = d3.scaleLinear()
      .domain(
        d3.extent(
          filteredData,
          d => d.renter_burden_pct
        )
      )
      .nice()
      .range([height, 0]);


    // -----------------------------
    // 6. Draw axes
    // -----------------------------
    chart.append("g")
      .attr(
        "transform",
        `translate(0,${height})`
      )
      .call(d3.axisBottom(x));


    chart.append("g")
      .call(d3.axisLeft(y));


    // -----------------------------
    // 7. Axis labels
    // -----------------------------
    chart.append("text")
      .attr("class", "axis-label")
      .attr("x", width / 2)
      .attr("y", height + 55)
      .attr("text-anchor", "middle")
      .text(
        "Mortgaged-owner cost burden rate (%)"
      );


    chart.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", -55)
      .attr("text-anchor", "middle")
      .text(
        "Renter cost burden rate (%)"
      );


    // -----------------------------
    // 8. Chart title
    // -----------------------------
    svg.append("text")
      .attr("class", "chart-title")
      .attr("x", margin.left)
      .attr("y", 30)
      .text(
        "Renter vs. Mortgaged-Owner Housing Cost Burden, 2024"
      );


    // -----------------------------
    // 9. Equality line: y = x
    // -----------------------------
    const lineMin = Math.max(
      x.domain()[0],
      y.domain()[0]
    );

    const lineMax = Math.min(
      x.domain()[1],
      y.domain()[1]
    );


    chart.append("line")
      .attr("class", "equality-line")
      .attr("x1", x(lineMin))
      .attr("y1", y(lineMin))
      .attr("x2", x(lineMax))
      .attr("y2", y(lineMax));


    // Label for equality line
    chart.append("text")
      .attr("x", x(lineMax) - 5)
      .attr("y", y(lineMax) - 8)
      .attr("text-anchor", "end")
      .style("font-size", "11px")
      .style("fill", "#666")
      .text("Equal burden");


    // -----------------------------
    // 10. Define burden groups
    // -----------------------------
    function burdenGroup(d) {

      if (d.gap > 5) {
        return "renter-higher";
      }

      if (d.gap < -5) {
        return "owner-higher";
      }

      return "similar";
    }


    function pointColor(d) {

      const group = burdenGroup(d);

      if (group === "renter-higher") {
        return "#e76f51";
      }

      if (group === "owner-higher") {
        return "#457b9d";
      }

      return "#999999";
    }


    // -----------------------------
    // 11. Tooltip
    // -----------------------------

    // Remove an old tooltip if the script gets
    // run more than once
    d3.selectAll(".scatter-tooltip").remove();


    const tooltip = d3.select("body")
      .append("div")
      .attr("class", "scatter-tooltip")
      .style("opacity", 0);


    // -----------------------------
    // 12. Draw metro points
    // -----------------------------
    chart.selectAll(".metro-point")
      .data(filteredData)
      .enter()
      .append("circle")

      .attr("class", "metro-point")

      .attr(
        "cx",
        d => x(d.mortgage_owner_burden_pct)
      )

      .attr(
        "cy",
        d => y(d.renter_burden_pct)
      )

      .attr("r", 5)

      .attr(
        "fill",
        d => pointColor(d)
      )

      .attr("opacity", 0.78)


      // Hover starts
      .on("mouseover", function(event, d) {

        d3.select(this)
          .attr("r", 8)
          .attr("stroke", "#222")
          .attr("stroke-width", 1.5)
          .attr("opacity", 1);


        tooltip
          .style("opacity", 1)
          .html(`
            <strong>${d.metro_name}</strong>
            <br>
            Renter burden:
            ${d.renter_burden_pct.toFixed(1)}%
            <br>
            Mortgaged-owner burden:
            ${d.mortgage_owner_burden_pct.toFixed(1)}%
            <br>
            Renter − owner gap:
            ${d.gap.toFixed(1)} pp
          `);
      })


      // Tooltip follows mouse
      .on("mousemove", function(event) {

        tooltip
          .style(
            "left",
            (event.pageX + 15) + "px"
          )
          .style(
            "top",
            (event.pageY - 25) + "px"
          );
      })


      // Hover ends
      .on("mouseout", function() {

        d3.select(this)
          .attr("r", 5)
          .attr("stroke", "none")
          .attr("opacity", 0.78);


        tooltip
          .style("opacity", 0);
      });


    // -----------------------------
    // 13. Legend
    // -----------------------------
    const legendData = [

      {
        label: "Renter burden > owner burden by more than 5 pp",
        color: "#e76f51"
      },

      {
        label: "Similar burden (within ±5 pp)",
        color: "#999999"
      },

      {
        label: "Owner burden > renter burden by more than 5 pp",
        color: "#457b9d"
      }

    ];


    const legend = chart.append("g")
      .attr("class", "scatter-legend")
      .attr(
        "transform",
        `translate(${width - 285}, 10)`
      );


    // White background behind legend
    legend.append("rect")
      .attr("x", -10)
      .attr("y", -15)
      .attr("width", 295)
      .attr("height", 92)
      .attr("fill", "white")
      .attr("opacity", 0.9)
      .attr("stroke", "#ddd")
      .attr("rx", 4);


    // Legend title
    legend.append("text")
      .attr("x", 0)
      .attr("y", 3)
      .style("font-size", "12px")
      .style("font-weight", "600")
      .text("Renter–owner burden gap");


    // Legend circles
    legend.selectAll(".legend-circle")
      .data(legendData)
      .enter()
      .append("circle")
      .attr("class", "legend-circle")
      .attr("cx", 5)
      .attr(
        "cy",
        (d, i) => 23 + i * 20
      )
      .attr("r", 5)
      .attr(
        "fill",
        d => d.color
      );


    // Legend text
    legend.selectAll(".legend-text")
      .data(legendData)
      .enter()
      .append("text")
      .attr("class", "legend-text")
      .attr("x", 17)
      .attr(
        "y",
        (d, i) => 27 + i * 20
      )
      .style("font-size", "10px")
      .text(d => d.label);


    // -----------------------------
    // 14. Console check
    // -----------------------------
    console.log(
      "Scatterplot metros:",
      filteredData.length
    );

  })

  .catch(error => {

    console.error(
      "Error loading scatterplot data:",
      error
    );

  });

}


// -----------------------------
// Run chart
// -----------------------------
renderScatterplot();