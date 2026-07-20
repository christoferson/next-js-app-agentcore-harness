// Defensive-parsing smoke test (SPEC §10 acceptance): feed synthetic malformed
// events/payloads through the pure parsers and stream adapters; assert no throw
// and graceful fallback. Run: npx tsx scripts/parser-smoke.ts
import {
  parseHarnessSummaries,
  parseHarnessDetails,
  parseEvents,
  parseNamespaces,
  parseMemoryRecords,
  parseSessions,
  memoryIdFromArn,
  isPlainNamespace,
} from '../lib/agentcore/parsers';
import { adaptInvokeStream } from '../lib/agentcore/invoke';
import { adaptCommandStream } from '../lib/agentcore/command';

let failures = 0;
function ok(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

async function main() {
  console.log('parseHarnessSummaries:');
  ok('null input → []', parseHarnessSummaries(null).length === 0);
  ok('garbage → []', parseHarnessSummaries({ harnesses: 'nope' }).length === 0);
  ok(
    'skips entries without arn',
    parseHarnessSummaries({ harnesses: [{}, { arn: 'a', harnessName: 'X' }] }).length === 1
  );

  console.log('memoryIdFromArn:');
  ok(
    'extracts id after memory/',
    memoryIdFromArn('arn:aws:...:memory/mem-123/extra') === 'mem-123'
  );
  ok('undefined → null', memoryIdFromArn(undefined) === null);

  console.log('parseHarnessDetails:');
  const d1 = parseHarnessDetails({
    harness: {
      arn: 'arn:x',
      harnessName: 'H',
      memory: { agentCoreMemoryConfiguration: { arn: 'arn:...:memory/m-1' } },
      systemPrompt: [{ text: 'a' }, { notText: 1 }, { text: 'b' }],
      model: { bedrockModelConfig: { modelId: 'mid', temperature: 0.2 } },
    },
  });
  ok('agentCore memory id parsed', d1.memoryId === 'm-1');
  ok('memoryShape agentCore', d1.memoryShape === 'agentCore');
  ok('system prompt joined, bad block skipped', d1.systemPrompt === 'a\nb');
  ok('model defaults read', d1.model.modelId === 'mid' && d1.model.temperature === 0.2);
  const d2 = parseHarnessDetails({
    harness: { memory: { managedMemoryConfiguration: { arn: 'arn:...:memory/legacy-9' } } },
  });
  ok('legacy managed memory id parsed', d2.memoryId === 'legacy-9' && d2.memoryShape === 'managed');
  ok('no harness key → safe defaults', parseHarnessDetails({}).memoryId === null);

  console.log('parseEvents (double-encoded conversational):');
  const envelope = JSON.stringify({
    message: {
      role: 'assistant',
      content: [{ text: 'hello' }, { toolUse: { name: 'search' } }],
      metadata: { usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 } },
    },
    message_id: 'msg-1',
  });
  const ev = parseEvents({
    events: [
      { eventId: 'e1', payload: [{ conversational: { role: 'ASSISTANT', content: { text: envelope } } }] },
      { eventId: 'e2', payload: [{ conversational: { role: 'user', content: { text: 'raw not json {' } } }] },
      { eventId: 'e3', payload: [{ blob: { any: 1 } }] },
      { eventId: 'e4', payload: 'garbage' },
      'totally invalid',
    ],
  });
  ok('decoded text + tool marker', ev.events[0].text === 'hello\n[tool_use: search]');
  ok('usage decoded', ev.events[0].usage?.totalTokens === 12);
  ok('messageId decoded', ev.events[0].messageId === 'msg-1');
  ok('undecodable falls back to raw text', ev.events[1].text === 'raw not json {');
  ok('blob classified', ev.events[2].type === 'blob');
  ok('bad payload → unknown', ev.events[3].type === 'unknown');
  ok('non-record event tolerated', ev.events[4].type === 'unknown');

  console.log('parseNamespaces:');
  const ns = parseNamespaces({
    memory: {
      strategies: [
        { strategyId: 's1', name: 'Sem', configuration: { type: 'SEMANTIC_OVERRIDE', extraction: { customExtractionConfiguration: { semanticExtractionOverride: { namespaces: ['/a/{actorId}'] } } } } },
      ],
    },
  });
  ok('strategy parsed w/ nested namespace', ns.length === 1 && ns[0].namespaces.includes('/a/{actorId}'));
  const nsFallback = parseNamespaces({
    memory: { agentCoreMemoryConfiguration: { retrievalConfig: { '/facts/{actorId}': { strategyId: 'sf' } } } },
  });
  ok('retrievalConfig fallback', nsFallback.length === 1 && nsFallback[0].strategyId === 'sf');
  ok('empty → []', parseNamespaces({}).length === 0);

  console.log('parseMemoryRecords:');
  const rec = parseMemoryRecords({
    memoryRecordSummaries: [
      { memoryRecordId: 'r1', content: { text: 'fact' }, memoryStrategyId: 's1', namespaces: ['/n'], score: 0.87 },
      { badRecord: true },
    ],
  });
  ok('record parsed', rec.records[0].text === 'fact' && rec.records[0].score === 0.87);
  ok('bad record → id empty but no crash', rec.records.length === 2);

  console.log('parseSessions:');
  const s = parseSessions({ sessionSummaries: [{ sessionId: 'sess1', actorId: 'a' }, {}], nextToken: 't' });
  ok('valid session kept, invalid dropped', s.sessions.length === 1 && s.nextToken === 't');

  console.log('isPlainNamespace:');
  ok('rejects unresolved braces', !isPlainNamespace('/a/{actorId}'));
  ok('accepts plain path', isPlainNamespace('/a/default-user'));

  console.log('adaptInvokeStream (malformed events):');
  async function* badStream() {
    yield { contentBlockDelta: { delta: {} } }; // no text
    yield { contentBlockDelta: { delta: { reasoningContent: { text: 'think' } } } }; // reasoning, skip
    yield { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: 't1', name: 'fn' } } } };
    yield { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{"a":1}' } } } };
    yield { contentBlockStop: { contentBlockIndex: 0 } };
    yield { contentBlockDelta: { delta: { text: 'hi' } } };
    yield 'garbage';
    yield { unknownEvent: {} };
    yield { messageStop: {} }; // missing stopReason
    yield { metadata: { usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } } };
  }
  const out: string[] = [];
  for await (const e of adaptInvokeStream(badStream())) out.push(e.type);
  ok('tool-start emitted', out.includes('tool-start'));
  ok('tool-input-delta emitted', out.includes('tool-input-delta'));
  ok('tool-stop emitted', out.includes('tool-stop'));
  ok('text-delta emitted (only real text)', out.filter((t) => t === 'text-delta').length === 1);
  ok('stop emitted w/ missing reason', out.includes('stop'));
  ok('usage emitted', out.includes('usage'));

  console.log('adaptCommandStream (no contentStop → exit -1):');
  async function* cmdStream() {
    yield { chunk: { contentDelta: { stdout: 'line1\n' } } };
    yield { chunk: { contentDelta: { stderr: 'err\n' } } };
    yield 'garbage';
    // no contentStop
  }
  const cout: Array<{ type: string; code?: number }> = [];
  for await (const e of adaptCommandStream(cmdStream(), () => {})) {
    cout.push(e as { type: string; code?: number });
  }
  ok('stdout emitted', cout.some((e) => e.type === 'stdout'));
  ok('stderr emitted', cout.some((e) => e.type === 'stderr'));
  const exit = cout.find((e) => e.type === 'exit-code');
  ok('exit-code -1 on missing contentStop', exit?.code === -1);

  console.log('');
  if (failures === 0) {
    console.log('ALL PASS ✓');
  } else {
    console.error(`${failures} FAILURE(S) ✗`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('THREW (must not happen):', e);
  process.exit(1);
});
