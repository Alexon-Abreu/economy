
async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}
function fmtTrillions(billions) { return (billions / 1000).toFixed(2); }
function fmtPct(x) { return (x * 100).toFixed(1) + "%"; }
const STD_LABEL_YEAR = 1984;
const PEAK_START = new Date("1999-01-01");
const PEAK_END = new Date("2001-12-31");
const PEAK_START_MS = PEAK_START.getTime();
const PEAK_END_MS = PEAK_END.getTime();

function linearRegression(xs, ys) {
  if (!xs.length || xs.length !== ys.length) return { slope: 0, intercept: ys[0] || 0 };
  const mean = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  const slopeDen = xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0) || 1;
  const slopeNum = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
  const slope = slopeNum / slopeDen;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

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

const stdLabelPlugin = {
  id: "stdLabel",
  afterDatasetsDraw(chart) {
    const opts = (chart.options.plugins && chart.options.plugins.stdLabel) || {};
    const labels = chart.data.labels || [];
    const fallbackIndex = labels.length ? Math.floor(labels.length / 2) : 0;
    const clampMargin = typeof opts.clampMargin === "number" ? opts.clampMargin : 12;
    chart.data.datasets.forEach((ds, datasetIndex) => {
      if (!ds.stdLabel) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      const points = meta?.data || [];
      const idx = Math.min(points.length - 1, Math.max(0, typeof ds.labelIndex === "number" ? ds.labelIndex : fallbackIndex));
      const targetPoint = points[idx];
      if (!targetPoint) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = ds.labelFont || opts.font || "12px 'Inter', sans-serif";
      ctx.textAlign = ds.labelAlign || opts.align || "center";
      ctx.textBaseline = ds.labelBaseline || opts.baseline || "middle";
      const offsetX = typeof ds.labelOffsetX === "number" ? ds.labelOffsetX : (opts.offsetX || 0);
      const offsetY = typeof ds.labelOffsetY === "number" ? ds.labelOffsetY : (opts.offsetY || 0);
      const chartArea = chart.chartArea || { left: 0, right: chart.width, top: 0, bottom: chart.height };
      const clampedX = Math.max(chartArea.left + clampMargin, Math.min(chartArea.right - clampMargin, targetPoint.x + offsetX));
      const clampedY = Math.max(chartArea.top + clampMargin, Math.min(chartArea.bottom - clampMargin, targetPoint.y + offsetY));
      const strokeColor = ds.labelStrokeColor || opts.strokeColor;
      const strokeWidth = typeof ds.labelStrokeWidth === "number" ? ds.labelStrokeWidth : (opts.strokeWidth || 0);
      if (strokeColor && strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = strokeColor;
        ctx.lineJoin = "round";
        ctx.strokeText(ds.stdLabel, clampedX, clampedY);
      }
      ctx.fillStyle = ds.labelColor || ds.borderColor || "#666";
      ctx.fillText(ds.stdLabel, clampedX, clampedY);
      ctx.restore();
    });
  }
};

