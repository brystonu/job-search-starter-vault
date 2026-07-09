import fs from "node:fs/promises";
import zlib from "node:zlib";

const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_END_OF_CENTRAL_DIR_SCAN = 22 + 65535 + 100;

export async function extractDocxText(filePath) {
  const buffer = await fs.readFile(filePath);
  const xml = readZipEntry(buffer, "word/document.xml", filePath);
  return documentXmlToText(xml);
}

function readZipEntry(buffer, entryName, filePath) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw notDocxError(filePath);

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) {
      throw notDocxError(filePath);
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (name === entryName) {
      return readEntryData(buffer, localHeaderOffset, method, compressedSize, uncompressedSize, filePath);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw notDocxError(filePath);
}

function findEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) return -1;
  const stop = Math.max(0, buffer.length - MAX_END_OF_CENTRAL_DIR_SCAN);
  for (let offset = buffer.length - 22; offset >= stop; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIR_SIGNATURE) return offset;
  }
  return -1;
}

function readEntryData(buffer, localHeaderOffset, method, compressedSize, uncompressedSize, filePath) {
  if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== LOCAL_HEADER_SIGNATURE) {
    throw notDocxError(filePath);
  }
  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + nameLength + extraLength;

  if (method === 8) {
    return zlib.inflateRawSync(buffer.subarray(dataStart, dataStart + compressedSize)).toString("utf8");
  }
  if (method === 0) {
    return buffer.subarray(dataStart, dataStart + uncompressedSize).toString("utf8");
  }
  throw new Error(`Unsupported compression method ${method} inside ${filePath}. Re-save the file as .docx or .txt and try again.`);
}

function notDocxError(filePath) {
  return new Error(`${filePath} does not look like a Word .docx file (missing ZIP structure or word/document.xml). Re-save it as .docx or .txt, or paste the text instead.`);
}

export function documentXmlToText(xml) {
  const text = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\b[^>]*>/g, "\t")
    .replace(/<w:br\b[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeXmlEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

function decodeXmlEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (match, code) => {
    if (code[0] === "#") {
      const codePoint = /^#x/i.test(code) ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}
