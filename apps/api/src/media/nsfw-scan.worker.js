'use strict';

/**
 * NSFW classification, off the main thread.
 *
 * `@tensorflow/tfjs` runs on the pure-JavaScript CPU backend here — there is no native
 * binding and no GPU — so a MobileNetV2 forward pass is roughly a second of straight-line
 * JavaScript. On the main thread that is a second in which the API answers nothing at all:
 * not a health check, not a search, not somebody else's page. One upload stalled every
 * concurrent request, and the provider's own comment claimed the cost was "off the request
 * path" when `confirmUpload` awaited it inline.
 *
 * Moving it here keeps the cost where it belongs. The thread owns the model, so it is loaded
 * once rather than per image, and the main thread stays free while it works.
 *
 * Plain JavaScript rather than TypeScript on purpose. `nest build` copies this file verbatim
 * (see the `assets` entry in nest-cli.json), so the same path resolves under `ts-node`, under
 * Jest and in the built image — which means the test suite exercises the code production
 * runs, instead of a second in-process implementation kept alongside it.
 *
 * Messages in:  { id, pixels: Uint8Array, height, width }
 * Messages out: { id, predictions } | { id, error }
 */

const { parentPort, workerData } = require('node:worker_threads');
const tf = require('@tensorflow/tfjs');
const nsfw = require('nsfwjs');

if (!parentPort) throw new Error('nsfw-scan.worker must be run as a worker thread');

const modelName = workerData && workerData.modelName ? workerData.modelName : 'MobileNetV2';

/**
 * One model for the life of the thread.
 *
 * A failed load rejects this promise and the thread reports the failure for every pending
 * request; the provider then discards the worker and the next scan starts a fresh one. That
 * is deliberately not retried in here — a thread that keeps a broken model alive looks
 * healthy from outside.
 */
const ready = (async () => {
  // No WebGL and no GPU in this process. Selecting the backend explicitly stops tfjs probing
  // for one and logging a failure that reads like a real fault.
  await tf.setBackend('cpu');
  await tf.ready();
  const model = await nsfw.load(modelName);
  parentPort.postMessage({ ready: true, modelName });
  return model;
})();

ready.catch((error) => {
  parentPort.postMessage({ fatal: error instanceof Error ? error.message : String(error) });
});

parentPort.on('message', (message) => {
  const { id, pixels, height, width } = message;

  ready
    .then(async (model) => {
      const tensor = tf.tensor3d(new Uint8Array(pixels), [height, width, 3], 'int32');
      try {
        const predictions = await model.classify(tensor);
        parentPort.postMessage({ id, predictions });
      } finally {
        // TensorFlow buffers are not garbage collected. One leaked input tensor per upload is
        // a slow memory leak in a thread that lives as long as the process.
        tensor.dispose();
      }
    })
    .catch((error) => {
      parentPort.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});
