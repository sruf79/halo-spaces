// Dateizugriff für pst-extractor: liefert halo.spaces zur Laufzeit (globalThis.__haloPstFs)
const fs = () => globalThis.__haloPstFs;
export const openSync = (...a) => fs().openSync(...a);
export const readSync = (...a) => fs().readSync(...a);
export const closeSync = (...a) => fs().closeSync(...a);
export default { openSync, readSync, closeSync };
