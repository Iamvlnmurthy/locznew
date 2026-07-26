import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';

/**
 * S3-compatible object storage. The same code talks to MinIO locally and Cloudflare R2
 * in production — only the endpoint and credentials differ, and both come from the
 * environment (ADR-0006).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfig) {
    this.bucket = config.get('STORAGE_BUCKET');
    this.client = new S3Client({
      endpoint: config.get('STORAGE_ENDPOINT'),
      region: config.get('STORAGE_REGION'),
      // MinIO needs path-style addressing; R2 accepts it too.
      forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
  }

  /**
   * A short-lived URL the client PUTs bytes to directly.
   *
   * ContentType is part of the signature, so the upload must match what the API
   * approved — a client cannot get a URL for a JPEG and then push an executable.
   * Size is still re-checked after upload, because a signed URL alone cannot enforce it.
   */
  async createUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresIn = this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');

    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );

    return { url, expiresInSeconds: expiresIn };
  }

  async createDownloadUrl(key: string): Promise<string> {
    return (await this.createDownloadUrlWithExpiry(key)).url;
  }

  async createDownloadUrlWithExpiry(
    key: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const expiresInSeconds = this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS');
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
    return { url, expiresInSeconds };
  }

  /** Derivatives live under `public/`, which the bucket policy exposes anonymously. */
  publicUrl(key: string): string {
    // Development seed media is served by the web app so a fresh checkout has a
    // convincing catalogue before MinIO is populated. User uploads still use normal
    // object-storage keys; absolute URLs are never accepted by the upload endpoints.
    if (/^https?:\/\//i.test(key)) return key;
    return `${this.config.get('STORAGE_PUBLIC_BASE_URL')}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // A failed delete leaves an orphan object, not a broken user flow — log and move on.
      this.logger.warn(
        `Could not delete ${key}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        MetadataDirective: 'REPLACE',
      }),
    );
  }

  async getObjectBytes(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
}
