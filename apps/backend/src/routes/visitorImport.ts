import type { Request, Response } from "express";
import multer, { MulterError } from "multer";
import type { AuthenticatedUser } from "../lib/visitWorkflow";
import { buildImportTemplateWorkbookBuffer } from "../lib/importTemplateFiles";
import { createImportedPreRegistrations } from "../lib/visitImport";
import { parseExcelBuffer } from "../lib/visitImportParsing";
import {
  getRequestIp,
  getRequestUserAgent,
  handleUnexpectedError,
  sendError,
  sendValidationError
} from "./shared";

export const visitorImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

function getExcelExtension(filename: string): "xlsx" | "xls" | null {
  const extension = filename.toLowerCase().split(".").pop() || "";
  if (extension === "xlsx" || extension === "xls") {
    return extension;
  }
  return null;
}

export function sendVisitorImportTemplate(response: Response, workbookBuffer: Buffer) {
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", 'attachment; filename="besucher-import-vorlage.xlsx"');
  return response.status(200).send(workbookBuffer);
}

export async function sendVisitorImportTemplateWorkbook(response: Response) {
  const workbookBuffer = await buildImportTemplateWorkbookBuffer();
  return sendVisitorImportTemplate(response, workbookBuffer);
}

export function handleVisitorImportUpload(
  request: Request,
  response: Response,
  options: {
    createdBy: AuthenticatedUser | null;
    fallbackGateId: string | null;
  }
) {
  return visitorImportUpload.single("file")(request, response, async (error) => {
    if (error) {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return sendError(response, 400, "FILE_TOO_LARGE", "Die Importdatei ist groesser als 5 MB.");
      }
      return sendError(response, 400, "UPLOAD_ERROR", "Die Importdatei konnte nicht gelesen werden.");
    }

    const file = request.file;
    if (!file) {
      return sendValidationError(response, { fieldErrors: { file: ["Bitte eine Excel-Datei auswählen."] } });
    }

    if (!getExcelExtension(file.originalname)) {
      return sendValidationError(response, { fieldErrors: { file: ["Es werden nur Excel-Dateien im Format XLSX oder XLS unterstuetzt."] } });
    }

    try {
      const rows = parseExcelBuffer(file.buffer);

      if (rows.length === 0) {
        return sendValidationError(response, { fieldErrors: { file: ["Keine importierbaren Zeilen gefunden."] } });
      }
      if (rows.length > 250) {
        return sendError(response, 400, "VALIDATION_ERROR", "Bitte maximal 250 Besucher pro Datei importieren.");
      }

      const imported = await createImportedPreRegistrations(rows, {
        source: "file_import",
        createdBy: options.createdBy,
        submittedIpAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        fallbackGateId: options.fallbackGateId
      });

      return response.status(201).json({
        message: `${imported.imported} Besucher importiert.`,
        ...imported
      });
    } catch (importError) {
      return handleUnexpectedError(response, importError, "IMPORT_ERROR", "Der Besucherimport konnte nicht verarbeitet werden.");
    }
  });
}
