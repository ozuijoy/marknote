/**
 * 開發／測試用的 Neon HTTP 相容端點。
 *
 * Neon 的 serverless driver 在 HTTP 模式下會 POST {query, params}（或批次 {queries:[...]}）
 * 到 fetchEndpoint，並期待回應 {fields, rows, command, rowCount}（批次為 {results:[...]}）。
 * 這個 shim 把同樣的協定轉譯到本地 Docker PostgreSQL，讓測試可以走「與正式環境完全相同」的程式路徑。
 *
 * 環境變數：
 *   SHIM_PORT     預設 5599
 *   SHIM_PG_URL   預設 postgres://marknote:marknote@127.0.0.1:5433/marknote
 */
import http from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.SHIM_PORT || 5599);
const PG_URL = process.env.SHIM_PG_URL || 'postgres://marknote:marknote@127.0.0.1:5433/marknote';

const pool = new pg.Pool({ connectionString: PG_URL, max: 8 });

// 回傳 PG 原始文字格式（Neon 的 Neon-Raw-Text-Output 行為），由 driver 端依 dataTypeID 解析
const rawTypes = { getTypeParser: () => (value) => value };

async function runOne(client, { query, params }) {
  const res = await client.query({ text: query, values: params ?? [], rowMode: 'array', types: rawTypes });
  return {
    fields: (res.fields || []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: res.rows || [],
    command: res.command || null,
    rowCount: res.rowCount ?? (res.rows || []).length,
    rowAsArray: true,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end(JSON.stringify({ message: 'method not allowed' }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'invalid JSON body' }));
    return;
  }

  const isBatch = Array.isArray(payload.queries);
  const statements = isBatch ? payload.queries : [payload];
  const client = await pool.connect();

  try {
    if (isBatch) await client.query('BEGIN');
    const results = [];
    for (const statement of statements) results.push(await runOne(client, statement));
    if (isBatch) await client.query('COMMIT');

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(isBatch ? { results } : results[0]));
  } catch (err) {
    if (isBatch) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    const status = err.code ? 400 : 500;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        message: err.message || String(err),
        code: err.code,
        severity: err.severity,
        detail: err.detail,
        hint: err.hint,
        position: err.position,
        constraint: err.constraint,
        table: err.table,
      }),
    );
  } finally {
    client.release();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-shim] Neon 相容端點：http://127.0.0.1:${PORT}/sql → ${PG_URL.replace(/:[^:@/]+@/, ':****@')}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
