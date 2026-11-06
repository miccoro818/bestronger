// 対戦履歴(battlelog)から負け傾向を分析する純粋関数
// カード名は公式APIが返す英語名
const { WEAK_TEXT, MATCHUPS } = require("./advice");

const WINCONS = [
  ["Golem", "ゴーレム"], ["Lava Hound", "ラヴァハウンド"], ["Electro Giant", "エレクトロジャイアント"],
  ["Giant", "ジャイアント"], ["Royal Giant", "ロイヤルジャイアント"], ["Goblin Giant", "ゴブリンジャイアント"],
  ["Elixir Golem", "エリクサーゴーレム"], ["Mega Knight", "メガナイト"], ["P.E.K.K.A", "P.E.K.K.A"],
  ["X-Bow", "クロスボウ"], ["Mortar", "迫撃砲"], ["Balloon", "エアバルーン"], ["Hog Rider", "ホグライダー"],
  ["Ram Rider", "ラムライダー"], ["Battle Ram", "攻城バーバリアン"], ["Royal Hogs", "ロイヤルホグ"],
  ["Goblin Drill", "ゴブリンドリル"], ["Graveyard", "Graveyard"], ["Miner", "ディガー"],
  ["Goblin Barrel", "ゴブリンバレル"], ["Wall Breakers", "ウォールブレイカー"],
  ["Skeleton Barrel", "スケルトンバルーン"], ["Three Musketeers", "三銃士"], ["Sparky", "スパーキー"]
];

const set = a => new Set(a);
const AIR = set(["Balloon","Lava Hound","Minions","Mega Minion","Baby Dragon","Inferno Dragon","Electro Dragon","Bats","Minion Horde","Flying Machine","Skeleton Dragons","Phoenix","Skeleton Barrel"]);
const BUILDINGS = set(["Cannon","Tesla","Inferno Tower","Bomb Tower","Goblin Cage","Tombstone","Furnace","Goblin Hut","Barbarian Hut","Elixir Collector","X-Bow","Mortar","Goblin Drill"]);
const SWARM = set(["Skeleton Army","Goblin Gang","Minion Horde","Barbarians","Bats","Guards","Skeletons","Goblins","Spear Goblins","Royal Recruits","Wall Breakers"]);
const TANKS = set(["Golem","Giant","Royal Giant","Lava Hound","Electro Giant","Goblin Giant","Mega Knight","P.E.K.K.A","Elixir Golem","Giant Skeleton"]);
const ANTI_AIR = set(["Musketeer","Wizard","Archers","Minions","Baby Dragon","Inferno Tower","Tesla","Executioner","Electro Wizard","Hunter","Firecracker","Mega Minion","Bats","Ice Wizard","Archer Queen","Magic Archer","Dart Goblin","Princess","Spear Goblins","Inferno Dragon","Electro Dragon","Phoenix","Zappies","Flying Machine","Witch","Mother Witch","Minion Horde","Skeleton Dragons","Electro Spirit","Little Prince","Three Musketeers"]);
const ANTI_TANK = set(["Inferno Tower","Inferno Dragon","Mini P.E.K.K.A","P.E.K.K.A","Hunter","Prince","Lumberjack","Elite Barbarians","Mighty Miner","Barbarians","Skeleton Army","Cannon","Tesla","Goblin Cage","Tombstone","Electro Spirit"]);
const ANTI_SWARM = set(["Arrows","Zap","The Log","Barbarian Barrel","Giant Snowball","Fireball","Poison","Tornado","Wizard","Executioner","Valkyrie","Baby Dragon","Bowler","Bomber","Firecracker","Bomb Tower","Electro Dragon","Dark Prince","Mega Knight","Ice Wizard","Skeleton Dragons"]);

const pick = (cards, s) => cards.filter(c => s.has(c.name));
const count = (cards, s) => pick(cards, s).length;

function archetype(cards) {
  const names = new Set(cards.map(c => c.name));
  for (const [en, ja] of WINCONS) if (names.has(en)) return { key: en, label: `${ja}デッキ` };
  return { key: "other", label: "その他のデッキ" };
}

function weakness(id, evidence, opts = {}) {
  const t = WEAK_TEXT[id];
  const steps = [...t.steps, ...(opts.extraSteps || [])];
  return { id, area: t.area, title: t.title, evidence, why: t.why, steps, practice: t.practice,
    cards: opts.cards || null, cardsLabel: opts.cardsLabel || null, query: t.query };
}

