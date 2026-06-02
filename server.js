// server.js - Sicbo Prediction Server by @sewdangcap
// Deploy on Render.com - Node.js

const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const API_URL =
  "https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1";

// ─── Fetch data from source ───────────────────────────────────────────────────
async function fetchData() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error("Fetch failed: " + res.status);
  const json = await res.json();
  return json.data.resultList || [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getType(score) {
  if (score >= 4 && score <= 10) return "Xỉu";
  if (score >= 11 && score <= 17) return "Tài";
  return "Bão";
}

function viForType(type) {
  // Trả về 3 mốc tổng điểm đặc trưng, ví dụ Tài: "12-15-17"
  const xiuPools = [4,5,6,7,8,9,10];
  const taiPools = [11,12,13,14,15,16,17];
  const pool = type === "Xỉu" ? xiuPools : taiPools;
  // Chọn 3 số ngẫu nhiên không trùng từ pool, sort tăng dần
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3).sort((a,b) => a-b);
  return shuffled.join("-");
}

// ─── ALGORITHMS ───────────────────────────────────────────────────────────────

function algoStreak(history) {
  if (history.length < 3) return null;
  const types = history.slice(0, 5).map((r) => getType(r.score));
  const streak = types[0];
  let count = 1;
  for (let i = 1; i < types.length; i++) {
    if (types[i] === streak) count++;
    else break;
  }
  if (count >= 3) {
    const predict = streak === "Tài" ? "Xỉu" : "Tài";
    return { method: "Bẻ Cầu", predict, confidence: Math.min(50 + count * 8, 82) };
  }
  return { method: "Theo Cầu", predict: streak, confidence: 60 + count * 5 };
}

function algoMarkov(history) {
  if (history.length < 20) return null;
  const types = history.map((r) => getType(r.score));
  const transitions = { Tài: { Tài: 0, Xỉu: 0 }, Xỉu: { Tài: 0, Xỉu: 0 } };
  for (let i = 0; i < types.length - 1; i++) {
    const cur = types[i], next = types[i + 1];
    if (transitions[cur] && transitions[cur][next] !== undefined) transitions[cur][next]++;
  }
  const cur = types[0];
  if (cur === "Bão") return null;
  const t = transitions[cur];
  const total = t.Tài + t.Xỉu;
  if (total === 0) return null;
  const probTai = t.Tài / total, probXiu = t.Xỉu / total;
  const predict = probTai > probXiu ? "Tài" : "Xỉu";
  return { method: "Markov Chain", predict, confidence: Math.round(Math.max(probTai, probXiu) * 100) };
}

function algoFrequency(history) {
  if (history.length < 10) return null;
  const recent = history.slice(0, 20);
  let tai = 0, xiu = 0;
  recent.forEach((r) => { const t = getType(r.score); if (t === "Tài") tai++; else if (t === "Xỉu") xiu++; });
  const total = tai + xiu;
  if (total === 0) return null;
  const predict = tai > xiu * 1.4 ? "Xỉu" : xiu > tai * 1.4 ? "Tài" : getType(history[0].score);
  return { method: "Tần Suất", predict, confidence: Math.round(40 + (Math.max(tai, xiu) / total) * 45) };
}

function algoScoreTrend(history) {
  if (history.length < 10) return null;
  const scores = history.slice(0, 10).map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const recent3avg = (scores[0] + scores[1] + scores[2]) / 3;
  if (recent3avg > avg + 1.5) return { method: "Xu Hướng Điểm", predict: "Xỉu", confidence: Math.min(65 + Math.round((recent3avg - avg) * 3), 80) };
  if (recent3avg < avg - 1.5) return { method: "Xu Hướng Điểm", predict: "Tài", confidence: Math.min(65 + Math.round((avg - recent3avg) * 3), 80) };
  return { method: "Xu Hướng Điểm", predict: avg >= 10.5 ? "Tài" : "Xỉu", confidence: 55 };
}

