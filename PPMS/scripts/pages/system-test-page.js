import { bootstrapPage, loadRuntimeScripts } from '../core/app-bootstrap.js';
import { CDN_SCRIPTS } from '../core/config.js';
import { renderSystemTestLayout } from '../templates/system-test-layout.js';

async function initPage() {
    bootstrapPage({
        rootId: 'pageRoot',
        template: renderSystemTestLayout,
    });

    await loadRuntimeScripts([
        CDN_SCRIPTS.supabase,
        { src: 'scripts/system-test.js' },
    ]);
}

initPage().catch(error => {
    console.error(error);
    document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:Inter,sans-serif">
        <div style="max-width:560px;text-align:center">
            <h1 style="margin:0 0 12px">System test page failed to load</h1>
            <p style="margin:0;color:#94a3b8">${error.message}</p>
        </div>
    </main>`;
});
