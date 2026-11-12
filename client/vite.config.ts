import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 개발 중에는 /api 요청을 백엔드(4000번 포트)로 넘겨 줍니다. API 키는 백엔드에만 있습니다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
