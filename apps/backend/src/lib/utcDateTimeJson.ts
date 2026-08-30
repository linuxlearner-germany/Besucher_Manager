const UTC_DATE_TIME_WITHOUT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/;

/**
 * SQL Server DATETIME2 values are UTC in this application, but CONVERT style
 * 126/127 returns them without an offset. Mark those values as UTC before they
 * leave the API so browsers do not interpret them as local wall-clock time.
 */
export function utcDateTimeJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "string" && UTC_DATE_TIME_WITHOUT_OFFSET.test(value)) {
    return `${value}Z`;
  }

  return value;
}
