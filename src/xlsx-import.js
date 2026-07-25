// Small, dependency-free reader for a roster-style .xlsx workbook. It reads the
// first sheet only and intentionally supports values (not formulas/macros).
const decoder = new TextDecoder();

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8 || !globalThis.DecompressionStream) throw new Error('This browser cannot read this Excel file. Export it as CSV UTF-8 instead.');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}

async function zipEntries(buffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let offset = Math.max(0, view.byteLength - 65557); offset <= view.byteLength - 22; offset += 1) if (u32(view, offset) === 0x06054b50) end = offset;
  if (end < 0) throw new Error('The selected file is not a valid .xlsx workbook');
  const count = u16(view, end + 10);
  let cursor = u32(view, end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error('The Excel archive is malformed');
    const method = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const localOffset = u32(view, cursor + 42);
    const name = decoder.decode(new Uint8Array(buffer, cursor + 46, nameLength));
    if (u32(view, localOffset) !== 0x04034b50) throw new Error('The Excel archive is malformed');
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, await inflate(new Uint8Array(buffer, start, compressedSize), method));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xml(bytes) { return new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml'); }
function valuesFromSheet(sheet, sharedStrings) {
  const rows = [];
  sheet.querySelectorAll('sheetData > row').forEach((row) => {
    const cells = [];
    row.querySelectorAll('c').forEach((cell) => {
      const ref = cell.getAttribute('r') || '';
      const column = ref.replace(/\d/g, '').split('').reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const value = cell.querySelector('v')?.textContent || cell.querySelector('is t')?.textContent || '';
      cells[column] = cell.getAttribute('t') === 's' ? (sharedStrings[Number(value)] || '') : value;
    });
    rows.push(cells.map((value) => String(value || '').trim()));
  });
  return rows;
}

export async function parseXlsxRoster(file, mapRows) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Excel files larger than 8 MB are not accepted for roster import');
  const entries = await zipEntries(await file.arrayBuffer());
  const shared = entries.has('xl/sharedStrings.xml') ? Array.from(xml(entries.get('xl/sharedStrings.xml')).querySelectorAll('si')).map((item) => Array.from(item.querySelectorAll('t')).map((node) => node.textContent).join('')) : [];
  const sheetEntry = ['xl/worksheets/sheet1.xml', ...Array.from(entries.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))].find((name) => entries.has(name));
  if (!sheetEntry) throw new Error('No worksheet was found in this Excel file');
  return mapRows(valuesFromSheet(xml(entries.get(sheetEntry)), shared));
}
