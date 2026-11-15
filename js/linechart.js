// All-metro trend visualization. Data and D3 v7 bundled with the project.
// Uses cbsa_code as the stable metro key and the same CustomEvent API as V3.
(() => {
  'use strict';
  const svg = d3.select('#line-chart');
  if (svg.empty()) return;
  const metroInput = d3.select('#metro-select');
  const compareInput = d3.select('#compare-select');
  const metricInput = d3.select('#metric-select');
  const contextInput = d3.select('#show-context');
  const countLabel = d3.select('#line-count');
  const note = d3.select('#line-message');
  const tooltip = d3.select('#line-tooltip');
  const holder = document.querySelector('.line-chart-holder');
  const W = 800, H = 360;
  const margin = {top:24, right:64, bottom:45, left:77};
  const years = [2021, 2022, 2023, 2024];
  const orange = '#e68132', blue = '#3e82bb';
  const metrics = {
    renter_burden_pct:{label:'Renter burden',unit:'percent'},
    mortgage_owner_burden_pct:{label:'Mortgage-owner burden',unit:'percent'},
    burden_gap_renter_minus_mortgage_pp:{label:'Renter − owner burden gap',unit:'pp'},
    median_household_income:{label:'Median household income',unit:'usd'},
    median_owner_home_value:{label:'Median home value',unit:'usd'}
  };
  let metros = [], selected = null, compare = null, hovered = null;
  let x, y, line, plot, contextLayer, hitLayer, focusLayer;

  svg.attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const valid = Number.isFinite;
  const money = d3.format(',.0f');
  function formatNumber(v, unit) {
    if (!valid(v)) return 'No data';
    return unit === 'usd' ? `$${money(v)}` : `${d3.format('.1f')(v)}${unit === 'pp' ? ' pp' : '%'}`;
  }
  function emit(type, code) {
    document.dispatchEvent(new CustomEvent(type, {detail:{cbsa_code:code, source:'linechart'}}));
  }
  function byCode(code) { return metros.find(d => d.code === String(code)); }
  function values(metro, key) {
    return metro.rows.filter(d => valid(d[key]));
  }
  function pointerTooltip(event, metro) {
    const key = metricInput.property('value');
    const units = metrics[key].unit;
    const rect = holder.getBoundingClientRect();
    const position = d3.pointer(event, svg.node());
    const yr = years.reduce((best, year) => Math.abs(x(year)-position[0]) < Math.abs(x(best)-position[0]) ? year : best, years[0]);
    const point = metro.rows.find(r => r.year === yr);
    const value = point ? formatNumber(point[key], units) : 'No data';
    tooltip.style('display', 'block')
      .text(`${metro.name} · ${yr}: ${value}`);
    const width = tooltip.node().offsetWidth;
    tooltip.style('left', `${Math.max(6, Math.min(event.clientX-rect.left+13, rect.width-width-6))}px`)
      .style('top', `${Math.max(4, event.clientY-rect.top-50)}px`);
  }
  function showHover(code) {
    if (hovered === code) return;
    hovered = code;
    paintFocus();
  }
  function clearHover() {
    if (hovered === null) return;
    hovered = null;
    tooltip.style('display', 'none');
    paintFocus();
    emit('housing:metroHovered', null);
  }
  function draw() {
    svg.selectAll('*').remove();
    tooltip.style('display', 'none');
    hovered = null;
    if (!metros.length) return;
    const key = metricInput.property('value');
    const unit = metrics[key].unit;
    // Keep a fixed y-domain across selection changes, avoiding misleading motion.
    const allValues = metros.flatMap(m => values(m, key).map(d => d[key]));
    if (!allValues.length) { note.text('No valid data for this measure.'); return; }
    const [low, high] = d3.extent(allValues);
    let padding = (high-low)*.055 || 1;
    let domain = unit === 'percent' ? [Math.max(0,low-padding), Math.min(100,high+padding)]
      : [low-padding,high+padding];
    if (unit === 'pp') domain = [Math.min(0,domain[0]), Math.max(0,domain[1])];
    x = d3.scalePoint().domain(years).range([margin.left,W-margin.right]);
    y = d3.scaleLinear().domain(domain).nice(5).range([H-margin.bottom,margin.top]);
    line = d3.line().defined(d => valid(d[key]))
      .x(d => x(d.year)).y(d => y(d[key]));
    // Split on missing values via d3.line().defined(); never connect absent years.
    const grid = svg.append('g').attr('class','trend-grid')
      .attr('transform',`translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W-margin.left-margin.right)).tickFormat(''));
    grid.select('.domain').remove();
    const fmtTick = unit === 'usd' ? d => '$'+d3.format('~s')(d) : d => `${d3.format('~g')(d)}${unit === 'pp' ? '' : '%'}`;
    svg.append('g').attr('class','trend-axis')
      .attr('transform',`translate(0,${H-margin.bottom})`)
      .call(d3.axisBottom(x).tickSizeOuter(0));
    svg.append('g').attr('class','trend-axis')
      .attr('transform',`translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(fmtTick).tickSizeOuter(0));
    // Clip all lines to plotting area; ensures no overhangs.
    svg.append('defs').append('clipPath').attr('id','trend-plot-clip-v4')
      .append('rect').attr('x',margin.left).attr('y',margin.top)
      .attr('width',W-margin.left-margin.right).attr('height',H-margin.top-margin.bottom);
    plot = svg.append('g').attr('clip-path','url(#trend-plot-clip-v4)');
    contextLayer = plot.append('g');
    focusLayer = plot.append('g');
    hitLayer = plot.append('g');
    const eligible = metros.filter(m=>values(m,key).length>=2);
    const contextOn = contextInput.property('checked');
    if (contextOn) {
      contextLayer.selectAll('path').data(eligible,d=>d.code).join('path')
        .attr('class','context-line').attr('d',m=>line(m.rows));
    }
    // Wide, invisible hit targets make the 393 thin paths easier to interact with.
    // Focus strokes are drawn above context but hit targets remain above focus.
    hitLayer.selectAll('path').data(contextOn ? eligible : eligible.filter(m=>m.code===selected || m.code===compare),d=>d.code).join('path')
      .attr('class','hit-line').attr('d',m=>line(m.rows))
      .on('mouseenter',(event,m)=>{showHover(m.code);emit('housing:metroHovered',m.code);pointerTooltip(event,m);})
      .on('mousemove',(event,m)=>{showHover(m.code);pointerTooltip(event,m);})
      .on('mouseleave',()=>{clearHover();})
      .on('click',(event,m)=>{event.stopPropagation();setSelected(m.code,true);pointerTooltip(event,m);});
    const selectedMetro = byCode(selected);
    countLabel.text(`${eligible.length} metros with ≥2 years of ${metrics[key].label.toLowerCase()} data`);
    if(selectedMetro){
      const cmp = selectedMetro.rows.length === 4 && selectedMetro.rows.every(d=>d.trend_comparable);
      note.text(cmp ? 'Hover over any line to preview it · Click to select · Chart scale stays fixed while switching metros.'
        : 'Selected metro has incomplete or potentially non-comparable years; interpret the trend with care.');
    }
    paintFocus();
  }
  function paintFocus() {
    if (!focusLayer) return;
    const key = metricInput.property('value');
    const chosen = [
      {metro:byCode(selected),color:orange,kind:'selected'},
      {metro:byCode(compare),color:blue,kind:'compare'},
      {metro:byCode(hovered),color:'#31465f',kind:'hover'}
    ].filter(s=>s.metro && (s.kind === 'hover' || values(s.metro,key).length));
    focusLayer.selectAll('*').remove();
    for (const s of chosen) {
      const g = focusLayer.append('g');
      g.append('path').datum(s.metro.rows)
        .attr('class',s.kind==='hover'?'hover-line':'focus-line')
        .attr('d',line).attr('stroke',s.color).attr('fill','none');
      g.selectAll('circle').data(values(s.metro,key)).join('circle')
        .attr('class','trend-point').attr('cx',d=>x(d.year)).attr('cy',d=>y(d[key]))
        .attr('r',s.kind==='hover'?3.8:4.3).attr('fill',s.color)
        .attr('stroke','white').attr('stroke-width',1.4);
      // Short labels at end-of-series; omit hover to limit collisions.
      if (s.kind !== 'hover') {
        const last=values(s.metro,key).at(-1);
        if(last) g.append('text').attr('class','focus-label')
          .attr('x',x(last.year)-9).attr('text-anchor','end').attr('y',y(last[key])-9)
          .attr('fill',s.color).text(s.kind==='selected'?'Selected':'Compare');
      }
    }
  }
  function setSelected(code,announce=false) {
    const metro = byCode(code);
    if(!metro) return;
    selected = metro.code;
    if(compare===selected){compare=null;compareInput.property('value','');}
    metroInput.property('value',selected);
    paintFocus();
    // Update comparability note without changing axes or background.
    const ok=metro.rows.length===4&&metro.rows.every(d=>d.trend_comparable);
    note.text(ok?'Hover over any line to preview it · Click a line to select · Click a different chart to link selections.'
      :'Selected metro has incomplete or potentially non-comparable years; interpret the trend with care.');
    if(announce)emit('housing:metroSelected',selected);
  }
  function setCompare(code) {
    compare = code && byCode(code) && code !== selected ? String(code) : null;
    compareInput.property('value',compare || '');
    paintFocus();
  }
  window.housingLineChart = {selectMetro: code=>setSelected(code), setCompare, setMetric: key=>{
    if(metrics[key]) {metricInput.property('value',key);draw();}
  }};
  // Incoming event from the team's map, scatterplot or bar chart.
  document.addEventListener('housing:metroSelected',e=>{
    if (e.detail?.source === 'linechart')return;
    if(e.detail?.cbsa_code!=null)setSelected(e.detail.cbsa_code);
  });
  document.addEventListener('housing:metroHovered',e=>{
    if(e.detail?.source === 'linechart')return;
    const code=e.detail?.cbsa_code;
    if(code!=null && byCode(code))showHover(String(code)); else clearHover();
  });
  metroInput.on('change',e=>setSelected(e.target.value,true));
  compareInput.on('change',e=>setCompare(e.target.value));
  metricInput.on('change',draw);
  contextInput.on('change',draw);
  const keys=Object.keys(metrics);
  d3.csv('data/acs_metro_web_with_comparability.csv', row=>{
    const result={...row,year:+row.year,cbsa_code:String(row.cbsa_code).trim(),
      trend_comparable:String(row.trend_comparable).trim().toLowerCase()==='true'};
    for(const key of keys)result[key]=row[key]===''?null:Number(row[key]);
    return result;
  }).then(rows=>{
    const grouped=d3.group(rows, d=>d.cbsa_code);
    metros=Array.from(grouped,([code,list])=>({code,name:list[0].metro_name,
      rows:years.map(year=>list.find(d=>d.year===year)||{year,cbsa_code:code,trend_comparable:false})})).sort((a,b)=>a.name.localeCompare(b.name));
    metroInput.selectAll('option').data(metros).join('option')
      .attr('value',d=>d.code).text(d=>d.name);
    compareInput.selectAll('option.metro-opt').data(metros).join('option')
      .attr('class','metro-opt').attr('value',d=>d.code).text(d=>d.name);
    // Use a recognizable default metro when available; change freely via controls.
    selected=(metros.find(d=>d.name.startsWith('Boston-Cambridge'))||metros[0])?.code;
    metroInput.property('value',selected);
    draw();
  }).catch(e=>{
    console.error('Failed to load trend CSV:',e);
    note.text('Unable to load data. Open this folder with a local server: python3 -m http.server 8000');
  });
})();
