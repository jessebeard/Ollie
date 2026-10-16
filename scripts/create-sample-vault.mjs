import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PasswordVault } from '../src/structures/vault/immutable-vault.js';
import { encodeBase32 } from '../src/utils/base32.js';

const SERVICES = [
    { title: "GitHub Enterprise", url: "https://github.com", tags: ["dev", "vcs", "critical"] },
    { title: "AWS Root Account", url: "https://console.aws.amazon.com", tags: ["cloud", "infra", "critical"] },
    { title: "Google Cloud Platform", url: "https://console.cloud.google.com", tags: ["cloud", "prod", "infra"] },
    { title: "Stripe Production Dashboard", url: "https://dashboard.stripe.com", tags: ["finance", "billing", "critical"] },
    { title: "OpenAI Platform API", url: "https://platform.openai.com", tags: ["ai", "dev", "api"] },
    { title: "Cloudflare Edge Admin", url: "https://dash.cloudflare.com", tags: ["infra", "dns", "security"] },
    { title: "Slack Enterprise Grid", url: "https://slack.com", tags: ["comms", "corp"] },
    { title: "Discord Developer Portal", url: "https://discord.com/developers", tags: ["dev", "bots"] },
    { title: "ProtonMail Secure", url: "https://mail.proton.me", tags: ["email", "security", "personal"] },
    { title: "Apple Developer ID", url: "https://developer.apple.com", tags: ["dev", "mobile", "apple"] },
    { title: "Microsoft 365 Admin", url: "https://admin.microsoft.com", tags: ["corp", "email", "infra"] },
    { title: "Hetzner Cloud Console", url: "https://console.hetzner.cloud", tags: ["infra", "hosting", "servers"] },
    { title: "DigitalOcean Team", url: "https://cloud.digitalocean.com", tags: ["infra", "vps"] },
    { title: "Vercel Enterprise", url: "https://vercel.com", tags: ["dev", "frontend", "prod"] },
    { title: "Supabase DB Cluster", url: "https://supabase.com", tags: ["dev", "database", "postgres"] },
    { title: "Datadog Observability", url: "https://app.datadoghq.com", tags: ["monitoring", "infra"] },
    { title: "Sentry Error Tracking", url: "https://sentry.io", tags: ["monitoring", "dev"] },
    { title: "Fastly CDN Delivery", url: "https://manage.fastly.com", tags: ["infra", "cdn", "networking"] },
    { title: "GitLab Self-Hosted", url: "https://gitlab.internal.net", tags: ["dev", "vcs", "ci"] },
    { title: "Atlassian Jira & Confluence", url: "https://id.atlassian.com", tags: ["corp", "pm"] },
    { title: "Docker Hub Registry", url: "https://hub.docker.com", tags: ["dev", "containers"] },
    { title: "HashiCorp Cloud HCP", url: "https://portal.cloud.hashicorp.com", tags: ["infra", "vault", "terraform"] },
    { title: "Twilio Communications", url: "https://console.twilio.com", tags: ["api", "sms", "voice"] },
    { title: "SendGrid Email API", url: "https://app.sendgrid.com", tags: ["email", "api"] },
    { title: "Shopify Partner Admin", url: "https://partners.shopify.com", tags: ["ecommerce", "clients"] },
    { title: "PayPal Merchant Gateway", url: "https://paypal.com", tags: ["finance", "payments"] },
    { title: "Square Developer Portal", url: "https://developer.squareup.com", tags: ["finance", "pos"] },
    { title: "Anthropic Claude Console", url: "https://console.anthropic.com", tags: ["ai", "dev", "api"] },
    { title: "Midjourney Studio", url: "https://midjourney.com", tags: ["ai", "graphics"] },
    { title: "Figma Organization", url: "https://figma.com", tags: ["design", "product"] },
    { title: "Notion Workspace Admin", url: "https://notion.so", tags: ["wiki", "knowledge"] },
    { title: "Linear Issue Tracker", url: "https://linear.app", tags: ["pm", "dev"] },
    { title: "Loom Video Sharing", url: "https://loom.com", tags: ["comms", "video"] },
    { title: "Asana Portfolio", url: "https://app.asana.com", tags: ["pm", "operations"] },
    { title: "Zendesk Support Desk", url: "https://zendesk.com", tags: ["support", "corp"] },
    { title: "Salesforce CRM Admin", url: "https://login.salesforce.com", tags: ["crm", "enterprise"] },
    { title: "HubSpot Marketing Hub", url: "https://app.hubspot.com", tags: ["marketing", "sales"] },
    { title: "Dropbox Business Storage", url: "https://dropbox.com", tags: ["storage", "backup"] },
    { title: "Box Enterprise Content", url: "https://account.box.com", tags: ["storage", "compliance"] },
    { title: "Zoom Enterprise Video", url: "https://zoom.us", tags: ["comms", "meetings"] },
    { title: "Mailchimp Campaigns", url: "https://mailchimp.com", tags: ["marketing", "newsletters"] },
    { title: "Reddit Admin Account", url: "https://reddit.com", tags: ["social", "community"] },
    { title: "X / Twitter Developer API", url: "https://developer.x.com", tags: ["social", "api"] },
    { title: "LinkedIn Corporate", url: "https://linkedin.com", tags: ["social", "recruiting"] },
    { title: "Spotify Family & Studio", url: "https://spotify.com", tags: ["media", "audio"] },
    { title: "Netflix Studio Hub", url: "https://netflix.com", tags: ["media", "streaming"] },
    { title: "Steam Gaming Network", url: "https://store.steampowered.com", tags: ["gaming", "personal"] },
    { title: "Ubiquiti UniFi Site Manager", url: "https://unifi.ui.com", tags: ["hardware", "network", "iot"] },
    { title: "1Password Master Team", url: "https://my.1password.com", tags: ["security", "vault", "corp"] },
    { title: "Tailscale Zero-Trust Mesh", url: "https://login.tailscale.com", tags: ["network", "vpn", "security"] }
];

