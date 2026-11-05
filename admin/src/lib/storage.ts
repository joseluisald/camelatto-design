import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { adminUrl } from './paths';
import { db } from './db';
export const storageRoot = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_PATH || 'storage');
function s3() {
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) throw new Error('Configure o storage S3 antes de enviar imagens.');
  return new S3Client({ endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
export async function uploadImage(file: File, alt: string) {
  if (file.size > 10 * 1024 * 1024) throw new Error('A imagem deve ter até 10 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Envie JPG, PNG, WebP ou AVIF.');
  const source = Buffer.from(await file.arrayBuffer());
  const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, withoutEnlargement: true });
  const { data, info } = await image.webp({ quality: 86 }).toBuffer({ resolveWithObject: true }).catch(() => { throw new Error('Não foi possível ler a imagem. Confira o arquivo e tente outra imagem válida.'); });
  const storageKey = `${randomUUID()}.webp`;
  const url = adminUrl(`api/media/${storageKey}`);
  if (process.env.STORAGE_DRIVER === 's3') {
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: storageKey, Body: data, ContentType: 'image/webp' }));
  } else {
    await mkdir(storageRoot, { recursive: true });
    await writeFile(path.join(storageRoot, storageKey), data);
  }
  return db.media.create({ data: { name: file.name.slice(0, 200), storageKey, url, alt, mime: 'image/webp', size: data.length, width: info.width, height: info.height } });
}
export async function readImage(key: string) {
  if (!/^[0-9a-f-]{36}\.webp$/.test(key)) return null;
  if (process.env.STORAGE_DRIVER === 's3') {
    try { const object = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null; } catch { return null; }
  }
  try { return await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ storageRoot, key)); } catch { return null; }
}
