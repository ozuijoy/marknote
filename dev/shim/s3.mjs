/**
 * 測試用的極簡 S3 相容伺服器（只支援 MarkNote 會用到的操作）。
 *
 * 目的：讓整合測試走真實的 AWS SDK 簽章／HTTP 路徑，而不需要外網或 Docker。
 * 不驗證簽章，資料存在記憶體中，重啟即清空。
 *
 * 支援：CreateBucket、HeadBucket、PutBucketCors、PutObject、HeadObject、GetObject（含 Range）、
 *       DeleteObject、DeleteObjects（POST ?delete）、ListObjectsV2。
 */
import http from 'node:http';

const PORT = Number(process.env.S3_PORT || 5600);

/** @type {Map<string, Map<string, {body: Buffer, contentType: string}>>} */
const buckets = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

function send(res, status, body = '', headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,HEAD,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Range',
    ...headers,
  });
  res.end(body);
}

function s3Error(res, status, code, message) {
  send(
    res,
    status,
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${xmlEscape(message)}</Message></Error>`,
    { 'Content-Type': 'application/xml' },
  );
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const bucket = parts[0];
  const key = parts.slice(1).join('/');

  if (req.method === 'OPTIONS') return send(res, 204);

  if (url.pathname === '/health') return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' });

  try {
    if (!bucket) return s3Error(res, 400, 'InvalidRequest', 'bucket required');

    // 建立 bucket / CORS / 列出 bucket
    if (!key) {
      if (req.method === 'PUT' && !url.searchParams.has('cors')) {
        buckets.set(bucket, buckets.get(bucket) || new Map());
        return send(res, 200);
      }
      if (req.method === 'PUT' && url.searchParams.has('cors')) {
        if (!buckets.has(bucket)) return s3Error(res, 404, 'NoSuchBucket', bucket);
        await readBody(req);
        return send(res, 200);
      }
      if (req.method === 'HEAD') {
        return buckets.has(bucket) ? send(res, 200) : s3Error(res, 404, 'NoSuchBucket', bucket);
      }
      if (req.method === 'GET') {
        if (!buckets.has(bucket)) return s3Error(res, 404, 'NoSuchBucket', bucket);
        const prefix = url.searchParams.get('prefix') || '';
        const items = [...buckets.get(bucket).entries()].filter(([k]) => k.startsWith(prefix));
        const contents = items
          .map(
            ([k, o]) =>
              `<Contents><Key>${xmlEscape(k)}</Key><Size>${o.body.length}</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>&quot;${o.body.length}&quot;</ETag></Contents>`,
          )
          .join('');
        return send(
          res,
          200,
          `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${xmlEscape(bucket)}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${items.length}</KeyCount><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
          { 'Content-Type': 'application/xml' },
        );
      }
      if (req.method === 'POST' && url.searchParams.has('delete')) {
        if (!buckets.has(bucket)) return s3Error(res, 404, 'NoSuchBucket', bucket);
        const xml = (await readBody(req)).toString('utf8');
        const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) => m[1]);
        const deleted = [];
        for (const k of keys) {
          if (buckets.get(bucket).delete(k)) deleted.push(k);
        }
        const body = `<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${deleted
          .map((k) => `<Deleted><Key>${xmlEscape(k)}</Key></Deleted>`)
          .join('')}</DeleteResult>`;
        return send(res, 200, body, { 'Content-Type': 'application/xml' });
      }
      return s3Error(res, 405, 'MethodNotAllowed', req.method);
    }

    const store = buckets.get(bucket);
    if (!store) return s3Error(res, 404, 'NoSuchBucket', bucket);

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const contentType = req.headers['content-type'] || 'application/octet-stream';
      store.set(key, { body, contentType });
      return send(res, 200, '', { ETag: `"${body.length}"`, 'Content-Length': '0' });
    }

    if (req.method === 'HEAD' || req.method === 'GET') {
      const object = store.get(key);
      if (!object) return s3Error(res, 404, 'NoSuchKey', key);

      if (req.method === 'HEAD') {
        return send(res, 200, '', {
          'Content-Type': object.contentType,
          'Content-Length': String(object.body.length),
          'Accept-Ranges': 'bytes',
          ETag: `"${object.body.length}"`,
        });
      }

      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if (m) {
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Number(m[2]) : object.body.length - 1;
          const slice = object.body.subarray(start, end + 1);
          return send(res, 206, slice, {
            'Content-Type': object.contentType,
            'Content-Range': `bytes ${start}-${end}/${object.body.length}`,
            'Content-Length': String(slice.length),
            'Accept-Ranges': 'bytes',
          });
        }
      }

      return send(res, 200, object.body, {
        'Content-Type': object.contentType,
        'Content-Length': String(object.body.length),
        'Accept-Ranges': 'bytes',
        ETag: `"${object.body.length}"`,
      });
    }

    if (req.method === 'DELETE') {
      store.delete(key);
      return send(res, 204);
    }

    return s3Error(res, 405, 'MethodNotAllowed', req.method);
  } catch (err) {
    console.error('[s3-shim]', err);
    return s3Error(res, 500, 'InternalError', err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[s3-shim] listening on http://127.0.0.1:${PORT}`);
});