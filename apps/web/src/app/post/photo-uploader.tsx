'use client';

import { useState } from 'react';
import { confirmUploadAction, requestUploadUrlAction } from './actions';

interface Upload {
  key: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  thumbUrl?: string | null;
  error?: string;
  progress: number;
}

/**
 * Direct-to-storage uploader.
 *
 * The file goes straight from the browser to R2/MinIO using a signed URL — it never
 * passes through this server. XMLHttpRequest rather than fetch, because it is still the
 * only way to get real upload progress, and on an Indian mobile connection a large photo
 * without a progress bar reads as a frozen app.
 */
export function PhotoUploader({
  listingId,
  label,
  hint,
}: {
  listingId: string;
  label: string;
  hint: string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);

  function patch(key: string, changes: Partial<Upload>) {
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...changes } : upload)),
    );
  }

  async function uploadOne(file: File, key: string) {
    const signed = await requestUploadUrlAction(listingId, file.type, file.size);
    if (!signed.ok) {
      patch(key, { status: 'failed', error: signed.error });
      return;
    }

    await new Promise<void>((resolve) => {
      const request = new XMLHttpRequest();
      request.open('PUT', signed.uploadUrl);
      // Must match the Content-Type the signature was issued for.
      request.setRequestHeader('Content-Type', file.type);

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          patch(key, { progress: Math.round((event.loaded / event.total) * 100) });
        }
      };

      request.onload = async () => {
        if (request.status >= 200 && request.status < 300) {
          patch(key, { status: 'processing', progress: 100 });
          const confirmed = await confirmUploadAction(signed.mediaId);
          patch(
            key,
            confirmed.ok
              ? { status: 'ready', thumbUrl: confirmed.thumbUrl }
              : { status: 'failed', error: 'Could not process this image' },
          );
        } else {
          patch(key, { status: 'failed', error: `Upload failed (${request.status})` });
        }
        resolve();
      };

      request.onerror = () => {
        patch(key, { status: 'failed', error: 'Network error' });
        resolve();
      };

      request.send(file);
    });
  }

  async function onSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    const pending: Upload[] = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      status: 'uploading',
      progress: 0,
    }));

    setUploads((current) => [...current, ...pending]);

    // Sequential rather than parallel: several large photos at once on a mobile
    // connection make every one of them slow and the progress meaningless.
    for (let index = 0; index < files.length; index += 1) {
      await uploadOne(files[index]!, pending[index]!.key);
    }
  }

  function retry(upload: Upload) {
    setUploads((current) => current.filter((entry) => entry.key !== upload.key));
  }

  return (
    <div className="field">
      <label htmlFor="photos">{label}</label>
      <input
        id="photos"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        // `capture` is deliberately omitted: most sellers photograph the item first and
        // upload afterwards, and forcing the camera hides the gallery.
        onChange={onSelect}
      />
      <p className="field__hint">{hint}</p>

      {uploads.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
          {uploads.map((upload) => (
            <li
              key={upload.key}
              style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.875rem' }}
            >
              {upload.thumbUrl ? (
                <img
                  src={upload.thumbUrl}
                  alt=""
                  width={44}
                  height={44}
                  style={{ borderRadius: 6, objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 6,
                    background: 'var(--locz-surface-muted)',
                  }}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {upload.name}
                </div>

                {upload.status === 'uploading' ? (
                  <div
                    style={{
                      height: 4,
                      background: 'var(--locz-surface-muted)',
                      borderRadius: 999,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        width: `${upload.progress}%`,
                        height: '100%',
                        background: 'var(--locz-primary)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                ) : null}

                {upload.status === 'processing' ? (
                  <span style={{ color: 'var(--locz-text-muted)' }}>…</span>
                ) : null}
                {upload.status === 'ready' ? (
                  <span style={{ color: 'var(--locz-success)' }}>✓</span>
                ) : null}
                {upload.status === 'failed' ? (
                  <span style={{ color: 'var(--locz-danger)' }}>{upload.error}</span>
                ) : null}
              </div>

              {upload.status === 'failed' ? (
                <button type="button" className="btn btn--ghost" onClick={() => retry(upload)}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
