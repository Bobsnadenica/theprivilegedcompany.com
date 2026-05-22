const CV_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf"
};

const DOCUMENT_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ...CV_CONTENT_TYPES_BY_EXTENSION,
  txt: "text/plain"
};

const CV_ALLOWED_CONTENT_TYPES = new Set(Object.values(CV_CONTENT_TYPES_BY_EXTENSION));
const DOCUMENT_ALLOWED_CONTENT_TYPES = new Set(
  Object.values(DOCUMENT_CONTENT_TYPES_BY_EXTENSION)
);

export const CV_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export const CV_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const CV_UPLOAD_FORMAT_LABEL = "PDF, DOC или DOCX до 8 MB";

export const DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_UPLOAD_FORMAT_LABEL = "PDF, DOC, DOCX или TXT до 10 MB";
export const DOCUMENT_UPLOAD_MAX_COUNT = 10;

function getFileExtension(fileName: string) {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

export function getCvUploadContentType(file: Pick<File, "name" | "type">) {
  const type = file.type.trim().toLowerCase();

  if (CV_ALLOWED_CONTENT_TYPES.has(type)) {
    return type;
  }

  return CV_CONTENT_TYPES_BY_EXTENSION[getFileExtension(file.name)] || "application/octet-stream";
}

export function getCvUploadValidationError(file: Pick<File, "name" | "size" | "type">) {
  const contentType = getCvUploadContentType(file);

  if (!CV_ALLOWED_CONTENT_TYPES.has(contentType)) {
    return "Качи CV във формат PDF, DOC или DOCX.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Файлът изглежда празен. Избери валиден CV документ.";
  }

  if (file.size > CV_UPLOAD_MAX_BYTES) {
    return "CV файлът трябва да е 8 MB или по-малък.";
  }

  return "";
}

export function getDocumentUploadContentType(file: Pick<File, "name" | "type">) {
  const type = file.type.trim().toLowerCase();

  if (DOCUMENT_ALLOWED_CONTENT_TYPES.has(type)) {
    return type;
  }

  return (
    DOCUMENT_CONTENT_TYPES_BY_EXTENSION[getFileExtension(file.name)] ||
    "application/octet-stream"
  );
}

export function getDocumentUploadValidationError(
  file: Pick<File, "name" | "size" | "type">
) {
  const contentType = getDocumentUploadContentType(file);

  if (!DOCUMENT_ALLOWED_CONTENT_TYPES.has(contentType)) {
    return "Поддържани формати: PDF, DOC, DOCX или TXT.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Файлът изглежда празен.";
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return "Документът трябва да е 10 MB или по-малък.";
  }

  return "";
}
