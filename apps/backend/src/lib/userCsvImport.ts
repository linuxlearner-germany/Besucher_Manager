export type UserCsvImportRawRow = {
  lineNumber: number;
  username: string;
  password: string;
  role: string;
  displayName: string;
  email: string;
  groups: string;
  menuAccess: string;
  isActive: string;
};

const headerAliases: Record<string, keyof Omit<UserCsvImportRawRow, "lineNumber">> = {
  username: "username",
  benutzername: "username",
  password: "password",
  passwort: "password",
  role: "role",
  rolle: "role",
  displayname: "displayName",
  anzeigename: "displayName",
  email: "email",
  "e-mail": "email",
  groups: "groups",
  gruppen: "groups",
  menuaccess: "menuAccess",
  menuzugriffe: "menuAccess",
  "menuezugriffe": "menuAccess",
  isactive: "isActive",
  aktiv: "isActive",
  status: "isActive"
};

const templateHeaders = ["username", "password", "role", "displayName", "email", "groups", "menuAccess", "isActive"];
const exportHeaders = ["username", "role", "displayName", "email", "gate", "groups", "menuAccess", "isActive", "lastLoginAt"];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, "")
    .replace(/[ _]/g, "")
    .replace(/ü/g, "u")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o");
}

function detectDelimiter(headerLine: string): "," | ";" {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseDelimitedLine(line: string, delimiter: "," | ";"): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

export function buildUserImportTemplateCsv(): string {
  return `${templateHeaders.join(",")}\n`;
}

function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function buildUserExportCsv(rows: Array<{
  username: string;
  role: string;
  displayName: string;
  email: string | null;
  gate: string | null;
  groups: string[];
  menuAccess: string[];
  isActive: boolean;
  lastLoginAt: string | null;
}>): string {
  const lines = rows.map((row) => [
    row.username,
    row.role,
    row.displayName,
    row.email,
    row.gate,
    row.groups.join("|"),
    row.menuAccess.join("|"),
    row.isActive ? "true" : "false",
    row.lastLoginAt
  ].map(escapeCsvCell).join(","));

  return `\uFEFF${exportHeaders.join(",")}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

export function parseUserImportCsv(input: Buffer | string): UserCsvImportRawRow[] {
  const text = typeof input === "string" ? input : input.toString("utf8");
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerValues = parseDelimitedLine(lines[0], delimiter);
  const headerMap = new Map<number, keyof Omit<UserCsvImportRawRow, "lineNumber">>();

  headerValues.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const mapped = headerAliases[normalized];
    if (mapped) {
      headerMap.set(index, mapped);
    }
  });

  if (!Array.from(headerMap.values()).includes("username") || !Array.from(headerMap.values()).includes("role")) {
    throw new Error("user_import_missing_headers");
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter);
    const row: UserCsvImportRawRow = {
      lineNumber: rowIndex + 2,
      username: "",
      password: "",
      role: "",
      displayName: "",
      email: "",
      groups: "",
      menuAccess: "",
      isActive: ""
    };

    cells.forEach((cell, index) => {
      const targetField = headerMap.get(index);
      if (targetField) {
        row[targetField] = cell;
      }
    });

    return row;
  });
}
