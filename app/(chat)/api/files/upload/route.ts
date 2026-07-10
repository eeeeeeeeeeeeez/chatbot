import { inflateRawSync } from "node:zlib";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = "25MB";
const MAX_EXTRACTED_TEXT_CHARS = 16_000;

const allowedTypes = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const fallbackTypesByExtension: Record<string, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const allowedExtensions = new Set(Object.keys(fallbackTypesByExtension));

function getFileExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function sanitizeFilename(filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeName || "upload";
}

function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    return `檔案大小需小於 ${MAX_FILE_SIZE_LABEL}`;
  }

  const extension = getFileExtension(file.name);
  const isAllowedType = file.type ? allowedTypes.has(file.type) : false;
  const isAllowedExtension = allowedExtensions.has(extension);

  if (!isAllowedType && !isAllowedExtension) {
    return "支援格式：PDF、PNG、JPG、XLS、XLSX、PPT、PPTX、DOC、DOCX";
  }
}

function readUInt16(buffer: Uint8Array, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt32(buffer: Uint8Array, offset: number) {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24)
  ) >>> 0;
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function xmlToText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function findEndOfCentralDirectory(buffer: Uint8Array) {
  for (let offset = buffer.length - 22; offset >= 0; offset--) {
    if (readUInt32(buffer, offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function unzipTextFiles(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const files = new Map<string, string>();
  const eocdOffset = findEndOfCentralDirectory(bytes);

  if (eocdOffset === -1) {
    return files;
  }

  const entryCount = readUInt16(bytes, eocdOffset + 10);
  let offset = readUInt32(bytes, eocdOffset + 16);
  const decoder = new TextDecoder("utf-8");

  for (let index = 0; index < entryCount; index++) {
    if (readUInt32(bytes, offset) !== 0x02014b50) {
      break;
    }

    const method = readUInt16(bytes, offset + 10);
    const compressedSize = readUInt32(bytes, offset + 20);
    const nameLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const localHeaderOffset = readUInt32(bytes, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    if (readUInt32(bytes, localHeaderOffset) === 0x04034b50) {
      const localNameLength = readUInt16(bytes, localHeaderOffset + 26);
      const localExtraLength = readUInt16(bytes, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);

      try {
        const content =
          method === 0
            ? compressed
            : method === 8
              ? inflateRawSync(compressed)
              : null;

        if (content) {
          files.set(name, decoder.decode(content));
        }
      } catch (_) {
        // Ignore individual files that cannot be decompressed.
      }
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function truncateExtractedText(text: string) {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[內容過長，已截斷前 ${MAX_EXTRACTED_TEXT_CHARS} 字供 AI 解析。]`;
}

function extractOfficeText(buffer: ArrayBuffer, extension: string) {
  if (!["docx", "pptx", "xlsx"].includes(extension)) {
    return "";
  }

  const files = unzipTextFiles(buffer);
  let xmlFiles: string[] = [];

  if (extension === "docx") {
    xmlFiles = ["word/document.xml"];
  } else if (extension === "pptx") {
    xmlFiles = [...files.keys()]
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } else if (extension === "xlsx") {
    xmlFiles = [...files.keys()]
      .filter(
        (name) =>
          name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  const extractedText = xmlFiles
    .map((name) => xmlToText(files.get(name) ?? ""))
    .filter(Boolean)
    .join("\n\n");

  return truncateExtractedText(extractedText);
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validationError = validateFile(file);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const extension = getFileExtension(file.name);
    const safeName = sanitizeFilename(file.name);
    const pathname = `uploads/${crypto.randomUUID()}-${safeName}`;
    const contentType =
      file.type || fallbackTypesByExtension[extension] || "application/octet-stream";
    const fileBuffer = await file.arrayBuffer();
    const extractedText = extractOfficeText(fileBuffer, extension);

    try {
      const data = await put(pathname, fileBuffer, {
        access: "public",
        contentType,
      });

      return NextResponse.json({
        ...data,
        contentType,
        extractedText,
        pathname: file.name,
      });
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
