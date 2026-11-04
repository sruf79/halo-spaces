// zlib für pst-extractor (nur Entpacken) über pako: zlib-, gzip- oder rohe Daten
import { inflate, inflateRaw, ungzip } from "pako";
import { Buffer } from "buffer";
export const unzipSync = data => {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    return Buffer.from(u8[0] == 0x1f && u8[1] == 0x8b ? ungzip(u8) : inflate(u8));
  } catch {
    return Buffer.from(inflateRaw(u8));
  }
};
export const inflateSync = unzipSync;
export default { unzipSync, inflateSync };
