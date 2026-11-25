import { getLineageGraph } from '../domain/lineageGraph';
import type {
  PersonEventType,
  PersonLifeEvent,
  PersonRecord,
  RelationKind,
} from '../types';
import {
  getPersonAliases,
  normalizeAliasItems,
  syncAliasesFromItems,
} from './personAliases';

export {
  getBirthComparableRange,
  getComparableDateRange,
  toSortableDateNumber,
  type ComparableDateRange,
} from './dateRange';
export {
  getSpouseSortScore,
  sortChildrenChronologically,
} from './personSort';
export {
  ALIAS_TYPE_OPTIONS,
  formatAliasItemDisplayName,
  formatAliasItemRomanized,
  formatAliasItemToSummaryString,
  formatPersonAliases,
  getPersonAliases,
  getPersonAliasItems,
  normalizeAliasItems,
  parseAliasInput,
  parseLegacyAliasString,
  syncAliasesFromItems,
} from './personAliases';
export {
  buildBiographyPreviewData,
  type LiveBiographySummary,
} from './personBiography';

export const RELATION_TYPE_OPTIONS: RelationKind[] = [
  '生子',
  '抚子',
  '养子',
  '继子',
  '赘子',
  '义子',
  '出继',
  '出嗣',
  '承嗣',
  '出祧',
  '兼祧',
  '出绍',
  '过继',
  '承继',
  '奉祀',
  '无(断代)',
];

export const FEMALE_RELATION_TYPE_OPTIONS: RelationKind[] = [
  '生女',
  '继女',
  '养女',
];

export const SPOUSE_TYPE_OPTIONS = ['妻子', '丈夫', '配偶'] as const;

export const SPOUSE_RANK_OPTIONS = ['原配', '继配', '三配', '四配'] as const;

export const SPOUSE_RANK_ORDER: Record<string, number> = {
  原配: 1,
  元配: 1,
  正室: 1,
  继配: 2,
  次配: 2,
  再配: 2,
  三配: 3,
  四配: 4,
  五配: 5,
  六配: 6,
};

export interface LineageGraphIndex {
  personById: Map<string, PersonRecord>;
  childrenByFatherId: Map<string, PersonRecord[]>;
  spousesByPartnerId: Map<string, PersonRecord[]>;
}

/**
 * Return the WeakMap-cached O(N) adjacency index over PersonRecord[] for fast lookups
 * across tables, grids, stats, book compilation, and canvas layout.
 */
export function buildLineageGraphIndex(
  persons: PersonRecord[]
): LineageGraphIndex {
  return getLineageGraph(persons);
}

/**
 * Derive children from the cached LineageGraph index using fatherId or motherId,
 * sorted chronologically by birth date when available (with siblingOrder fallback).
 */
export function getDerivedChildren(
  allPersons: PersonRecord[],
  parentId: string
): PersonRecord[] {
  const list = getLineageGraph(allPersons).childrenByAnyParentId.get(parentId);
  return list ? [...list] : [];
}

/**
 * Derive ordered spouse nodes for a partner, sorted by siblingOrder / biographyOrder.
 */
export function getDerivedSpouses(
  allPersons: PersonRecord[],
  partnerId: string
): PersonRecord[] {
  const list = getLineageGraph(allPersons).spousesByPartnerId.get(partnerId);
  return list ? [...list] : [];
}

/**
 * Compute 1-based sequence order for a spouse node among all spouses of the same partner.
 */
export function computeSpouseOrderIndex(
  person: PersonRecord,
  allPersons: PersonRecord[]
): number {
  if (!person.spouseOfId) return person.siblingOrder || 1;
  const spouses =
    getLineageGraph(allPersons).spousesByPartnerId.get(person.spouseOfId) || [];
  const idx = spouses.findIndex((s) => s.id === person.id);
  return idx >= 0 ? idx + 1 : person.siblingOrder || 1;
}

/**
 * Collect self + all descendants via O(subtree) BFS on the cached LineageGraph
 * to prevent circular parent assignments.
 */
