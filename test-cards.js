const db = require('better-sqlite3')('data/cube-stats.db-wal');
const cards = db.prepare('SELECT * FROM cube_cards LIMIT 1').all();
console.log(cards);
