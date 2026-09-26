import { performance } from 'node:perf_hooks';

const origin = new URL(process.argv[2] ?? 'http://localhost:5173');
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) {
  console.error('Este teste de carga é deliberadamente limitado a localhost.');
  process.exit(2);
}

const total = 30;
const concurrency = 5;
const timings = [];
let next = 0;
let failed = 0;

async function worker() {
  while (next < total) {
    next++;
    const started = performance.now();
    try {
      const response = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(5_000) });
      if (response.status !== 200) failed++;
      await response.arrayBuffer();
    } catch { failed++; }
    timings.push(performance.now() - started);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
timings.sort((a, b) => a - b);
const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? 0;
console.log(`Carga local limitada: ${total} leituras, ${concurrency} simultâneas, ${failed} falhas, p95 ${Math.round(p95)} ms.`);
if (failed) process.exitCode = 1;
