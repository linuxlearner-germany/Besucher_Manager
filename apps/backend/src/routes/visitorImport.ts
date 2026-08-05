import type { Request, Response } from "express";
import multer, { MulterError } from "multer";
import type { AuthenticatedUser } from "../lib/visitWorkflow";
import { buildImportTemplateWorkbookBuffer } from "../lib/importTemplateFiles";
import { ImportValidationError, createImportedPreRegistrations } from "../lib/visitImport";
import { parseExcelBufferWithMetadata } from "../lib/visitImportParsing";
import { listFieldDefinitions } from "../lib/fieldDefinitions";
import { PUBLIC_FIELD_INPUT_MAP, type PublicFieldKey } from "../lib/publicPreRegistrationSchema";
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

function getExcelExtension(filename: string): "xlsx" | null {
  const extension = filename.toLowerCase().split(".").pop() || "";
  if (extension === "xlsx") {
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
  const definitions = await listFieldDefinitions("public");
  const workbookBuffer = await buildImportTemplateWorkbookBuffer(definitions);
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
      return sendValidationError(response, { fieldErrors: { file: ["Es werden nur Excel-Dateien im Format XLSX unterstuetzt."] } });
    }

    try {
      const { rows, ignoredSampleRows } = await parseExcelBufferWithMetadata(file.buffer);

      if (rows.length === 0) {
        const message = ignoredSampleRows > 0
          ? "Die Datei enthält nur leere oder unveränderte Musterzeilen. Bitte tragen Sie mindestens einen echten Besucher ein."
          : "Keine importierbaren Zeilen gefunden.";
        return sendValidationError(response, { fieldErrors: { file: [message] } });
      }
      if (rows.length > 250) {
        return sendError(response, 400, "VALIDATION_ERROR", "Bitte maximal 250 Besucher pro Datei importieren.");
      }

      const definitions = await listFieldDefinitions("public");
      const supportedKeys = new Set(Object.keys(PUBLIC_FIELD_INPUT_MAP));
      const requiredPublicFieldKeys = new Set<PublicFieldKey>(
        definitions
          .filter((field) => field.requiredPublic && supportedKeys.has(field.fieldKey))
          .map((field) => field.fieldKey as PublicFieldKey)
      );

      const imported = await createImportedPreRegistrations(rows, {
        source: "file_import",
        createdBy: options.createdBy,
        submittedIpAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        fallbackGateId: options.fallbackGateId,
        requiredPublicFieldKeys
      });

      return response.status(201).json({
        message: `${imported.imported} Besucher importiert.${ignoredSampleRows > 0 ? ` ${ignoredSampleRows} unveränderte Musterzeile(n) ignoriert.` : ""}`,
        ...imported,
        ignoredSampleRows
      });
    } catch (importError) {
      if (importError instanceof ImportValidationError) {
        return sendValidationError(response, { fieldErrors: { file: importError.messages } });
      }
      if (importError instanceof Error && importError.message === "invalid_import_nationalities") {
        const rows = (importError as Error & { rows?: number[] }).rows ?? [];
        return sendValidationError(response, {
          fieldErrors: {
            nationalityCode: [`Nationalität fehlt oder ist unbekannt in Excel-Zeile(n): ${rows.join(", ")}. Es wurden keine Datensätze importiert.`]
          }
        });
      }
      return handleUnexpectedError(response, importError, "IMPORT_ERROR", "Der Besucherimport konnte nicht verarbeitet werden.");
    }
  });
}