export function getDescendantExclusionSet(
  allPersons: PersonRecord[],
  personId: string
): Set<string> {
  const graph = getLineageGraph(allPersons);
  const excluded = new Set<string>([personId]);
  const queue: string[] = [personId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = graph.childrenByAnyParentId.get(currentId) || [];
    for (const child of children) {
      if (!excluded.has(child.id)) {
        excluded.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return excluded;
}

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function toChineseNumber(num: number): string {
  if (num <= 0) return String(num);
  if (num < 10) return CHINESE_DIGITS[num];
  if (num === 10) return '十';
  if (num < 20) return `十${CHINESE_DIGITS[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${CHINESE_DIGITS[tens]}十${ones > 0 ? CHINESE_DIGITS[ones] : ''}`;
  }
  return String(num);
}

export function toChineseOrderPrefix(orderNum: number): string {
  if (orderNum === 1) return '长';
  if (orderNum === 2) return '次';
  return toChineseNumber(orderNum);
}

export function formatSpouseSequenceLabel(orderNum: number): string {
  if (orderNum === 1) return '原配';
  if (orderNum === 2) return '继配';
  return `${toChineseNumber(orderNum)}配`;
}

export function getDefaultRelationType(
  person: Pick<PersonRecord, 'gender' | 'spouseOfId'>,
  partnerGender?: 'male' | 'female' | 'unknown'
): RelationKind {
  if (person.spouseOfId) {
    if (person.gender === 'male') return '丈夫';
    if (person.gender === 'female') return '妻子';
    if (partnerGender === 'male') return '妻子';
    if (partnerGender === 'female') return '丈夫';
    return '配偶';
  }
  return person.gender === 'female' ? '生女' : '生子';
}

export function getExtraRelationBadge(
  person: Pick<PersonRecord, 'gender' | 'spouseOfId' | 'relationType'>,
  partnerGender?: 'male' | 'female' | 'unknown'
): string | undefined {
  const rel = person.relationType?.trim();
  if (!rel) return undefined;
  const defaultRel = getDefaultRelationType(person, partnerGender);
  if (rel === defaultRel) return undefined;
  if (person.spouseOfId && (rel === '妻子' || rel === '丈夫' || rel === '配偶')) {
    return undefined;
  }
  return rel;
}

/**
 * Compute automatic rank label from topology & birth dates:
 * - Spouses: omitted (returns '')
 * - Root: 始祖 / 首节点
 * - Children (sorted by birth date with siblingOrder fallback, split by gender):
 *   - 1 male -> 之男; 2+ males -> 长子 / 次子 / 三子...
 *   - 1 female -> 之女; 2+ females -> 长女 / 次女 / 三女...
 */
export function computeAutoRankLabel(
  person: PersonRecord,
  allPersons: PersonRecord[]
): string {
  if (person.spouseOfId) {
    return '';
  }
  const primaryParentId = person.fatherId || person.motherId;
  if (!primaryParentId) {
    return person.generation === 1 ? '始祖' : '首节点';
  }
  if (person.gender === 'unknown') {
    return '';
  }
  const allChildren =
    getLineageGraph(allPersons).childrenByAnyParentId.get(primaryParentId) || [];
  const isFemale = person.gender === 'female';
  const sameGenderGroup = allChildren.filter((c) => c.gender === person.gender);

  if (sameGenderGroup.length <= 1) {
    return isFemale ? '之女' : '之男';
  }

  const idx = sameGenderGroup.findIndex((s) => s.id === person.id);
  const orderNum = idx >= 0 ? idx + 1 : 1;
  return `${toChineseOrderPrefix(orderNum)}${isFemale ? '女' : '子'}`;
}

export function computeRankDisplay(
  person: PersonRecord,
  allPersons: PersonRecord[]
): string {
  return computeAutoRankLabel(person, allPersons);
}

const VALID_EVENT_TYPES: ReadonlySet<PersonEventType> = new Set([
  'birth',
  'education',
  'career',
  'marriage',
  'residence',
  'death',
  'other',
]);

export function normalizeEventType(rawType: unknown): PersonEventType {
  if (rawType === 'burial') return 'death';
  if (rawType === 'honor') return 'career';
  if (
    typeof rawType === 'string' &&
    VALID_EVENT_TYPES.has(rawType as PersonEventType)
  ) {
    return rawType as PersonEventType;
  }
  return 'other';
}

export function getPersonPrimaryTitle(
  person: Pick<PersonRecord, 'events'> | null | undefined
): string {
  const firstCareer = person?.events?.find((ev) => ev.type === 'career');
  return firstCareer?.description?.trim() || '';
}

/**
 * Hydrate draft form data cleanly from canonical PersonRecord.
 */
export function hydratePersonDraft(
  person: PersonRecord,
  clanSurname: string = ''
): PersonRecord {
  const resolvedAliases = getPersonAliases(person);
  const resolvedAliasItems = normalizeAliasItems(person.aliasItems);
  const hydratedEvents: PersonLifeEvent[] = (person.events || []).map(
    (ev, idx) => ({
      id: ev.id || `ev-${idx + 1}`,
      type: normalizeEventType(ev.type),
      structuredDate: ev.structuredDate ?? undefined,
      structuredPlace: ev.structuredPlace ?? undefined,
      description: ev.description ?? '',
    })
  );

  return {
    ...person,
    surname: person.spouseOfId
      ? (person.surname ?? '')
      : (person.surname ?? clanSurname),
    aliases: resolvedAliases,
    ...(person.aliasItems !== undefined
      ? { aliasItems: resolvedAliasItems }
      : {}),
    nameSuffix: person.nameSuffix ?? '',
    romanizedName: {
      surname: person.romanizedName?.surname ?? '',
      name: person.romanizedName?.name ?? '',
      suffix: person.romanizedName?.suffix ?? '',
    },
    relationType:
      person.relationType ??
      (person.spouseOfId
        ? person.gender === 'male'
          ? '丈夫'
          : '妻子'
        : person.gender === 'female'
          ? '生女'
          : '生子'),
    birth: {
      structuredDate: person.birth?.structuredDate ?? undefined,
      structuredPlace: person.birth?.structuredPlace ?? undefined,
      summary: person.birth?.summary ?? '',
    },
    death: {
      structuredDate: person.death?.structuredDate ?? undefined,
      structuredPlace: person.death?.structuredPlace ?? undefined,
      structuredBurialDate: person.death?.structuredBurialDate ?? undefined,
      structuredBurialPlace: person.death?.structuredBurialPlace ?? undefined,
      cause: person.death?.cause ?? '',
      summary: person.death?.summary ?? '',
      manualAge: person.death?.manualAge,
    },
    events: hydratedEvents,
    sequenceMeta: {
      mainLabel: person.sequenceMeta?.mainLabel ?? '',
      mainNumber: person.sequenceMeta?.mainNumber,
      subLabel: person.sequenceMeta?.subLabel ?? '',
      subNumber: person.sequenceMeta?.subNumber,
      originalPage: person.sequenceMeta?.originalPage,
    },
    privateInfo: {
      idCardNum: person.privateInfo?.idCardNum ?? '',
      mobile: person.privateInfo?.mobile ?? '',
      address: person.privateInfo?.address ?? '',
    },
  };
}

/**
 * Normalize draft before committing to the lineage store using canonical SSOT fields only.
 */
export function normalizePersonForSave(
  draft: PersonRecord,
  allPersons: PersonRecord[]
): PersonRecord {
  const { personById } = getLineageGraph(allPersons);
  const primaryParent = draft.fatherId
    ? personById.get(draft.fatherId) ?? null
    : draft.motherId
      ? personById.get(draft.motherId) ?? null
      : null;

  const hasStructuredAliasItems = draft.aliasItems !== undefined;
  const cleanedAliasItems = hasStructuredAliasItems
    ? normalizeAliasItems(draft.aliasItems)
    : undefined;
  const cleanedAliases = hasStructuredAliasItems
    ? syncAliasesFromItems(cleanedAliasItems || [])
    : getPersonAliases(draft);

  const cleanedEvents: PersonLifeEvent[] = (draft.events || [])
    .map((ev, idx) => {
      const desc = ev.description?.trim() || undefined;
      return {
        id: ev.id || `ev-${idx + 1}`,
        type: normalizeEventType(ev.type),
        ...(ev.structuredDate ? { structuredDate: ev.structuredDate } : {}),
        ...(ev.structuredPlace ? { structuredPlace: ev.structuredPlace } : {}),
        ...(desc ? { description: desc } : {}),
      };
    })
    .filter((ev) =>
      Boolean(ev.structuredDate || ev.structuredPlace || ev.description)
    );

  const romSurname = draft.romanizedName?.surname?.trim() || undefined;
  const romName = draft.romanizedName?.name?.trim() || undefined;
  const romSuffix = draft.romanizedName?.suffix?.trim() || undefined;
  const romanizedName =
    romSurname || romName || romSuffix
      ? {
          ...(romSurname ? { surname: romSurname } : {}),
          ...(romName ? { name: romName } : {}),
          ...(romSuffix ? { suffix: romSuffix } : {}),
        }
      : undefined;

  const birthObj =
    draft.birth?.structuredDate ||
    draft.birth?.structuredPlace ||
    draft.birth?.summary?.trim()
      ? {
          structuredDate: draft.birth.structuredDate ?? undefined,
          structuredPlace: draft.birth.structuredPlace ?? undefined,
          summary: draft.birth.summary?.trim() || undefined,
        }
      : undefined;

  const manualAge =
    typeof draft.death?.manualAge === 'number' &&
    Number.isFinite(draft.death.manualAge) &&
    draft.death.manualAge >= 0
      ? Math.round(draft.death.manualAge)
      : undefined;

  const deathObj =
    draft.death?.structuredDate ||
    draft.death?.structuredPlace ||
    draft.death?.structuredBurialDate ||
    draft.death?.structuredBurialPlace ||
    draft.death?.cause?.trim() ||
    draft.death?.summary?.trim() ||
    manualAge !== undefined
      ? {
          structuredDate: draft.death?.structuredDate ?? undefined,
          structuredPlace: draft.death?.structuredPlace ?? undefined,
          structuredBurialDate: draft.death?.structuredBurialDate ?? undefined,
          structuredBurialPlace: draft.death?.structuredBurialPlace ?? undefined,
          cause: draft.death?.cause?.trim() || undefined,
          summary: draft.death?.summary?.trim() || undefined,
          manualAge,
        }
      : undefined;

  const seqObj =
    draft.sequenceMeta?.mainLabel?.trim() ||
    draft.sequenceMeta?.mainNumber !== undefined ||
    draft.sequenceMeta?.subLabel?.trim() ||
    draft.sequenceMeta?.subNumber !== undefined ||
    draft.sequenceMeta?.originalPage !== undefined
      ? {
          mainLabel: draft.sequenceMeta?.mainLabel?.trim() || undefined,
          mainNumber: draft.sequenceMeta?.mainNumber,
          subLabel: draft.sequenceMeta?.subLabel?.trim() || undefined,
          subNumber: draft.sequenceMeta?.subNumber,
          originalPage: draft.sequenceMeta?.originalPage,
        }
      : undefined;

  const privObj =
    draft.privateInfo?.idCardNum?.trim() ||
    draft.privateInfo?.mobile?.trim() ||
    draft.privateInfo?.address?.trim()
      ? {
          idCardNum: draft.privateInfo?.idCardNum?.trim() || undefined,
          mobile: draft.privateInfo?.mobile?.trim() || undefined,
          address: draft.privateInfo?.address?.trim() || undefined,
        }
      : undefined;

  return {
    id: draft.id,
    branchId: draft.branchId,
    avatarUrl: draft.avatarUrl,
    surname: draft.surname?.trim() || undefined,
    name: draft.name.trim() || '未命名',
    nameSuffix: draft.nameSuffix?.trim() || undefined,
    romanizedName,
    legalName: draft.legalName?.trim() || undefined,
    aliases: cleanedAliases.length > 0 ? cleanedAliases : undefined,
    ...(cleanedAliasItems && cleanedAliasItems.length > 0
      ? { aliasItems: cleanedAliasItems }
      : {}),
    childhoodName: draft.childhoodName?.trim() || undefined,
    gender: draft.gender,
    status: draft.status,
    generation: draft.spouseOfId
      ? draft.generation
      : primaryParent
        ? primaryParent.generation + 1
        : draft.generation || 1,
    generationWord: draft.generationWord?.trim() || undefined,
    hangOrder: draft.hangOrder?.trim() || undefined,
    siblingOrder: draft.siblingOrder,
    fatherId: draft.fatherId ?? null,
    motherId: draft.motherId?.trim() || undefined,
    spouseOfId: draft.spouseOfId,
    relationType:
      draft.relationType !== undefined ? draft.relationType : undefined,
    fatherRelationType: draft.fatherRelationType,
    motherRelationType: draft.motherRelationType,
    relationTitle: draft.relationTitle?.trim() || undefined,
    relationPrefix: draft.relationPrefix?.trim() || undefined,
    relationNotes: draft.relationNotes?.trim() || undefined,
    lineageRemarks: draft.lineageRemarks?.trim() || undefined,
    branchLabel: draft.branchLabel?.trim() || undefined,
    headingLine: draft.headingLine?.trim() || undefined,
    birth: birthObj,
    death: deathObj,
    events: cleanedEvents.length > 0 ? cleanedEvents : undefined,
    sequenceMeta: seqObj,
    privateInfo: privObj,
    biography: draft.biography?.trim() || undefined,
    biographyOrder: draft.biographyOrder,
    notes: draft.notes?.trim() || undefined,
  };
}
