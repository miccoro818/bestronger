// 対戦履歴(battlelog)から負け傾向を分析する純粋関数
// カード名は公式APIが返す英語名

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

const count = (cards, s) => cards.filter(c => s.has(c.name)).length;

function archetype(cards) {
  const names = new Set(cards.map(c => c.name));
  for (const [en, ja] of WINCONS) if (names.has(en)) return { key: en, label: `${ja}デッキ` };
  return { key: "other", label: "その他のデッキ" };
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

  const wins = games.filter(g => g.myCrowns > g.opCrowns);
  const losses = games.filter(g => g.myCrowns < g.opCrowns);

  // 1. どのデッキに負けているか
  const byArch = {};
  for (const g of games) {
    const a = archetype(g.opCards);
    const r = byArch[a.key] ||= { label: a.label, wins: 0, losses: 0, lastLossDeck: null };
    if (g.myCrowns > g.opCrowns) r.wins++;
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
  const rate = (arr, pred) => {
    const hit = arr.filter(pred);
    const l = hit.filter(g => g.myCrowns < g.opCrowns).length;
    return { n: hit.length, losses: l, wins: hit.length - l };
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const air = rate(games, g => count(g.opCards, AIR) >= 2);
  const myAA = count(mainDeck, ANTI_AIR);
  if (air.n >= 3 && air.losses / air.n >= 0.6) weaknesses.push({
    area: "守り", title: "空中ユニットの受け",
    evidence: `空中ユニットが2枚以上のデッキに ${air.wins}勝${air.losses}敗。メインデッキの対空ユニットは${myAA}枚。`,
    advice: myAA <= 2
      ? ["対空ユニットを1枚増やすことを検討する(マスケット銃士やベビードラゴンなど)", "空中ユニットには対空カードを温存し、地上の受けに使い切らない"]
      : ["対空カードは足りているので、出すタイミングを見直す。タワーと一緒に撃てる位置で受ける", "対空カードをスペルでまとめて消されていないか確認する"],
    query: "クラロワ 空中デッキ 対策 立ち回り"
  });

  const tank = rate(games, g => count(g.opCards, TANKS) >= 1);
  const myAT = count(mainDeck, ANTI_TANK);
  if (tank.n >= 3 && tank.losses / tank.n >= 0.6) weaknesses.push({
    area: "守り", title: "重いユニット(タンク)の受け",
    evidence: `タンク入りデッキに ${tank.wins}勝${tank.losses}敗。メインデッキのタンク処理役は${myAT}枚。`,
    advice: myAT <= 1
      ? ["インフェルノタワーやミニP.E.K.K.Aのような高火力の受けを入れる", "タンクの後ろの援護ユニットから先に処理する"]
      : ["タンク処理役を本体に当てる前に、援護ユニットに使っていないか見直す", "相手が後ろにタンクを置いたら逆サイドを攻めて、受けのエリクサーを削らせる"],
    query: "クラロワ ビートダウン 対策 受け方"
  });

  const swarm = rate(games, g => count(g.opCards, SWARM) >= 2);
  const myAS = count(mainDeck, ANTI_SWARM);
  if (swarm.n >= 3 && swarm.losses / swarm.n >= 0.6 && myAS <= 2) weaknesses.push({
    area: "攻め", title: "群れユニットへの対処",
    evidence: `群れユニットが多いデッキに ${swarm.wins}勝${swarm.losses}敗。メインデッキの範囲攻撃カードは${myAS}枚。`,
    advice: ["範囲攻撃のスペルか、範囲攻撃ユニットを1枚追加する", "攻める前に相手が群れカードを使ったかを確認してから仕掛ける"],
    query: "クラロワ 小物 処理 立ち回り"
  });

  const bld = games.filter(g => count(g.opCards, BUILDINGS) >= 1);
  const bldLoss = bld.filter(g => g.myCrowns < g.opCrowns);
  const bldCrowns = bldLoss.length ? bldLoss.reduce((s, g) => s + g.myCrowns, 0) / bldLoss.length : 1;
  if (bld.length >= 3 && bldLoss.length / bld.length >= 0.6 && bldCrowns < 0.5) weaknesses.push({
    area: "攻め", title: "建物で攻めを止められている",
    evidence: `建物入りデッキに ${bld.length - bldLoss.length}勝${bldLoss.length}敗。負けた試合の平均獲得クラウンは${bldCrowns.toFixed(1)}。`,
    advice: ["建物が出たらスペルで建物ごとタワーを削る、攻めを逆サイドに散らすなど、同じ攻めを繰り返さない", "相手の建物カードが手札に戻るまでの間(4枚回す間)に攻める"],
    query: "クラロワ 建物 対策 攻め方"
  });

  const lossCrowns = losses.length ? losses.reduce((s, g) => s + g.myCrowns, 0) / losses.length : 1;
  if (losses.length >= 3 && lossCrowns < 0.4) weaknesses.push({
    area: "攻め", title: "負け試合でタワーを取れていない",
    evidence: `負けた${losses.length}試合の平均獲得クラウンは${lossCrowns.toFixed(1)}。`,
    advice: ["攻めが単体で終わっていないか確認する。守りで残ったユニットに合わせて攻める(カウンター)", "ダブルエリクサー前に1回、確実にタワーを狙う攻めを決めておく"],
    query: "クラロワ 攻め方 コツ カウンター"
  });

  const three = losses.filter(g => g.opCrowns === 3).length;
  if (losses.length >= 3 && three / losses.length >= 0.4) weaknesses.push({
    area: "守り", title: "崩れると一気に3クラウン負け",
    evidence: `負けた${losses.length}試合のうち${three}試合(${pct(three, losses.length)}%)が3クラウン負け。`,
    advice: ["タワーを1本落とされたら、無理に攻めずキングタワー前で守りを固める", "負けている展開ほどエリクサーを貯めてから受ける"],
    query: "クラロワ 守り方 コツ 初心者"
  });

  const lw = wins.filter(g => g.leak !== null), ll = losses.filter(g => g.leak !== null);
  if (lw.length && ll.length >= 3) {
    const avg = a => a.reduce((s, g) => s + g.leak, 0) / a.length;
    const lossLeak = avg(ll), winLeak = avg(lw);
    if (lossLeak >= 2 && lossLeak > winLeak * 1.3) weaknesses.push({
      area: "エリクサー管理", title: "負け試合でエリクサーがあふれている",
      evidence: `負け試合の平均漏れエリクサー${lossLeak.toFixed(1)}(勝ち試合は${winLeak.toFixed(1)})。`,
      advice: ["エリクサーが10になる前に、キングタワーの後ろでユニットを出して攻めの準備をする", "相手の動きを待ちすぎない。安いカードで先に動く"],
      query: "クラロワ エリクサー管理 コツ"
    });
  }

  // 4. 動画検索リンク(負けている型ごと)
  const topLoss = archetypes.filter(a => a.losses > 0 && a.key !== "other").slice(0, 3);
  const videos = [
    ...topLoss.map(a => ({ label: `${a.label}の対策`, query: `クラロワ ${a.label.replace("デッキ", "")} 対策` })),
    ...weaknesses.map(w => ({ label: w.title, query: w.query }))
  ];

  return {
    total: games.length, wins: wins.length, losses: losses.length,
    archetypes, mainDeck, weaknesses, videos
  };
}

module.exports = { analyze, archetype };
