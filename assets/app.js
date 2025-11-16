
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}
function fmtTrillions(billions) { return (billions / 1000).toFixed(2); }
function fmtPct(x) { return (x * 100).toFixed(1) + "%"; }

const hoverLinePlugin = {
  id: "hoverLine",
  afterDraw(chart) {
    const tooltip = chart.tooltip;
    const activeElements = tooltip && typeof tooltip.getActiveElements === "function" ? tooltip.getActiveElements() : [];
    if (!activeElements || activeElements.length === 0) return;
    const { ctx, chartArea: { top, bottom } } = chart;
    const x = activeElements[0].element.x;
    const opts = (chart.options.plugins && chart.options.plugins.hoverLine) || {};
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = opts.lineWidth || 1;
    ctx.strokeStyle = opts.color || "rgba(255,255,255,0.5)";
    ctx.setLineDash(opts.lineDash || [4, 4]);
    ctx.stroke();
    ctx.restore();
  }
};

Chart.register(hoverLinePlugin);
(async () => {
  try {
    const latest = await fetchJSON("data/latest.json");
    document.getElementById("buffettPct").textContent = fmtPct(latest.buffett_ratio);
    document.getElementById("marketCapTn").textContent = fmtTrillions(latest.market_cap_billion);
    document.getElementById("w5000Level").textContent = latest.w5000_close?.toLocaleString();
    document.getElementById("gdpTn").textContent = fmtTrillions(latest.gdp_billion_saar);
    document.getElementById("updatedAt").textContent = new Date(latest.generated_at).toLocaleString();
    document.getElementById("year").textContent = new Date().getFullYear();

    const hist = await fetchJSON("data/history.json");
    const labels = hist.map(d => d.date);
    const data = hist.map(d => Number((d.buffett_ratio * 100).toFixed(2)));
    const ctx = document.getElementById("biChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{
        label: "Buffett Indicator (%)",
        data,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.25
      }] },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: false,
            callbacks: {
              label: (c) => `${c.label}: ${Number(c.parsed.y).toFixed(2)}%`
            }
          },
          hoverLine: { color: "rgba(255,255,255,0.6)", lineDash: [6, 6], lineWidth: 1 }
        },
        scales: {
          x: { display: true, ticks: { maxTicksLimit: 8 } },
          y: { display: true, ticks: { callback: (v) => v + "%" } }
        }
      }
    });
  } catch (e) { console.error(e); }
})();
