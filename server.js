// 外部ライブラリなし(Node 18以上)で動くサーバー
const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyze } = require("./analyze");
const demo = require("./demo");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.CR_API_KEY;
const API_BASE = process.env.CR_API_BASE || "https://proxy.royaleapi.dev/v1";
const cache = new Map(); // tag -> {at, data}
const CACHE_MS = 2 * 60 * 1000;

function normalizeTag(raw) {
  return String(raw || "").toUpperCase().replace(/[#\s]/g, "").replace(/O/g, "0");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function fetchCR(p) {
  const r = await fetch(API_BASE + p, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) { const e = new Error("api"); e.status = r.status; throw e; }
  return r.json();
}

async function handleAnalyze(res, tagRaw) {
  if (String(tagRaw || "").trim().toUpperCase() === "DEMO") return send(res, 200, { player: { name: "デモプレイヤー", tag: "#DEMO", trophies: 7200 }, ...analyze(demo()) });
  const tag = normalizeTag(tagRaw);
  if (!/^[0289PYLQGRJCUV]{3,12}$/.test(tag)) return send(res, 400, { error: "プレイヤータグの形式が正しくありません。ゲーム内のプロフィールにある#から始まる英数字を入れてください。" });
  if (!API_KEY) return send(res, 500, { error: "サーバーにAPIキーが設定されていません。" });

  const hit = cache.get(tag);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.data);

  try {
    const enc = encodeURIComponent("#" + tag);
    const [player, battles] = await Promise.all([fetchCR(`/players/${enc}`), fetchCR(`/players/${enc}/battlelog`)]);
    const data = { player: { name: player.name, tag: player.tag, trophies: player.trophies }, ...analyze(battles) };
    cache.set(tag, { at: Date.now(), data });
    send(res, 200, data);
  } catch (e) {
    const msg = e.status === 404 ? "そのタグのプレイヤーが見つかりませんでした。"
      : e.status === 403 ? "APIキーが使えませんでした。キーのIP設定を確認してください。"
      : e.status === 429 ? "アクセスが集中しています。少し待ってからもう一度試してください。"
      : "データの取得に失敗しました。少し待ってからもう一度試してください。";
    send(res, e.status === 404 ? 404 : 502, { error: msg });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/analyze") return handleAnalyze(res, url.searchParams.get("tag"));
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return send(res, 200, fs.readFileSync(path.join(__dirname, "index.html"), "utf8"), "text/html; charset=utf-8");
  }
  send(res, 404, "Not found", "text/plain");
}).listen(PORT, () => console.log(`listening on ${PORT}`));
