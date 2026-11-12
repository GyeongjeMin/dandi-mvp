import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { openDatabase } from './db/database.js';
import { createApp } from './app.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`[단디] Node.js ${process.versions.node} 은(는) 내장 SQLite 를 지원하지 않아요. 22.13 이상(권장 24 LTS)을 설치해 주세요.`);
  process.exit(1);
}

const db = openDatabase(config.dbFile);
// 가족이 보낸 사진은 데이터베이스 파일 옆 uploads 폴더에 저장 (메모리 DB 면 임시 폴더)
const uploadDir = config.dbFile === ':memory:' ? path.join(os.tmpdir(), 'dandi-uploads') : path.join(path.dirname(config.dbFile), 'uploads');
const app = createApp(db, config.llm, { clientDist: config.clientDist, uploadDir });

app.listen(config.port, () => {
  const mode = config.llm.provider === 'demo' ? '데모 모드 (미리 준비된 응답 · API 키 불필요)' : `AI 모드 (${config.llm.provider} / ${config.llm.model})`;
  console.log(`[단디] 백엔드 실행 중: http://localhost:${config.port}`);
  console.log(`[단디] 대화 모드: ${mode}`);
  console.log(`[단디] 데이터베이스: ${config.dbFile}`);
  if (config.llm.warning) console.warn(`[단디] 주의: ${config.llm.warning}`);
});
