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
  return "Bão"; // triple
}

function randomDiceForType(type) {
  // Returns 3 dice values that sum to a typical score for the type
  if (type === "Xỉu") {
    // sum 4-10
    const options = [
      [1, 2, 3],
      [1, 2, 4],
      [1, 3, 3],
      [2, 2, 3],
      [1, 3, 5],
      [2, 3, 4],
      [1, 4, 4],
      [2, 3, 5],
      [2, 4, 4],
      [3, 3, 4],
    ];
    return options[Math.floor(Math.random() * options.length)];
  } else {
    // Tài sum 11-17
    const options = [
      [3, 4, 4],
      [3, 4, 5],
      [4, 4, 4],
      [3, 4, 6],
      [4, 4, 5],
      [3, 5, 6],
      [4, 5, 5],
      [4, 5, 6],
      [5, 5, 5],
      [5, 5, 6],
      [5, 6, 6],
      [6, 6, 5],
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
}

// ─── ALGORITHMS ───────────────────────────────────────────────────────────────

// 1. Pattern Streak - đếm cầu liên tiếp
function algoStreak(history) {
  if (history.length < 3) return null;
  const last = history.slice(0, 5);
  const types = last.map((r) => getType(r.score));
  const streak = types[0];
  let count = 1;
  for (let i = 1; i < types.length; i++) {
    if (types[i] === streak) count++;
    else break;
  }
  if (count >= 3) {
    // Cầu dài -> bẻ cầu
    const predict = streak === "Tài" ? "Xỉu" : "Tài";
    const confidence = Math.min(50 + count * 8, 82);
    return { method: "Bẻ Cầu", predict, confidence, streakCount: count };
  }
  // Cầu ngắn -> theo cầu
  const predict = streak;
  return { method: "Theo Cầu", predict, confidence: 60 + count * 5, streakCount: count };
}

// 2. Markov Chain - xác suất chuyển trạng thái
function algoMarkov(history) {
  if (history.length < 20) return null;
  const types = history.map((r) => getType(r.score));
  const transitions = { Tài: { Tài: 0, Xỉu: 0 }, Xỉu: { Tài: 0, Xỉu: 0 } };
  for (let i = 0; i < types.length - 1; i++) {
    const cur = types[i];
    const next = types[i + 1];
    if (transitions[cur] && transitions[cur][next] !== undefined) {
      transitions[cur][next]++;
    }
  }
  const cur = types[0];
  if (cur === "Bão") return null;
  const t = transitions[cur];
  const total = t.Tài + t.Xỉu;
  if (total === 0) return null;
  const probTai = t.Tài / total;
  const probXiu = t.Xỉu / total;
  const predict = probTai > probXiu ? "Tài" : "Xỉu";
  const confidence = Math.round(Math.max(probTai, probXiu) * 100);
  return { method: "Markov Chain", predict, confidence };
}

// 3. Frequency Analysis - phân tích tần suất gần đây
function algoFrequency(history) {
  if (history.length < 10) return null;
  const recent = history.slice(0, 20);
  let tai = 0,
    xiu = 0;
  recent.forEach((r) => {
    const t = getType(r.score);
    if (t === "Tài") tai++;
    else if (t === "Xỉu") xiu++;
  });
  const total = tai + xiu;
  if (total === 0) return null;
  // Nếu 1 bên xuất hiện nhiều -> bên kia sắp về
  const predict = tai > xiu * 1.4 ? "Xỉu" : xiu > tai * 1.4 ? "Tài" : getType(history[0].score);
  const ratio = Math.max(tai, xiu) / total;
  const confidence = Math.round(40 + ratio * 45);
  return { method: "Tần Suất", predict, confidence };
}

// 4. Score Average Trend - xu hướng tổng điểm
function algoScoreTrend(history) {
  if (history.length < 10) return null;
  const scores = history.slice(0, 10).map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const recent3avg = (scores[0] + scores[1] + scores[2]) / 3;
  let predict, confidence;
  if (recent3avg > avg + 1.5) {
    predict = "Xỉu";
    confidence = Math.min(65 + Math.round((recent3avg - avg) * 3), 80);
  } else if (recent3avg < avg - 1.5) {
    predict = "Tài";
    confidence = Math.min(65 + Math.round((avg - recent3avg) * 3), 80);
  } else {
    predict = avg >= 10.5 ? "Tài" : "Xỉu";
    confidence = 55;
  }
  return { method: "Xu Hướng Điểm", predict, confidence };
}

// 5. Fibonacci Pattern - chu kỳ Fibonacci
function algoFibonacci(history) {
  if (history.length < 15) return null;
  const types = history.map((r) => getType(r.score));
  // Check fib positions: 1,1,2,3,5,8
  const fibIdx = [0, 1, 2, 3, 5, 8];
  const fibTypes = fibIdx.filter((i) => i < types.length).map((i) => types[i]);
  let tai = fibTypes.filter((t) => t === "Tài").length;
  let xiu = fibTypes.filter((t) => t === "Xỉu").length;
  const predict = tai >= xiu ? "Tài" : "Xỉu";
  const confidence = Math.round(50 + (Math.abs(tai - xiu) / fibTypes.length) * 30);
  return { method: "Fibonacci", predict, confidence };
}

// 6. Double Pattern - bắt cầu 1-1 (xen kẽ)
function algoAlternating(history) {
  if (history.length < 6) return null;
  const types = history.slice(0, 6).map((r) => getType(r.score));
  let alternating = true;
  for (let i = 0; i < types.length - 1; i++) {
    if (types[i] === types[i + 1]) { alternating = false; break; }
  }
  if (alternating) {
    const predict = types[0] === "Tài" ? "Xỉu" : "Tài";
    return { method: "Cầu Xen Kẽ", predict, confidence: 78 };
  }
  return null;
}

// 7. Weighted Ensemble - tổng hợp có trọng số
function algoEnsemble(history) {
  const results = [
    algoStreak(history),
    algoMarkov(history),
    algoFrequency(history),
    algoScoreTrend(history),
    algoFibonacci(history),
    algoAlternating(history),
  ].filter(Boolean);

  if (results.length === 0) return null;

  let scoreTai = 0, scoreXiu = 0;
  results.forEach((r) => {
    const w = r.confidence / 100;
    if (r.predict === "Tài") scoreTai += w;
    else scoreXiu += w;
  });

  const predict = scoreTai >= scoreXiu ? "Tài" : "Xỉu";
  const totalWeight = scoreTai + scoreXiu;
  const confidence = Math.round((Math.max(scoreTai, scoreXiu) / totalWeight) * 100);
  return { method: "Tổng Hợp AI", predict, confidence, subAlgos: results.length };
}

// ─── Build prediction response ────────────────────────────────────────────────
function buildPrediction(history) {
  if (!history || history.length === 0) return null;
  const current = history[0];
  const currentNum = parseInt(current.gameNum.replace("#", ""));
  const nextGameNum = "#" + (currentNum + 1);

  const ensemble = algoEnsemble(history);
  const predict = ensemble ? ensemble.predict : getType(current.score) === "Tài" ? "Xỉu" : "Tài";
  const confidence = ensemble ? ensemble.confidence : 55;

  const dice = randomDiceForType(predict);
  const diceSum = dice.reduce((a, b) => a + b, 0);

  return {
    phienHienTai: {
      gameNum: current.gameNum,
      ketQua: getType(current.score),
      xucXac: current.facesList,
      tong: current.score,
      timeMilli: current.timeMilli,
    },
    duDoan: {
      phienDuDoan: nextGameNum,
      ketQua: predict,
      vi: dice,
      tongDuDoan: diceSum,
      doTinCay: confidence + "%",
      thuatToan: ensemble ? ensemble.method : "Theo Cầu",
    },
    id: "@sewdangcap",
  };
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// GET /
app.get("/", (req, res) => {
  res.json({
    status: "online",
    author: "@sewdangcap",
    endpoints: ["/sicbosun", "/history", "/algorithms"],
  });
});

// GET /sicbosun - dự đoán chính
app.get("/sicbosun", async (req, res) => {
  try {
    const history = await fetchData();
    const prediction = buildPrediction(history);
    if (!prediction) return res.status(500).json({ error: "Không có dữ liệu" });
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /history - lịch sử 20 phiên gần nhất
app.get("/history", async (req, res) => {
  try {
    const history = await fetchData();
    const size = parseInt(req.query.size) || 20;
    const list = history.slice(0, size).map((r) => ({
      gameNum: r.gameNum,
      ketQua: getType(r.score),
      xucXac: r.facesList,
      tong: r.score,
      timeMilli: r.timeMilli,
    }));
    res.json({
      total: list.length,
      data: list,
      id: "@sewdangcap",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /algorithms - xem kết quả từng thuật toán
app.get("/algorithms", async (req, res) => {
  try {
    const history = await fetchData();
    const results = {
      streak: algoStreak(history),
      markov: algoMarkov(history),
      frequency: algoFrequency(history),
      scoreTrend: algoScoreTrend(history),
      fibonacci: algoFibonacci(history),
      alternating: algoAlternating(history),
      ensemble: algoEnsemble(history),
      id: "@sewdangcap",
    };
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🎲 Sicbo Server by @sewdangcap running on port ${PORT}`);
});
