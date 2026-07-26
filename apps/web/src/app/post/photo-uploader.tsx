'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';
import { confirmUploadAction, requestUploadUrlAction } from './actions';

interface Upload {
  key: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  thumbUrl?: string | null;
  error?: string;
  progress: number;
}

interface PhotoUploaderLabels {
  choosePhotos: string;
  formats: string;
  preparing: string;
  ready: string;
  remove: string;
  processError: string;
  uploadFailed: string;
  networkError: string;
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
  labels,
}: {
  listingId: string;
  label: string;
  hint: string;
  labels: PhotoUploaderLabels;
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
              : { status: 'failed', error: labels.processError },
          );
        } else {
          patch(key, {
            status: 'failed',
            error: labels.uploadFailed.replace('{status}', String(request.status)),
          });
        }
        resolve();
      };

      request.onerror = () => {
        patch(key, { status: 'failed', error: labels.networkError });
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
    <div className="photo-uploader">
      <input
        id="photos"
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        // `capture` is deliberately omitted: most sellers photograph the item first and
        // upload afterwards, and forcing the camera hides the gallery.
        onChange={onSelect}
      />
      <label htmlFor="photos" className="photo-uploader__dropzone">
        <span className="photo-uploader__icon">
          <Icon name="image" />
        </span>
        <strong>{label}</strong>
        <span>{labels.choosePhotos}</span>
        <small>{labels.formats}</small>
      </label>
      <p className="photo-uploader__hint">{hint}</p>

      {uploads.length > 0 ? (
        <ul className="photo-uploader__list">
          {uploads.map((upload) => (
            <li key={upload.key}>
              {upload.thumbUrl ? (
                <img src={upload.thumbUrl} alt="" width={44} height={44} />
              ) : (
                <span className="photo-uploader__placeholder">
                  <Icon name="image" />
                </span>
              )}

              <div className="photo-uploader__status">
                <strong>{upload.name}</strong>

                {upload.status === 'uploading' ? (
                  <div className="photo-uploader__progress">
                    <span style={{ width: `${upload.progress}%` }} />
                  </div>
                ) : null}

                {upload.status === 'processing' ? <span>{labels.preparing}</span> : null}
                {upload.status === 'ready' ? (
                  <span className="is-ready">{labels.ready}</span>
                ) : null}
                {upload.status === 'failed' ? (
                  <span className="is-failed">{upload.error}</span>
                ) : null}
              </div>

              {upload.status === 'failed' ? (
                <button type="button" className="btn btn--ghost" onClick={() => retry(upload)}>
                  {labels.remove}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
