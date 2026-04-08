/**
 * Optional Cloudflare R2 (S3-compatible) upload for scene snapshots.
 * Uses AWS Signature Version 4 (no extra deps). When env is unset, image-worker
 * persists base64 in Postgres (legacy).
 */
import { createHash, createHmac } from "node:crypto";

export function isSceneImageObjectStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_SCENE_BUCKET?.trim() &&
      process.env.R2_PUBLIC_BASE_URL?.trim(),
  );
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secret}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function encodeR2PathSegments(key: string): string {
  return key
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
}

/**
 * PUT object to R2 and return a public HTTPS URL (no trailing slash on base).
 */
export async function uploadSceneImageBytes(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  if (!isSceneImageObjectStorageConfigured()) {
    throw new Error("R2 is not configured");
  }

  const accountId = process.env.R2_ACCOUNT_ID!.trim();
  const bucket = process.env.R2_SCENE_BUCKET!.trim();
  const accessKey = process.env.R2_ACCESS_KEY_ID!.trim();
  const secretKey = process.env.R2_SECRET_ACCESS_KEY!.trim();
  const publicBase = process.env.R2_PUBLIC_BASE_URL!.trim().replace(/\/$/, "");

  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodeR2PathSegments(params.key)}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(params.body);
  const canonicalHeaders =
    `content-type:${params.contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const sig = createHmac("sha256", signatureKey(secretKey, dateStamp, region, service))
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${sig}`,
  ].join(", ");

  const url = `https://${host}${canonicalUri}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": params.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: new Uint8Array(params.body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`R2 PUT failed ${res.status}: ${errText.slice(0, 300)}`);
  }

  const path = params.key.startsWith("/") ? params.key.slice(1) : params.key;
  return `${publicBase}/${path}`;
}
