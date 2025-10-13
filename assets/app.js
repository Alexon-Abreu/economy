
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}
function fmtTrillions(billions) { return (billions / 1000).toFixed(2); }
function fmtPct(x) { return (x * 100).toFixed(1) + "%"; }
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
    const data = hist.map(d => (d.buffett_ratio * 100).toFixed(2));
    const ctx = document.getElementById("biChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Buffett Indicator (%)", data, borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.parsed.y}%` } }
        },
        scales: {
          x: { display: true, ticks: { maxTicksLimit: 8 } },
          y: { display: true, ticks: { callback: (v) => v + "%" } }
        }
      }
    });
  } catch (e) { console.error(e); }
})();
