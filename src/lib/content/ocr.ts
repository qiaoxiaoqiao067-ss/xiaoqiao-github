import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createWorker, OEM } from "tesseract.js"

export async function createScriptOcr() {
  const langPath = await mkdtemp(join(tmpdir(), "workbench-ocr-"))
  try {
    await Promise.all(["eng", "chi_sim"].map(code => copyFile(
      join(process.cwd(), `node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`),
      join(langPath, `${code}.traineddata.gz`),
    )))
    const worker = await createWorker("eng+chi_sim", OEM.LSTM_ONLY, {
      langPath, cacheMethod: "none", gzip: true,
      workerPath: join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
      errorHandler: () => undefined,
    })
    const terminate = worker.terminate.bind(worker)
    worker.terminate = async () => {
      try { return await terminate() } finally { await rm(langPath, { recursive: true, force: true }) }
    }
    return worker
  } catch (error) {
    await rm(langPath, { recursive: true, force: true })
    throw error
  }
}
