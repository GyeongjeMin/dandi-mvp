// 백엔드(4000)와 프론트엔드(5173)를 한 번에 실행합니다. 추가 패키지 없이 Windows/macOS/Linux에서 동작합니다.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n[단디] Node.js ${process.versions.node} 은(는) 지원하지 않아요. Node.js 22.13 이상(권장: 24 LTS)을 설치해 주세요.\n`);
  process.exit(1);
}
for (const dir of ['server', 'client']) {
  if (!existsSync(path.join(root, dir, 'node_modules'))) {
    console.error(`\n[단디] ${dir} 폴더에 패키지가 설치되지 않았어요. 먼저 "npm run setup" 을 실행해 주세요.\n`);
    process.exit(1);
  }
}

const procs = [
  { name: 'server', color: '\x1b[32m' },
  { name: 'client', color: '\x1b[33m' },
].map(({ name, color }) => {
  const child = spawn('npm', ['run', 'dev'], { cwd: path.join(root, name), shell: true });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) => buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => out.write(tag + l + '\n')));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${tag}종료됨 (code ${code})`);
    shutdown();
  });
  return child;
});

console.log('\n[단디] 잠시 후 브라우저에서 http://localhost:5173 을 열어 주세요. 종료는 Ctrl + C\n');

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const p of procs) {
    if (p.exitCode === null) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/f', '/t']);
      else p.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