function algoFibonacci(history) {
  if (history.length < 15) return null;
  const types = history.map((r) => getType(r.score));
  const fibIdx = [0, 1, 2, 3, 5, 8];
  const fibTypes = fibIdx.filter((i) => i < types.length).map((i) => types[i]);
  const tai = fibTypes.filter((t) => t === "Tài").length;
  const xiu = fibTypes.filter((t) => t === "Xỉu").length;
  return { method: "Fibonacci", predict: tai >= xiu ? "Tài" : "Xỉu", confidence: Math.round(50 + (Math.abs(tai - xiu) / fibTypes.length) * 30) };
}

function algoAlternating(history) {
  if (history.length < 6) return null;
  const types = history.slice(0, 6).map((r) => getType(r.score));
  let alternating = true;
  for (let i = 0; i < types.length - 1; i++) { if (types[i] === types[i + 1]) { alternating = false; break; } }
  if (alternating) return { method: "Cầu Xen Kẽ", predict: types[0] === "Tài" ? "Xỉu" : "Tài", confidence: 78 };
  return null;
}

function algoEnsemble(history) {
  const results = [
    algoStreak(history), algoMarkov(history), algoFrequency(history),
    algoScoreTrend(history), algoFibonacci(history), algoAlternating(history),
  ].filter(Boolean);
  if (results.length === 0) return null;
  let scoreTai = 0, scoreXiu = 0;
  results.forEach((r) => { const w = r.confidence / 100; if (r.predict === "Tài") scoreTai += w; else scoreXiu += w; });
  const predict = scoreTai >= scoreXiu ? "Tài" : "Xỉu";
  const totalWeight = scoreTai + scoreXiu;
  return { method: "Tổng Hợp AI", predict, confidence: Math.round((Math.max(scoreTai, scoreXiu) / totalWeight) * 100) };
}

// ─── Build pattern string ─────────────────────────────────────────────────────
function buildPattern(history) {
  return history
    .slice(0, 30)
    .map((r) => (getType(r.score) === "Tài" ? "t" : "x"))
    .reverse()
    .join("");
}

// ─── Build prediction response ────────────────────────────────────────────────
function buildPrediction(history) {
  if (!history || history.length === 0) return null;
  const current = history[0];
  const currentNum = parseInt(current.gameNum.replace("#", ""));

  const ensemble = algoEnsemble(history);
  const du_doan = ensemble ? ensemble.predict : getType(current.score) === "Tài" ? "Xỉu" : "Tài";
  const confidence = ensemble ? ensemble.confidence : 55;

  const vi = viForType(du_doan);

  return {
    phien_hien_tai: currentNum,
    ket_qua: getType(current.score),
    xuc_xac: current.facesList,
    phien_du_doan: currentNum + 1,
    du_doan,
    vi,
    do_tin_cay: confidence + "%",
    pattern: buildPattern(history),
    id: "@sewdangcap",
  };
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "online", author: "@sewdangcap", endpoints: ["/sicbosun", "/history", "/algorithms"] });
});

app.get("/sicbosun", async (req, res) => {
  try {
    const history = await fetchData();
    const prediction = buildPrediction(history);
    if (!prediction) return res.status(500).json({ loi: "Không có dữ liệu" });
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ loi: err.message });
  }
});

app.get("/history", async (req, res) => {
  try {
    const history = await fetchData();
    const size = parseInt(req.query.size) || 20;
    const danh_sach = history.slice(0, size).map((r) => ({
      phien: parseInt(r.gameNum.replace("#", "")),
      ket_qua: getType(r.score),
      xuc_xac: r.facesList,
      tong: r.score,
      thoi_gian: r.timeMilli,
    }));
    res.json({ tong_phien: danh_sach.length, danh_sach, id: "@sewdangcap" });
  } catch (err) {
    res.status(500).json({ loi: err.message });
  }
});

app.get("/algorithms", async (req, res) => {
  try {
    const history = await fetchData();
    res.json({
      be_cau: algoStreak(history),
      markov: algoMarkov(history),
      tan_suat: algoFrequency(history),
      xu_huong_diem: algoScoreTrend(history),
      fibonacci: algoFibonacci(history),
      cau_xen_ke: algoAlternating(history),
      tong_hop: algoEnsemble(history),
      id: "@sewdangcap",
    });
  } catch (err) {
    res.status(500).json({ loi: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Sicbo Server by @sewdangcap running on port ${PORT}`);
});
