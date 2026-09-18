import { handle, requireApiAdmin } from '@/lib/http';
import { audit } from '@/lib/audit';
import { backupFilename, exportBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    const admin = await requireApiAdmin();
    const url = new URL(request.url);

    const backup = await exportBackup({
      includeUsers: url.searchParams.get('brukere') !== '0',
      includeSettings: url.searchParams.get('innstillinger') !== '0',
      includeLogs: url.searchParams.get('logger') === '1',
    });

    await audit(admin, 'backup.export', 'System', null, backup.counts);
    const body = JSON.stringify(backup, null, 2);

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${backupFilename()}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
