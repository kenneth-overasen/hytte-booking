import 'server-only';
import { prisma } from './db';
import { hashPassword } from './crypto';
import { passwordProblem } from './password';
import { DEFAULT_CONTRACT_TEMPLATE } from './contract';
import { DEFAULT_TEMPLATES } from './notifications';
import { NOTIFICATION_EVENTS } from './settings';

/**
 * First-run setup: the pre-configured administrator, a starter set of price
 * presets and sensible defaults. Idempotent, and runs at most once per process.
 */
let ran: Promise<void> | null = null;

export function ensureBootstrap(): Promise<void> {
  ran ??= run().catch((err) => {
    // Let a later request retry rather than wedging the process.
    ran = null;
    throw err;
  });
  return ran;
}

async function run(): Promise<void> {
  const userCount = await prisma.user.count();

  if (userCount === 0) {
    const email = (process.env.ADMIN_EMAIL ?? 'admin@hytte.local').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    const problem = !password
      ? 'ADMIN_PASSWORD er ikke satt.'
      : passwordProblem(password);
    if (problem) {
      throw new Error(
        `Administratorkontoen kan ikke opprettes: ${problem} Rett ADMIN_PASSWORD i .env og start appen på nytt.`,
      );
    }
    await prisma.user.create({
      data: {
        email,
        name: process.env.ADMIN_NAME?.trim() || 'Administrator',
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
        mustChangePassword: true,
      },
    });
    console.log(`[hytte-booking] Administratorkonto opprettet: ${email}`);
  }

  if ((await prisma.preset.count()) === 0) {
    await prisma.preset.createMany({ data: STARTER_PRESETS });
    console.log('[hytte-booking] La inn standard prisregler.');
  }

  await seedSetting('contract', { title: 'Leieavtale for fritidsbolig', template: DEFAULT_CONTRACT_TEMPLATE, footer: '', includePowerClause: true });
  await seedSetting('notifications', {
    events: Object.fromEntries(
      NOTIFICATION_EVENTS.map((e) => [
        e,
        {
          enabled: false,
          toGuest: e === 'contract.sent' || e === 'checkin.reminder' || e === 'checkout.reminder' || e === 'deposit.paid',
          toOperator: true,
          extraRecipients: '',
          leadDays: e === 'checkin.reminder' ? 3 : 1,
          subject: DEFAULT_TEMPLATES[e].subject,
          body: DEFAULT_TEMPLATES[e].body,
        },
      ]),
    ),
  });
}

async function seedSetting(key: string, value: unknown) {
  const existing = await prisma.setting.findUnique({ where: { key } });
  if (existing) return;
  await prisma.setting.create({ data: { key, value: value as never } });
}

/** Starter price rules matching the common Norwegian cabin-letting patterns. */
const STARTER_PRESETS = [
  {
    name: 'Helg',
    description: 'Fredag til søndag utenom høysesong.',
    season: 'ANY' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 350000,
    depositOre: 300000,
    minNights: 2,
    maxNights: 3,
    startWeekday: 5,
    checkInTime: '16:00',
    checkOutTime: '15:00',
    priority: 10,
    sortOrder: 1,
  },
  {
    name: 'Uke',
    description: 'Sju netter, lørdag til lørdag.',
    season: 'ANY' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 900000,
    depositOre: 300000,
    minNights: 7,
    maxNights: 7,
    startWeekday: 6,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    priority: 10,
    sortOrder: 2,
  },
  {
    name: 'Sommeruke',
    description: 'Uke i den manuelt definerte sommerperioden.',
    season: 'SUMMER' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 1400000,
    depositOre: 400000,
    minNights: 7,
    maxNights: 7,
    startWeekday: 6,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    priority: 30,
    sortOrder: 3,
  },
  {
    name: 'Påskeuke',
    description: 'Hele påsken, fra lørdag før palmesøndag.',
    season: 'EASTER' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 1600000,
    depositOre: 500000,
    minNights: 6,
    maxNights: 10,
    startWeekday: null,
    checkInTime: '15:00',
    checkOutTime: '14:00',
    priority: 40,
    sortOrder: 4,
  },
  {
    name: 'Påske – halv uke',
    description: 'Kortere påskeopphold, for eksempel skjærtorsdag til 2. påskedag.',
    season: 'EASTER' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 950000,
    depositOre: 400000,
    minNights: 3,
    maxNights: 5,
    startWeekday: null,
    checkInTime: '15:00',
    checkOutTime: '14:00',
    priority: 35,
    sortOrder: 5,
  },
  {
    name: 'Jul og nyttår',
    description: 'Opphold i jule- og nyttårsperioden.',
    season: 'CHRISTMAS' as const,
    pricingMode: 'FIXED' as const,
    priceOre: 1500000,
    depositOre: 500000,
    minNights: 4,
    maxNights: 14,
    startWeekday: null,
    checkInTime: '15:00',
    checkOutTime: '14:00',
    priority: 40,
    sortOrder: 6,
  },
  {
    name: 'Døgnpris',
    description: 'Fallback for opphold som ikke passer noen annen regel.',
    season: 'ANY' as const,
    pricingMode: 'PER_NIGHT' as const,
    priceOre: 140000,
    depositOre: 300000,
    minNights: 1,
    maxNights: null,
    startWeekday: null,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    priority: -10,
    sortOrder: 99,
  },
];
