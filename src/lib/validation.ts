import { z } from 'zod';
import { isValidDateKey, isValidTime } from './datetime';

export const dateKey = z.string().refine(isValidDateKey, 'Ugyldig dato');
export const timeOfDay = z.string().refine(isValidTime, 'Ugyldig klokkeslett (TT:MM)');

export const bookingInputSchema = z
  .object({
    guestName: z.string().trim().min(2, 'Navn må ha minst 2 tegn').max(120),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[+\d\s()-]*$/, 'Telefonnummer kan bare inneholde tall, mellomrom og + ( ) -')
      .optional()
      .or(z.literal('')),
    // Validated only when something was typed, so the field can be left blank.
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(180)
      .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.?[^@\s]*$/.test(v), 'Ugyldig e-postadresse')
      .optional()
      .or(z.literal('')),
    address: z.string().trim().max(300).optional().or(z.literal('')),
    checkInDate: dateKey,
    checkInTime: timeOfDay,
    checkOutDate: dateKey,
    checkOutTime: timeOfDay,
    guests: z.coerce.number().int().min(1).max(60).optional().nullable(),
    status: z.enum(['TENTATIVE', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).default('TENTATIVE'),
    presetId: z.string().trim().optional().nullable(),
    priceOre: z.coerce.number().int().min(0).max(100_000_000),
    priceOverridden: z.boolean().default(false),
    overrideReason: z.string().trim().max(300).optional().or(z.literal('')),
    depositOre: z.coerce.number().int().min(0).max(100_000_000).default(0),
    depositPaid: z.boolean().default(false),
    depositReturned: z.boolean().default(false),
    depositWithheldOre: z.coerce.number().int().min(0).default(0),
    depositNote: z.string().trim().max(500).optional().or(z.literal('')),
    powerFromDeposit: z.boolean().default(true),
    rentPaid: z.boolean().default(false),
    notes: z.string().trim().max(4000).optional().or(z.literal('')),
  })
  .refine((v) => `${v.checkOutDate}T${v.checkOutTime}` > `${v.checkInDate}T${v.checkInTime}`, {
    message: 'Utsjekk må være etter innsjekk',
    path: ['checkOutDate'],
  })
  .refine((v) => !(v.depositReturned && !v.depositPaid), {
    message: 'Depositum kan ikke være tilbakebetalt uten å være innbetalt',
    path: ['depositReturned'],
  })
  .refine((v) => v.depositWithheldOre <= v.depositOre, {
    message: 'Kan ikke holde tilbake mer enn depositumet',
    path: ['depositWithheldOre'],
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;

export const presetInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(400).optional().or(z.literal('')),
    season: z.enum(['ANY', 'SUMMER', 'EASTER', 'CHRISTMAS', 'OFFSEASON']).default('ANY'),
    pricingMode: z.enum(['FIXED', 'PER_NIGHT']).default('FIXED'),
    priceOre: z.coerce.number().int().min(0).max(100_000_000),
    depositOre: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
    minNights: z.coerce.number().int().min(1).max(365).optional().nullable(),
    maxNights: z.coerce.number().int().min(1).max(365).optional().nullable(),
    startWeekday: z.coerce.number().int().min(1).max(7).optional().nullable(),
    checkInTime: timeOfDay.optional().nullable(),
    checkOutTime: timeOfDay.optional().nullable(),
    priority: z.coerce.number().int().min(-100).max(100).default(0),
    active: z.boolean().default(true),
    sortOrder: z.coerce.number().int().default(0),
  })
  .refine((v) => v.minNights == null || v.maxNights == null || v.minNights <= v.maxNights, {
    message: 'Minimum netter kan ikke være større enn maksimum',
    path: ['maxNights'],
  });

export type PresetInput = z.infer<typeof presetInputSchema>;

export const userInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'OPERATOR']).default('OPERATOR'),
  // Length and complexity are enforced by passwordProblem() so the rule lives
  // in exactly one place.
  password: z.string().min(1, 'Passord er påkrevd').max(200),
  active: z.boolean().default(true),
});
