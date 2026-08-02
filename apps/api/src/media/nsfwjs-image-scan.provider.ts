import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs';
import * as nsfw from 'nsfwjs';
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

export function scoresFrom(
  predictions: Array<{ className: string; probability: number }>,
): Record<NsfwClass, number> {
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
  predictions: Array<{ className: string; probability: number }>,
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
 * Self-hosted NSFW classification, in this process.
 *
 * Deliberately not a cloud provider. Four million records and a continuous upload stream
 * make per-image pricing a standing bill, and — the reason that actually matters — every
 * network hop is another dependency that can be unreachable. An unreachable scanner is
 * precisely what put 100% of production media into quarantine with no error and no alert.
 * The model weights ship inside the `nsfwjs` package and are loaded from disk, so this
 * provider makes no outbound request at all and cannot be "down" while the API is up.
 *
 * It runs on the pure-JavaScript CPU backend, which costs roughly a second per image. That
 * is paid once per upload, off the request path, and it avoids a native build step on
 * every machine and image that has to run this repo. `@tensorflow/tfjs-node` is a drop-in
 * speed-up if that second ever becomes the constraint.
 */
@Injectable()
export class NsfwjsImageScanProvider implements ImageScanProvider, OnApplicationBootstrap {
  private readonly logger = new Logger(NsfwjsImageScanProvider.name);
  private model: Promise<nsfw.NSFWJS> | null = null;

  constructor(private readonly config: AppConfig) {}

  /**
   * Loading the model takes a few seconds. Doing it at boot rather than on the first
   * upload keeps that cost off a user's first photograph, where it would otherwise burn
   * the scan timeout and fail open for no reason.
   */
  onApplicationBootstrap(): void {
    if (this.config.get('IMAGE_SCANNER_PROVIDER') !== 'nsfwjs') return;
    void this.load().catch(() => {
      // Already logged in load(). A failed warm-up must not stop the API from starting;
      // the next scan retries and, failing that, fails open loudly.
    });
  }

  async scan(subject: ImageScanSubject): Promise<ImageScanVerdict> {
    const model = await this.load();
    const size = MODEL_INPUT_SIZE[this.config.get('NSFWJS_MODEL')] ?? 224;

    // sharp does the decoding, so the scanner accepts every format the upload pipeline
    // does — WebP and HEIC included — without a separate conversion step. `fit: 'fill'`
    // matches what the model was trained on: a square regardless of aspect ratio.
    const { data, info } = await sharp(subject.bytes)
      .rotate()
      .removeAlpha()
      .resize(size, size, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
    let predictions: nsfw.PredictionType[];
    try {
      predictions = await model.classify(pixels);
    } finally {
      // TensorFlow buffers are not garbage collected. One leaked input tensor per upload
      // is a slow memory leak in a long-lived API process.
      pixels.dispose();
    }

    return mapNsfwScores(
      predictions,
      this.config.get('NSFWJS_EXPLICIT_REVIEW_SCORE'),
      this.config.get('NSFWJS_SUGGESTIVE_REVIEW_SCORE'),
    );
  }

  /**
   * One model, loaded once, shared by every scan.
   *
   * A failed load clears the memo so the next upload tries again; caching the rejection
   * would turn one bad moment at boot into a scanner that is down until someone restarts
   * the process.
   */
  private load(): Promise<nsfw.NSFWJS> {
    if (!this.model) {
      const modelName = this.config.get('NSFWJS_MODEL');
      this.model = (async () => {
        // There is no GPU and no WebGL here. Choosing the CPU backend explicitly avoids
        // tfjs probing for one and logging a failure that looks like a real fault.
        await tf.setBackend('cpu');
        await tf.ready();
        const loaded = await nsfw.load(modelName);
        this.logger.log(`nsfwjs model ${modelName} loaded from disk; no network dependency`);
        return loaded;
      })().catch((error: unknown) => {
        this.model = null;
        this.logger.error(
          `nsfwjs model ${modelName} failed to load: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw error;
      });
    }
    return this.model;
  }
}
