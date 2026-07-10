import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = "25MB";

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

    try {
      const data = await put(pathname, fileBuffer, {
        access: "public",
        contentType,
      });

      return NextResponse.json({
        ...data,
        contentType,
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
