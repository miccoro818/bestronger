// APIキーなしで画面を確認するためのデモ用対戦履歴(架空データ)
const c = n => ({ name: n });
const MY = ["Hog Rider","Musketeer","Valkyrie","Cannon","Fireball","The Log","Ice Spirit","Skeletons"].map(c);
const DECKS = {
  lava: ["Lava Hound","Balloon","Minions","Mega Minion","Tombstone","Arrows","Fireball","Skeleton Dragons"],
  golem: ["Golem","Night Witch","Baby Dragon","Lumberjack","Tornado","Lightning","Barbarian Barrel","Mega Minion"],
  hog: ["Hog Rider","Musketeer","Ice Golem","Cannon","Fireball","The Log","Ice Spirit","Skeletons"],
  xbow: ["X-Bow","Tesla","Archers","Knight","Fireball","The Log","Skeletons","Ice Spirit"],
  bait: ["Goblin Barrel","Princess","Goblin Gang","Inferno Tower","Rocket","The Log","Knight","Spear Goblins"]
};
// [相手, 自分のクラウン, 相手のクラウン, 漏れエリクサー]
const ROWS = [
  ["lava",0,2,3.1],["lava",0,3,4.2],["lava",1,2,2.5],["lava",1,0,0.4],
  ["golem",0,3,3.8],["golem",1,0,0.9],["golem",1,2,2.7],
  ["hog",1,0,0.3],["hog",2,1,0.6],["hog",0,1,1.2],
  ["xbow",0,1,2.9],["xbow",0,2,3.3],["xbow",1,0,0.5],
  ["bait",2,0,0.2],["bait",1,0,0.8],["bait",0,1,1.9],
  ["lava",0,1,2.4],["golem",2,1,0.7],["hog",1,0,0.2],["xbow",0,1,3.0]
];
module.exports = () => ROWS.map(([k, mc, oc, leak], i) => ({
  type: "PvP", battleTime: `20261106T0${String(i % 10)}0000.000Z`, gameMode: { name: "Ladder" },
  team: [{ crowns: mc, cards: MY, elixirLeaked: leak }],
  opponent: [{ crowns: oc, cards: DECKS[k].map(c) }]
}));