function analyze(battles) {
  // 1v1の対戦だけを使う
  const games = battles
    .filter(b => b.team?.length === 1 && b.opponent?.length === 1 && b.type !== "boatBattle")
    .map(b => {
      const me = b.team[0], op = b.opponent[0];
      return {
        time: b.battleTime, mode: b.gameMode?.name || b.type,
        myCards: me.cards || [], opCards: op.cards || [],
        myCrowns: me.crowns ?? 0, opCrowns: op.crowns ?? 0,
        leak: typeof me.elixirLeaked === "number" ? me.elixirLeaked : null
      };
    })
    .filter(g => g.myCrowns !== g.opCrowns); // 引き分けは除外

  const isLoss = g => g.myCrowns < g.opCrowns;
  const wins = games.filter(g => !isLoss(g));
  const losses = games.filter(isLoss);

  // 1. どのデッキに負けているか
  const byArch = {};
  for (const g of games) {
    const a = archetype(g.opCards);
    const r = byArch[a.key] ||= { label: a.label, wins: 0, losses: 0, lastLossDeck: null };
    if (!isLoss(g)) r.wins++;
    else { r.losses++; if (!r.lastLossDeck) r.lastLossDeck = g.opCards; }
  }
  const archetypes = Object.entries(byArch)
    .map(([key, r]) => ({ key, ...r, games: r.wins + r.losses }))
    .sort((a, b) => b.losses - a.losses || a.wins - b.wins);

  // 自分のメインデッキ(最も多く使われた8枚)
  const deckCount = {};
  for (const g of games) {
    const k = g.myCards.map(c => c.name).sort().join("|");
    (deckCount[k] ||= { n: 0, cards: g.myCards }).n++;
  }
  const mainDeck = Object.values(deckCount).sort((a, b) => b.n - a.n)[0]?.cards || [];

  // 2. 苦手な守り・攻め(推測)
  const weaknesses = [];
  const rate = pred => {
    const hit = games.filter(pred);
    const l = hit.filter(isLoss).length;
    return { n: hit.length, losses: l, wins: hit.length - l };
  };
  const bad = r => r.n >= 3 && r.losses / r.n >= 0.6;

  const air = rate(g => count(g.opCards, AIR) >= 2);
  const aa = pick(mainDeck, ANTI_AIR);
  if (bad(air)) weaknesses.push(weakness("air",
    `空中ユニットが2枚以上のデッキに ${air.wins}勝${air.losses}敗。よく使うデッキで空中を攻撃できるユニットは${aa.length}枚。`,
    { cards: aa, cardsLabel: "あなたのデッキの対空役",
      extraSteps: aa.length <= 2 ? ["【デッキ改善】対空役が2枚以下だと、1枚が手札にないだけで受けが崩れます。単体に強い対空(マスケット銃士など)と、範囲で落とせる対空(ベビードラゴンなど)を1枚ずつ持つ構成が目安です。"] : [] }));

  const tank = rate(g => count(g.opCards, TANKS) >= 1);
  const at = pick(mainDeck, ANTI_TANK);
  if (bad(tank)) weaknesses.push(weakness("tank",
    `タンク(重いユニット)入りのデッキに ${tank.wins}勝${tank.losses}敗。よく使うデッキでタンクを止める役は${at.length}枚。`,
    { cards: at, cardsLabel: "あなたのデッキのタンク処理役",
      extraSteps: at.length <= 1 ? ["【デッキ改善】タンク処理役が1枚以下です。インフェルノタワーやミニP.E.K.K.Aのような高火力の受けか、引きつけ用の建物を1枚入れると安定します。"] : [] }));

  const swarm = rate(g => count(g.opCards, SWARM) >= 2);
  const as = pick(mainDeck, ANTI_SWARM);
  if (bad(swarm) && as.length <= 2) weaknesses.push(weakness("swarm",
    `群れユニットが多いデッキに ${swarm.wins}勝${swarm.losses}敗。よく使うデッキの範囲攻撃カードは${as.length}枚。`,
    { cards: as, cardsLabel: "あなたのデッキの範囲攻撃" }));

  const bld = games.filter(g => count(g.opCards, BUILDINGS) >= 1);
  const bldLoss = bld.filter(isLoss);
  const bldCrowns = bldLoss.length ? bldLoss.reduce((s, g) => s + g.myCrowns, 0) / bldLoss.length : 1;
  if (bld.length >= 3 && bldLoss.length / bld.length >= 0.6 && bldCrowns < 0.5) weaknesses.push(weakness("building",
    `建物入りのデッキに ${bld.length - bldLoss.length}勝${bldLoss.length}敗。負けた試合の平均獲得クラウンは${bldCrowns.toFixed(1)}。`));

  const lossCrowns = losses.length ? losses.reduce((s, g) => s + g.myCrowns, 0) / losses.length : 1;
  if (losses.length >= 3 && lossCrowns < 0.4) weaknesses.push(weakness("nocrown",
    `負けた${losses.length}試合の平均獲得クラウンは${lossCrowns.toFixed(1)}。`));

  const three = losses.filter(g => g.opCrowns === 3).length;
  if (losses.length >= 3 && three / losses.length >= 0.4) weaknesses.push(weakness("collapse",
    `負けた${losses.length}試合のうち${three}試合(${Math.round(three / losses.length * 100)}%)が3クラウン負け。`));

  const lw = wins.filter(g => g.leak !== null), ll = losses.filter(g => g.leak !== null);
  if (lw.length && ll.length >= 3) {
    const avg = a => a.reduce((s, g) => s + g.leak, 0) / a.length;
    const lossLeak = avg(ll), winLeak = avg(lw);
    if (lossLeak >= 2 && lossLeak > winLeak * 1.3) weaknesses.push(weakness("leak",
      `負け試合の平均漏れエリクサー${lossLeak.toFixed(1)}(勝ち試合は${winLeak.toFixed(1)})。`));
  }

  // 3. 負けている型ごとの攻略
  const matchups = archetypes
    .filter(a => a.losses > 0 && a.key !== "other" && a.losses >= a.wins)
    .slice(0, 3)
    .map(a => ({ label: a.label, wins: a.wins, losses: a.losses, ...(MATCHUPS[a.key] || MATCHUPS._default) }));

  // 4. 動画検索リンク
  const videos = [
    ...archetypes.filter(a => a.losses > 0 && a.key !== "other").slice(0, 3)
      .map(a => ({ label: `${a.label}の対策`, query: `クラロワ ${a.label.replace("デッキ", "")} 対策 立ち回り` })),
    ...weaknesses.map(w => ({ label: w.title, query: w.query }))
  ];

  return { total: games.length, wins: wins.length, losses: losses.length,
    archetypes, mainDeck, weaknesses, matchups, videos };
}

module.exports = { analyze, archetype };
