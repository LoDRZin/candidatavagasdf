import { expect, test } from 'vitest';
import { readSse } from '../../shared/sse';

test('leitor SSE preserva UTF-8 e eventos divididos entre chunks', async () => {
  const bytes = new TextEncoder().encode('event: delta\r\ndata: {"text":"Olá"}\r\n\r\nevent: done\ndata: {}\n\n');
  const chunks = [bytes.slice(0, 27), bytes.slice(27, 33), bytes.slice(33, 46), bytes.slice(46)];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  });
  const events = [];
  for await (const event of readSse(stream)) events.push(event);
  expect(events).toEqual([{ event: 'delta', data: '{"text":"Olá"}' }, { event: 'done', data: '{}' }]);
});

test('leitor SSE cancela o upstream quando o consumo é interrompido', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: primeiro\n\n')); },
    cancel() { cancelled = true; },
  });
  for await (const event of readSse(stream)) { expect(event.data).toBe('primeiro'); break; }
  expect(cancelled).toBe(true);
});
