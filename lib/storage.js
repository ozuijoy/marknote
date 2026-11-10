import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  CreateBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorageConfig } from './config';

/**
 * Neon Object Storage 存取層（S3 相容協定）。
 *
 * 瀏覽器不直接拿到憑證：
 *   1. 後端用 presigned PUT 讓瀏覽器把檔案直接送上 bucket（不受 Netlify 請求大小限制）
 *   2. 讀取時由 /api/files/[id]/raw 驗證 session 後 302 到短效 presigned GET
 *
 * 物件 key 一律由伺服器產生（files/<uuid>），不使用使用者提供的檔名，避免路徑穿越。
 */

const UPLOAD_URL_TTL = 15 * 60; // 15 分鐘
const DOWNLOAD_URL_TTL = 5 * 60; // 5 分鐘

let client = null;
let clientSignature = '';

function getClient() {
  const cfg = getStorageConfig();
  if (!cfg.configured) {
    throw new Error('尚未設定物件儲存（AWS_ENDPOINT_URL_S3／AWS_ACCESS_KEY_ID／AWS_SECRET_ACCESS_KEY／STORAGE_BUCKET）');
  }
  const signature = `${cfg.endpoint}|${cfg.region}|${cfg.accessKeyId}|${cfg.bucket}`;
  if (client && clientSignature === signature) return client;
  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: true, // Neon Object Storage 只支援 path-style
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // 預設會插入 CRC32 檢查碼，部分 S3 相容服務不支援；關閉可提高相容性
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  clientSignature = signature;
  return client;
}

export function storageBucket() {
  return getStorageConfig().bucket;
}

/** 產生新的物件 key（伺服器端唯一決定） */
export function newObjectKey() {
  return `files/${crypto.randomUUID()}`;
}

/** 驗證 key 是否為本系統產生的格式 */
export function isObjectKey(value) {
  return typeof value === 'string' && /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** 上傳用 presigned URL（瀏覽器 PUT） */
export async function presignUpload({ key, contentType, size }) {
  const cfg = getStorageConfig();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
    ...(Number.isFinite(size) && size > 0 ? { ContentLength: size } : {}),
  });
  const url = await getSignedUrl(getClient(), command, { expiresIn: UPLOAD_URL_TTL });
  return { url, headers: { 'Content-Type': contentType }, expiresIn: UPLOAD_URL_TTL };
}

/**
 * 讀取用 presigned URL。
 * @param {{key: string, filename?: string, download?: boolean}} opts
 */
export async function presignDownload({ key, filename = '', download = false }) {
  const cfg = getStorageConfig();
  const safeName = String(filename).replace(/[\r\n"\\]/g, '_').slice(0, 180);
  const disposition = download
    ? `attachment; filename="${encodeURIComponent(safeName) || 'download'}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
    : `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`;
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ResponseContentDisposition: disposition,
  });
  return getSignedUrl(getClient(), command, { expiresIn: DOWNLOAD_URL_TTL });
}

/** 取得物件中介資料；不存在時回 null */
export async function headObject(key) {
  const cfg = getStorageConfig();
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return {
      size: Number(res.ContentLength || 0),
      contentType: res.ContentType || '',
      etag: res.ETag || '',
    };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') return null;
    throw err;
  }
}

/** 刪除單一物件（不存在視為成功） */
export async function deleteObject(key) {
  const cfg = getStorageConfig();
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404) return;
    throw err;
  }
}

/** 批次刪除（S3 上限 1000 筆／次） */
export async function deleteObjects(keys) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return;
  const cfg = getStorageConfig();
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: cfg.bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** 列出某前綴下的所有 key（僅供維護／對帳使用） */
export async function listKeys(prefix = 'files/') {
  const cfg = getStorageConfig();
  const keys = [];
  let token;
  do {
    const res = await getClient().send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of res.Contents || []) keys.push(item.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/** 建立 bucket（若不存在）並設定 CORS，供 `npm run storage:init` 使用 */
export async function ensureBucket({ corsOrigins = [] } = {}) {
  const cfg = getStorageConfig();
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === 'NotFound') {
      await s3.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    } else {
      throw err;
    }
  }
  if (corsOrigins.length) {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: cfg.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: corsOrigins,
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  }
  return cfg.bucket;
}