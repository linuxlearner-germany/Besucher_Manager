export const BADGE_TEXT_SECTION_DEFINITIONS = [
  {
    type: "security_notice",
    label: "Sicherheitshinweise",
    heading: "Sicherheitshinweise",
    sortOrder: 10
  },
  {
    type: "photo_ban",
    label: "Fotografierverbot",
    heading: "Fotografierverbot",
    sortOrder: 20
  },
  {
    type: "signature_notice",
    label: "Rückgabe und Unterschrift",
    heading: "Rückgabe und Unterschrift",
    sortOrder: 30
  },
  {
    type: "visitor_notice",
    label: "Hinweis für Besucher",
    heading: "Hinweis für Besucher",
    sortOrder: 40
  },
  {
    type: "footer",
    label: "Footer",
    heading: "Footer",
    sortOrder: 50
  },
  {
    type: "custom",
    label: "Benutzerdefinierter Bereich",
    heading: "Benutzerdefinierter Bereich",
    sortOrder: 100
  }
] as const;

export type BadgeTextSectionType = typeof BADGE_TEXT_SECTION_DEFINITIONS[number]["type"];

export type BadgeTextRecord = {
  id: string;
  name: string;
  sectionType: string;
  customHeading: string | null;
  content: string;
  isActive: boolean;
  sortOrder: number;
};

const sectionDefinitionMap = new Map(
  BADGE_TEXT_SECTION_DEFINITIONS.map((definition) => [definition.type, definition])
);

export function isBadgeTextSectionType(value: string): value is BadgeTextSectionType {
  return sectionDefinitionMap.has(value as BadgeTextSectionType);
}

export function getBadgeTextSectionDefinition(type: string) {
  return sectionDefinitionMap.get(type as BadgeTextSectionType) ?? null;
}

export function getBadgeTextHeading(sectionType: string, customHeading?: string | null) {
  if (sectionType === "custom") {
    return customHeading?.trim() ?? "";
  }

  return getBadgeTextSectionDefinition(sectionType)?.heading ?? sectionType;
}

export function getBadgeTextSectionLabel(sectionType: string) {
  if (sectionType === "custom") {
    return "Benutzerdefiniert";
  }

  return getBadgeTextSectionDefinition(sectionType)?.label ?? sectionType;
}

export function getDefaultBadgeTextSortOrder(sectionType: string) {
  return getBadgeTextSectionDefinition(sectionType)?.sortOrder ?? 999;
}

export function toBadgeTextResponseRecord(record: BadgeTextRecord) {
  return {
    id: record.id,
    name: record.name,
    textType: record.sectionType,
    sectionType: record.sectionType,
    sectionLabel: getBadgeTextSectionLabel(record.sectionType),
    heading: getBadgeTextHeading(record.sectionType, record.customHeading),
    customHeading: record.customHeading,
    content: record.content,
    isActive: record.isActive,
    sortOrder: record.sortOrder
  };
}
