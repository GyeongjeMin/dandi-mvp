// 데이터베이스를 처음 상태로 되돌립니다 (모든 이용자 데이터 삭제 + 시연용 이용자 다시 생성).
// 실행: npm run db:reset  (서버를 끈 상태에서 실행하세요)
import fs from 'node:fs';
import { config } from '../config.js';
import { openDatabase } from './database.js';

if (config.dbFile !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = config.dbFile + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }
}
const db = openDatabase(config.dbFile);
const n = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE kind='demo_persona'`).get() as { n: number }).n;
db.close();
console.log(`[단디] 데이터베이스를 초기화했어요: ${config.dbFile}`);
console.log(`[단디] 시연용 가상 이용자 ${n}명을 만들었어요.`);
