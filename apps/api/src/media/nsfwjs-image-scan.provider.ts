import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { AppConfig } from '../config/config.module';
import {
  ImageScanProvider,
  ImageScanSubject,
  ImageScanVerdict,
} from './image-scan-provider.interface';

/** The five classes the nsfwjs model emits. */
type NsfwClass = 'Drawing' | 'Hentai' | 'Neutral' | 'Porn' | 'Sexy';

/** Input edge length each bundled model expects. */
const MODEL_INPUT_SIZE: Record<string, number> = {
  MobileNetV2: 224,
  MobileNetV2Mid: 224,
  InceptionV3: 299,
};

interface Prediction {
  className: string;
  probability: number;
}

export function scoresFrom(predictions: Prediction[]): Record<NsfwClass, number> {
  const scores: Record<NsfwClass, number> = {
    Drawing: 0,
    Hentai: 0,
    Neutral: 0,
    Porn: 0,
    Sexy: 0,
  };
  for (const prediction of predictions) {
    if (prediction.className in scores) {
      scores[prediction.className as NsfwClass] = prediction.probability;
    }
  }
  return scores;
}

/**
 * Turns model probabilities into the pipeline's three-value contract.
 *
 * REJECT is never returned. A classifier score is a probability about pixels, and an
 * outright refusal on that alone means an honest seller's photograph disappears with an
 * accusation attached and no way to argue. Everything the model objects to goes to a
 * person instead — which is only a real option because the release route now exists.
 */
export function mapNsfwScores(
  predictions: Prediction[],
  explicitReviewScore: number,
  suggestiveReviewScore: number,
): ImageScanVerdict {
  const scores = scoresFrom(predictions);
  const reasons: string[] = [];

  // Porn and Hentai are summed rather than tested separately: the model routinely splits a
  // single explicit picture across both, and two scores of 0.3 mean the same thing as one
  // of 0.6.
  if (scores.Porn + scores.Hentai >= explicitReviewScore) {
    reasons.push('NSFWJS_EXPLICIT');
  }
  if (scores.Sexy >= suggestiveReviewScore) {
    reasons.push('NSFWJS_SUGGESTIVE');
  }

  return reasons.length > 0
    ? { decision: 'REVIEW', reasons, provider: 'nsfwjs' }
    : { decision: 'APPROVE', reasons: [], provider: 'nsfwjs' };
}

/**
 * Self-hosted NSFW classification, in a worker thread.
 *
 * Deliberately not a cloud provider. Four million records and a continuous upload stream
 * make per-image pricing a standing bill, and — the reason that actually matters — every
 * network hop is another dependency that can be unreachable. An unreachable scanner is
 * precisely what put 100% of production media into quarantine with no error and no alert.
 * The model weights ship inside the `nsfwjs` package and are loaded from disk, so this
 * provider makes no outbound request at all and cannot be "down" while the API is up.
 *
 * The inference runs on `nsfw-scan.worker.js` rather than here. It costs roughly a second per
 * image on the pure-JavaScript CPU backend, and `confirmUpload` awaits this call inside the
 * HTTP request — so on the main thread that second was a second in which the whole API
 * answered nothing. The worker owns the model, the main thread stays free, and the shape of
 * this class is unchanged for every caller.
 *
 * One worker, reused. Spawning per scan would reload a 38 MB model each time, which is far
 * worse than the problem being solved.
 */
@Injectable()
export class NsfwjsImageScanProvider
  implements ImageScanProvider, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NsfwjsImageScanProvider.name);

  private worker: Worker | null = null;
  /** Set while the module is shutting down, so a deliberate exit is not reported as a fault. */
  private stopping = false;
  private nextRequestId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (predictions: Prediction[]) => void; reject: (error: Error) => void }
  >();

  constructor(private readonly config: AppConfig) {}

  /**
   * Loading the model takes a few seconds. Starting the worker at boot rather than on the
   * first upload keeps that cost off a user's first photograph, where it would otherwise
   * burn the scan timeout and fail open for no reason.
   */
  onApplicationBootstrap(): void {
    if (this.config.get('IMAGE_SCANNER_PROVIDER') !== 'nsfwjs') return;
    this.ensureWorker();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }

  async scan(subject: ImageScanSubject): Promise<ImageScanVerdict> {
    const size = MODEL_INPUT_SIZE[this.config.get('NSFWJS_MODEL')] ?? 224;

    // sharp does the decoding, so the scanner accepts every format the upload pipeline
    // does — WebP and HEIC included — without a separate conversion step. `fit: 'fill'`
    // matches what the model was trained on: a square regardless of aspect ratio. This part
    // is native and already releases the event loop while it works.
    const { data, info } = await sharp(subject.bytes)
      .rotate()
      .removeAlpha()
      .resize(size, size, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const predictions = await this.classify(data, info.height, info.width);

    return mapNsfwScores(
      predictions,
      this.config.get('NSFWJS_EXPLICIT_REVIEW_SCORE'),
      this.config.get('NSFWJS_SUGGESTIVE_REVIEW_SCORE'),
    );
  }

  /** Hands one image to the worker and waits for its answer. */
  private classify(pixels: Buffer, height: number, width: number): Promise<Prediction[]> {
    const worker = this.ensureWorker();
    const id = this.nextRequestId++;

    return new Promise<Prediction[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // The pixel buffer is transferred rather than copied: it is a few hundred kilobytes per
      // image and the main thread has no further use for it.
      const view = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength).slice();
      worker.postMessage({ id, pixels: view, height, width }, [view.buffer]);
    });
  }

  /**
   * The running worker, started if there is not one.
   *
   * A worker that has exited takes every request waiting on it down with a clear error rather
   * than leaving them hanging until the scan timeout — and the next scan starts a replacement,
   * so a crash costs one upload rather than every upload until a restart.
   */
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(join(__dirname, 'nsfw-scan.worker.js'), {
      workerData: { modelName: this.config.get('NSFWJS_MODEL') },
    });

    worker.on('message', (message: Record<string, unknown>) => {
      if (message.ready === true) {
        this.logger.log(
          `nsfwjs model ${String(message.modelName)} loaded from disk in a worker thread; no network dependency`,
        );
        return;
      }

      if (typeof message.fatal === 'string') {
        this.logger.error(`nsfwjs model failed to load: ${message.fatal}`);
        return;
      }

      const waiting = this.pending.get(message.id as number);
      if (!waiting) return;
      this.pending.delete(message.id as number);

      if (typeof message.error === 'string') waiting.reject(new Error(message.error));
      else waiting.resolve(message.predictions as Prediction[]);
    });

    const fail = (reason: string): void => {
      if (this.worker === worker) this.worker = null;
      for (const [id, waiting] of this.pending) {
        this.pending.delete(id);
        waiting.reject(new Error(reason));
      }
    };

    worker.on('error', (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`nsfwjs worker failed: ${reason}`);
      fail(`nsfwjs worker failed: ${reason}`);
    });

    worker.on('exit', (code) => {
      // An exit with nothing in flight is the process going away, not a scanner fault —
      // `unref` lets Node reclaim the thread on shutdown, and reporting that as an error
      // teaches operators to ignore the message that matters.
      const unexpected = code !== 0 && !this.stopping && this.pending.size > 0;
      if (unexpected) this.logger.error(`nsfwjs worker exited with code ${code}`);
      fail(`nsfwjs worker exited with code ${code}`);
    });

    // Nothing keeps the process alive on account of the scanner: an idle API should still be
    // able to shut down.
    worker.unref();

    this.worker = worker;
    return worker;
  }
}