Chart.register(hoverLinePlugin, stdLabelPlugin);
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
    if (!hist.length) return;
    const labels = hist.map(d => d.date);
    const ratiosPct = hist.map(d => Number((d.buffett_ratio * 100).toFixed(2)));

    // Fit an exponential trend (linear regression in log space) to mimic the canonical Buffett Indicator curvature.
    const xs = hist.map((_, idx) => idx);
    const safeRatios = ratiosPct.map(v => Math.max(v, 0.1));
    const logRatios = safeRatios.map(Math.log);
    const { slope, intercept } = linearRegression(xs, logRatios);
    const logPred = xs.map(x => slope * x + intercept);
    const trendLine = logPred.map(v => Number(Math.exp(v).toFixed(2)));
    const residuals = logRatios.map((v, i) => v - logPred[i]);
    let stdLog = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(residuals.length - 1, 1));

    const peakIndex = (() => {
      let idx = -1;
      let best = -Infinity;
      labels.forEach((dateStr, i) => {
        const d = new Date(dateStr);
        const ms = d.getTime();
        const inWindow = !Number.isNaN(ms) && ms >= PEAK_START_MS && ms <= PEAK_END_MS;
        if (inWindow && ratiosPct[i] > best) {
          best = ratiosPct[i];
          idx = i;
        }
      });
      if (idx !== -1) return idx;
      const maxVal = Math.max(...ratiosPct);
      return ratiosPct.indexOf(maxVal);
    })();
    if (peakIndex >= 0) {
      const targetDiff = Math.log(safeRatios[peakIndex]) - logPred[peakIndex];
      if (isFinite(targetDiff) && targetDiff > 0) {
        stdLog = targetDiff / 2;
      }
    }
    const sdBand = (mult) => trendLine.map(base => Number((base * Math.exp(mult * stdLog)).toFixed(2)));

    const labelYearIndex = labels.findIndex((d) => d.startsWith(String(STD_LABEL_YEAR)));
    const anchorIndex = labelYearIndex >= 0 ? labelYearIndex : Math.floor(labels.length / 2);
    const stdDataset = (cfg) => ({
      ...cfg,
      labelIndex: typeof cfg.labelIndex === "number" ? cfg.labelIndex : anchorIndex,
      tension: 0.35,
      cubicInterpolationMode: "monotone",
      spanGaps: true,
      order: cfg.order ?? 1,
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 0,
      borderWidth: cfg.borderWidth ?? 1.5,
      borderDash: cfg.borderDash || [9, 6],
      plugins: { tooltip: { enabled: false } }
    });

    const datasets = [
      stdDataset({ label: "-2σ", stdLabel: "{ -2 Std Dev }", labelOffsetY: -10, labelOffsetX: -50, labelColor: "#15803d", data: sdBand(-2), borderColor: "#15803d" }),
      stdDataset({ label: "-1σ", stdLabel: "{ -1 Std Dev }", labelOffsetY: -15, labelOffsetX: -50, labelColor: "#65a30d", data: sdBand(-1), borderColor: "#65a30d" }),
      stdDataset({ label: "Trend", stdLabel: "{ Historical Trend Line }", labelColor: "#737373", borderDash: [7, 5], data: trendLine, borderColor: "#737373", labelOffsetY: -15, labelOffsetX: -50, labelIndex: anchorIndex, order: 2 }),
      stdDataset({ label: "+1σ", stdLabel: "{ +1 Std Dev }", labelOffsetY: -15, labelOffsetX: -50, labelColor: "#f97316", data: sdBand(1), borderColor: "#f97316" }),
      stdDataset({ label: "+2σ", stdLabel: "{ +2 Std Dev }", labelOffsetY: -15, labelOffsetX: -50, labelColor: "#dc2626", data: sdBand(2), borderColor: "#dc2626" }),
      {
        label: "Buffett Indicator (%)",
        data: ratiosPct,
        borderColor: "#2563eb",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.25,
        order: 10
      }
    ];

    const ctx = document.getElementById("biChart").getContext("2d");
    new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: false,
            filter: (ctx) => ctx.dataset?.label === "Buffett Indicator (%)",
            callbacks: {
              label: (c) => `${c.label}: ${Number(c.parsed.y).toFixed(2)}%`
            }
          },
          hoverLine: { color: "rgba(255,255,255,0.6)", lineDash: [6, 6], lineWidth: 1 },
          stdLabel: { font: "12px 'Inter', sans-serif", strokeColor: "rgba(15,23,42,0.7)", strokeWidth: 4, clampMargin: 16 }
        },
        scales: {
          x: { display: true, ticks: { maxTicksLimit: 8 } },
          y: { display: true, ticks: { callback: (v) => v + "%" } }
        }
      }
    });
  } catch (e) { console.error(e); }
})();