function generateLongNote(index, title) {
    return `### Operational & Security Documentation — ${title} (Entry #${index + 1})

#### 1. Security Invariants & Credentials Policy
- **Account Classification:** Tier-1 Critical Production Infrastructure.
- **Rotation Schedule:** Passwords rotated semi-annually under PBKDF2-HMAC-SHA256 standards (>= 600,000 rounds).
- **MFA Enforcement:** Strict Hardware FIDO2 + TOTP fallback. Never disable authenticator enforcement without CISO approval.
- **Session Lifespan:** Maximum 4 hours idle, hard session invalidation at 12 hours.

#### 2. Emergency Break-Glass & Recovery Protocol
1. In the event of primary credential lockup or MFA loss, retrieve the primary physical YubiKey stored in the fireproof safe (Safe #3, Slot B-12).
2. Use the following encrypted backup tokens for single-use recovery:
   - \`RECOVERY-TOKEN-${index + 1}A-8941-F8B2\`
   - \`RECOVERY-TOKEN-${index + 1}B-4421-C91E\`
   - \`RECOVERY-TOKEN-${index + 1}C-7719-AA40\`
3. Verify TLS certificate fingerprints before authenticating across untrusted networks.

#### 3. Infrastructure Topology & Access Constraints
- **Primary Endpoint:** IP-whitelisted CIDR blocks \`192.168.100.0/24\` and \`10.240.0.0/16\`.
- **API Gateway Rate Limit:** 10,000 requests/minute per authenticated client ID.
- **Audit Logging:** All transactions streamed in real-time to the cold immutable S3 audit bucket with KMS encryption.
- **Incident Response Team Contact:** \`security-oncall@matrix-ops.internal\` / Signal Group \`#infra-emergencies\`.

*Last audited by Compliance Bot v4.2 on ${new Date().toISOString().slice(0, 10)}.*`;
}

function generatePassword(index) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}[]";
    let pass = "";
    for (let i = 0; i < 24; i++) {
        pass += chars.charAt((index * 17 + i * 31 + 7) % chars.length);
    }
    return pass;
}

