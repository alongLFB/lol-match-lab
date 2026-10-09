const lcu = require('../server/lcu');
const fs = require('fs');
const out = (n, d) => fs.writeFileSync(__dirname + '/sample_' + n + '.json', JSON.stringify(d, null, 1));
const tryGet = async (n, p) => {
  try { const d = await lcu.get(p); out(n, d); console.log('OK ', n, p); return d; }
  catch (e) { console.log('ERR', n, p, e.message.slice(0, 120)); }
};
(async () => {
  console.log(await lcu.connect().then(c => c && { port: c.port, source: c.source, dir: c.installDir }));
  const me = await tryGet('summoner', '/lol-summoner/v1/current-summoner');
  if (!me) return;
  const list = await tryGet('list', `/lol-match-history/v1/products/lol/${me.puuid}/matches?begIndex=0&endIndex=5`);
  console.log('list keys', Object.keys(list), Object.keys(list.games || {}), 'count', list.games?.games?.length);
  const g0 = list.games.games[0];
  console.log('list game keys', Object.keys(g0));
  console.log('participants in list entry', g0.participants.length);
  // find a custom game or multi-participant one
  const gid = g0.gameId;
  const detail = await tryGet('detail', `/lol-match-history/v1/games/${gid}`);
  console.log('detail keys', Object.keys(detail), 'participants', detail.participants?.length);
  await tryGet('timeline', `/lol-match-history/v1/game-timelines/${gid}`);
  await tryGet('ranked', `/lol-ranked/v1/ranked-stats/${me.puuid}`);
  await tryGet('champ', '/lol-game-data/assets/v1/champion-summary.json');
  await tryGet('items', '/lol-game-data/assets/v1/items.json');
  await tryGet('spells', '/lol-game-data/assets/v1/summoner-spells.json');
  await tryGet('perks', '/lol-game-data/assets/v1/perks.json');
  await tryGet('perkstyles', '/lol-game-data/assets/v1/perkstyles.json');
  await tryGet('queues', '/lol-game-queues/v1/queues');
  await tryGet('maps', '/lol-maps/v2/maps');
  await tryGet('sumByPuuid', `/lol-summoner/v2/summoners/puuid/${me.puuid}`);
  await tryGet('eog', '/lol-end-of-game/v1/eog-stats-block');
  await tryGet('mastery', `/lol-collections/v1/inventories/${me.summonerId}/champion-mastery`);
  await tryGet('replay', `/lol-replays/v1/metadata/${gid}`);
  await tryGet('regionlocale', '/riotclient/region-locale');
  await tryGet('gameversion', '/lol-patch/v1/game-version');
})();
