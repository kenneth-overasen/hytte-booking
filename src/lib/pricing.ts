import type { Preset, Season } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';
import { classifyStay, holidaysInStay, type Holiday, type SeasonConfig, type SeasonName } from './holidays';
import { nightsBetween, osloWeekday, WEEKDAY_NAMES_NB } from './datetime';

export type PresetCandidate = {
  preset: Preset;
  eligible: boolean;
  /** Higher = more specific. Used to break ties between eligible presets. */
  specificity: number;
  priceOre: number;
  reasons: string[];
};

export type Quote = {
  nights: number;
  season: SeasonName;
  seasonExplanation: string;
  holidays: Holiday[];
  preset: Preset | null;
  candidates: PresetCandidate[];
  priceOre: number;
  depositOre: number;
  checkInTime: string;
  checkOutTime: string;
  source: 'preset' | 'fallback';
  breakdown: string;
};

function presetPrice(preset: Preset, nights: number): number {
  return preset.pricingMode === 'PER_NIGHT' ? preset.priceOre * Math.max(1, nights) : preset.priceOre;
}

function evaluate(preset: Preset, ctx: { nights: number; season: SeasonName; startWeekday: number }): PresetCandidate {
  const reasons: string[] = [];
  let eligible = true;
  let specificity = 0;

  if (preset.season !== 'ANY') {
    if (preset.season !== ctx.season) {
      eligible = false;
      reasons.push(`Krever sesong ${seasonLabel(preset.season)}, oppholdet er ${seasonLabel(ctx.season)}`);
    } else {
      specificity += 4;
      reasons.push(`Sesong ${seasonLabel(ctx.season)} stemmer`);
    }
  }

  if (preset.minNights != null) {
    if (ctx.nights < preset.minNights) {
      eligible = false;
      reasons.push(`Krever minst ${preset.minNights} netter (oppholdet er ${ctx.nights})`);
    } else {
      specificity += 1;
    }
  }
  if (preset.maxNights != null) {
    if (ctx.nights > preset.maxNights) {
      eligible = false;
      reasons.push(`Krever høyst ${preset.maxNights} netter (oppholdet er ${ctx.nights})`);
    } else {
      specificity += 1;
    }
  }
  if (preset.minNights != null && preset.maxNights != null && preset.minNights === preset.maxNights) {
    specificity += 1;
  }

  if (preset.startWeekday != null) {
    if (preset.startWeekday !== ctx.startWeekday) {
      eligible = false;
      reasons.push(
        `Må starte på ${WEEKDAY_NAMES_NB[preset.startWeekday - 1]?.toLowerCase()} (oppholdet starter ${WEEKDAY_NAMES_NB[ctx.startWeekday - 1]?.toLowerCase()})`,
      );
    } else {
      specificity += 2;
      reasons.push(`Starter på ${WEEKDAY_NAMES_NB[ctx.startWeekday - 1]?.toLowerCase()}`);
    }
  }

  if (eligible && reasons.length === 0) reasons.push('Passer alle opphold');

  return { preset, eligible, specificity, priceOre: presetPrice(preset, ctx.nights), reasons };
}

export function seasonLabel(s: Season | SeasonName): string {
  switch (s) {
    case 'SUMMER':
      return 'sommer';
    case 'EASTER':
      return 'påske';
    case 'CHRISTMAS':
      return 'jul/nyttår';
    case 'OFFSEASON':
      return 'lavsesong';
    default:
      return 'alle sesonger';
  }
}

/**
 * Work out the suggested price for a stay. Returns every preset that was
 * considered — the UI shows why one won so the operator can override knowingly.
 */
export async function quote(
  checkIn: Date,
  checkOut: Date,
  opts: { forcePresetId?: string | null; presets?: Preset[]; seasonConfig?: SeasonConfig } = {},
): Promise<Quote> {
  const [defaults, seasonCfg] = await Promise.all([
    getSettings('bookingDefaults'),
    opts.seasonConfig ? Promise.resolve(opts.seasonConfig) : getSettings('season'),
  ]);
  const presets =
    opts.presets ?? (await prisma.preset.findMany({ orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }] }));

  const nights = Math.max(0, nightsBetween(checkIn, checkOut));
  const breakdownSeason = classifyStay(checkIn, checkOut, seasonCfg);
  const startWeekday = osloWeekday(checkIn);

  const candidates = presets
    .filter((p) => p.active || p.id === opts.forcePresetId)
    .map((p) => evaluate(p, { nights, season: breakdownSeason.season, startWeekday }))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.preset.priority !== b.preset.priority) return b.preset.priority - a.preset.priority;
      if (a.specificity !== b.specificity) return b.specificity - a.specificity;
      return a.preset.sortOrder - b.preset.sortOrder;
    });

  const forced = opts.forcePresetId ? candidates.find((c) => c.preset.id === opts.forcePresetId) : undefined;
  const chosen = forced ?? candidates.find((c) => c.eligible);

  const priceOre = chosen ? chosen.priceOre : defaults.defaultNightlyOre * Math.max(1, nights);
  const depositOre = chosen?.preset.depositOre ?? defaults.defaultDepositOre;
  const checkInTime = chosen?.preset.checkInTime ?? defaults.checkInTime;
  const checkOutTime = chosen?.preset.checkOutTime ?? defaults.checkOutTime;

  let breakdown: string;
  if (chosen) {
    breakdown =
      chosen.preset.pricingMode === 'PER_NIGHT'
        ? `${chosen.preset.name}: ${nights} netter × døgnpris`
        : `${chosen.preset.name}: fastpris for oppholdet`;
    if (forced && !forced.eligible) breakdown += ' (valgt manuelt — passer ikke automatisk)';
  } else {
    breakdown = `Ingen prisregel passet — standard døgnpris × ${nights} netter`;
  }

  return {
    nights,
    season: breakdownSeason.season,
    seasonExplanation: breakdownSeason.explanation,
    holidays: holidaysInStay(checkIn, checkOut),
    preset: chosen?.preset ?? null,
    candidates,
    priceOre,
    depositOre,
    checkInTime,
    checkOutTime,
    source: chosen ? 'preset' : 'fallback',
    breakdown,
  };
}
