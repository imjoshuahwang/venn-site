import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dir = new URL('../../supabase/templates/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

for (const f of ['invite.html', 'recovery.html', 'magic-link.html', 'status-update.html', 'status-update.preview.html']) {
  test(`${f}: Venn look, one pill, joinvenn.org/portal link, no portal host`, () => {
    const h = read(f);
    assert.equal((h.match(/border-radius:999px/g) ?? []).length, 1);
    assert.equal((h.match(/<a /g) ?? []).length, 1);
    assert.match(h, /href="https:\/\/joinvenn\.org\/portal\/auth\/callback\?token_hash=/);
    assert.doesNotMatch(h, /portal\.joinvenn\.org/);
    assert.match(h, /letter-spacing:-0\.03em/);
    assert.match(h, /background:#111;color:#fff/);
  });
}

test('Peer card never renders contact, phone or coming soon in any state', () => {
  const s = readFileSync(new URL('../../src/components/portal/results/Peer.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(s, /phone|whatsapp|coming soon|data-email|data-name|mailto:|view\.contact|\.contact\b/i);
});