async function main() {
    const srcDir = path.resolve('test/fixtures/test vault');
    const outDir = path.resolve('test/fixtures/sample vault');

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Read source JPEG carriers
    const carrierFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    console.log(`Found ${carrierFiles.length} carrier files in ${srcDir}`);

    const carriers = [];
    for (const file of carrierFiles) {
        const srcPath = path.join(srcDir, file);
        const outPath = path.join(outDir, file);
        fs.copyFileSync(srcPath, outPath);
        const buf = fs.readFileSync(outPath);
        carriers.push({
            name: file,
            type: 'image/jpeg',
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        });
    }

    console.log(`Building 50 entries with long notes...`);
    let vault = new PasswordVault([], {
        version: '3.0',
        revision: 0,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    }, true, 'password');

    for (let i = 0; i < SERVICES.length; i++) {
        const s = SERVICES[i];
        const secretBytes = new Uint8Array(20);
        crypto.getRandomValues(secretBytes);
        const totpSecret = encodeBase32(secretBytes);

        const entry = {
            title: s.title,
            username: `admin-${s.title.toLowerCase().replace(/[^a-z0-9]/g, '')}@ollie-vault.io`,
            password: generatePassword(i),
            url: s.url,
            tags: s.tags,
            totp: totpSecret,
            notes: generateLongNote(i, s.title)
        };

        const [newVault, addErr] = await vault.addEntry(entry);
        if (addErr) {
            console.error(`Failed to add entry ${i}:`, addErr);
            process.exit(1);
        }
        vault = newVault;
    }

    console.log(`Vault constructed with ${vault.entries.length} entries.`);
    console.log(`Embedding vault into ${carriers.length} JPEG carriers with proportional Cauchy parity and password 'password'...`);

    const [savedCarriers, saveErr] = await vault.save(carriers, 'password');
    if (saveErr) {
        console.error('Save failed:', saveErr);
        process.exit(1);
    }

    console.log(`Saving ${savedCarriers.length} mutated stego carriers to ${outDir}...`);
    for (const carrier of savedCarriers) {
        const originalName = carriers[carrier.sourceIndex].name;
        const outPath = path.join(outDir, originalName);
        fs.writeFileSync(outPath, carrier.data);
        console.log(`  ✓ Wrote stego carrier: ${originalName} (${(carrier.data.length / 1024).toFixed(1)} KB)`);
    }

    // Also copy unmutated carriers if any
    const savedIndices = new Set(savedCarriers.map(c => c.sourceIndex));
    for (let i = 0; i < carriers.length; i++) {
        if (!savedIndices.has(i)) {
            const originalName = carriers[i].name;
            const srcPath = path.join(srcDir, originalName);
            const dstPath = path.join(outDir, originalName);
            fs.copyFileSync(srcPath, dstPath);
            console.log(`  ✓ Preserved carrier: ${originalName}`);
        }
    }

    // Clean up any extraneous files
    const staleFiles = fs.readdirSync(outDir).filter(f => f.startsWith('steg_'));
    for (const stale of staleFiles) {
        fs.unlinkSync(path.join(outDir, stale));
    }

    // Also write an encrypted backup envelope (.ollie.json)
    const [envelope, expErr] = await vault.exportEncrypted('password');
    if (!expErr && envelope) {
        const envelopePath = path.join(outDir, 'sample-vault.ollie.json');
        fs.writeFileSync(envelopePath, JSON.stringify(envelope, null, 2));
        console.log(`  ✓ Wrote encrypted backup: sample-vault.ollie.json`);
    }

    // Also write plaintext JSON export for convenience
    const jsonPath = path.join(outDir, 'sample-vault-export.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
        version: '3.0',
        entries: vault.entries
    }, null, 2));
    console.log(`  ✓ Wrote plaintext import JSON: sample-vault-export.json`);

    // 1. Verify loading the full set
    console.log(`Verifying load from full persisted carrier set in ${outDir}...`);
    const allOutFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    const loadCarriers = allOutFiles.map(file => {
        const buf = fs.readFileSync(path.join(outDir, file));
        return {
            name: file,
            type: 'image/jpeg',
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        };
    });

    const [loadedVault, loadErr] = await PasswordVault.load(loadCarriers, 'password');
    if (loadErr) {
        console.error('Full set verification load failed:', loadErr);
        process.exit(1);
    }

    console.log(`✅ Full set verification SUCCESS! Loaded vault has ${loadedVault.entries.length} entries.`);

    // 2. Verify loading from BIG_LONELY_DOUG alone (High-capacity carrier reconstruction)
    const dougCarriers = loadCarriers.filter(c => c.name.includes('DOUG'));
    if (dougCarriers.length > 0) {
        console.log(`Verifying load from BIG_LONELY_DOUG.jpg alone...`);
        const [dougVault, dougErr] = await PasswordVault.load(dougCarriers, 'password');
        if (dougErr) {
            console.error('BIG_LONELY_DOUG load failed:', dougErr);
            process.exit(1);
        }
        console.log(`✅ BIG_LONELY_DOUG alone verification SUCCESS! Loaded vault has ${dougVault.entries.length} entries.`);
    }

    console.log(`First entry: ${loadedVault.entries[0].title}`);
    console.log(`Middle entry: ${loadedVault.entries[25].title}`);
    console.log(`Last entry: ${loadedVault.entries[loadedVault.entries.length - 1].title}`);
    const [sessionKey] = await loadedVault._resolveSessionKey();
    const [entry0] = await loadedVault.entries[0].decrypt(sessionKey);
    console.log(`Sample note preview (first 120 chars):`);
    console.log(`  "${entry0.notes.slice(0, 120).replace(/\n/g, ' ')}..."`);
    console.log(`Entry 0 TOTP secret: ${entry0.totp}`);
}

main().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
