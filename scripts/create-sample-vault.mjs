import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PasswordVault } from '../src/structures/vault/immutable-vault.js';
import { encodeBase32 } from '../src/utils/base32.js';
import { buildOtpauthUri } from '../src/information-theory/cryptography/totp.js';

const SERVICES = [
    // 1-15: Cloud & Infrastructure
    { title: "AWS Root Production", url: "https://console.aws.amazon.com", tags: ["cloud", "infra", "critical"] },
    { title: "Google Cloud Platform", url: "https://console.cloud.google.com", tags: ["cloud", "prod", "infra"] },
    { title: "Azure Enterprise Portal", url: "https://portal.azure.com", tags: ["cloud", "infra", "corp"] },
    { title: "Cloudflare Edge Admin", url: "https://dash.cloudflare.com", tags: ["infra", "dns", "security", "critical"] },
    { title: "Fastly CDN Delivery", url: "https://manage.fastly.com", tags: ["infra", "cdn", "networking"] },
    { title: "Hetzner Cloud Console", url: "https://console.hetzner.cloud", tags: ["infra", "hosting", "servers"] },
    { title: "DigitalOcean Team", url: "https://cloud.digitalocean.com", tags: ["infra", "vps"] },
    { title: "Linode Cloud Manager", url: "https://cloud.linode.com", tags: ["infra", "vps"] },
    { title: "Vercel Enterprise", url: "https://vercel.com", tags: ["dev", "frontend", "prod"] },
    { title: "Supabase DB Cluster", url: "https://supabase.com", tags: ["dev", "database", "postgres", "critical"] },
    { title: "Render Production Services", url: "https://dashboard.render.com", tags: ["cloud", "hosting"] },
    { title: "Fly.io Application Edge", url: "https://fly.io/dashboard", tags: ["infra", "edge", "containers"] },
    { title: "Railway Cloud Deploy", url: "https://railway.app", tags: ["dev", "paas"] },
    { title: "Neon Serverless Postgres", url: "https://console.neon.tech", tags: ["database", "postgres"] },
    { title: "PlanetScale MySQL Cluster", url: "https://app.planetscale.com", tags: ["database", "mysql"] },

    // 16-30: Developer & VCS & AI
    { title: "GitHub Enterprise", url: "https://github.com", tags: ["dev", "vcs", "critical"] },
    { title: "GitLab Self-Hosted", url: "https://gitlab.internal.net", tags: ["dev", "vcs", "ci"] },
    { title: "Bitbucket Cloud Operations", url: "https://bitbucket.org", tags: ["dev", "vcs"] },
    { title: "HashiCorp Cloud HCP", url: "https://portal.cloud.hashicorp.com", tags: ["infra", "vault", "terraform", "critical"] },
    { title: "Docker Hub Registry", url: "https://hub.docker.com", tags: ["dev", "containers"] },
    { title: "Quay.io Container Registry", url: "https://quay.io", tags: ["dev", "containers", "security"] },
    { title: "OpenAI Platform API", url: "https://platform.openai.com", tags: ["ai", "dev", "api"] },
    { title: "Anthropic Claude Console", url: "https://console.anthropic.com", tags: ["ai", "dev", "api"] },
    { title: "Midjourney Studio", url: "https://midjourney.com", tags: ["ai", "graphics"] },
    { title: "Hugging Face Enterprise Hub", url: "https://huggingface.co", tags: ["ai", "ml", "models"] },
    { title: "Weights & Biases ML Ops", url: "https://wandb.ai", tags: ["ai", "mlops"] },
    { title: "Replicate Inference Engine", url: "https://replicate.com", tags: ["ai", "api"] },
    { title: "Pinecone Vector DB", url: "https://app.pinecone.io", tags: ["ai", "vector", "database"] },
    { title: "Linear Issue Tracker", url: "https://linear.app", tags: ["pm", "dev"] },
    { title: "Atlassian Jira & Confluence", url: "https://id.atlassian.com", tags: ["corp", "pm"] },

    // 31-45: Observability & Security
    { title: "Datadog Observability", url: "https://app.datadoghq.com", tags: ["monitoring", "infra", "critical"] },
    { title: "Sentry Error Tracking", url: "https://sentry.io", tags: ["monitoring", "dev"] },
    { title: "New Relic APM Suite", url: "https://one.newrelic.com", tags: ["monitoring", "apm"] },
    { title: "Grafana Cloud Admin", url: "https://grafana.net", tags: ["monitoring", "metrics"] },
    { title: "Better Uptime Status & Alerting", url: "https://betteruptime.com", tags: ["monitoring", "status"] },
    { title: "PagerDuty Incident On-Call", url: "https://pagerduty.com", tags: ["operations", "oncall", "critical"] },
    { title: "Opsgenie Incident Command", url: "https://app.opsgenie.com", tags: ["operations", "oncall"] },
    { title: "Splunk Enterprise Cloud", url: "https://splunkcloud.com", tags: ["security", "siem", "logs"] },
    { title: "Honeycomb Distributed Tracing", url: "https://ui.honeycomb.io", tags: ["monitoring", "tracing"] },
    { title: "Dynatrace Full-Stack Monitoring", url: "https://dynatrace.com", tags: ["monitoring", "enterprise"] },
    { title: "1Password Master Team", url: "https://my.1password.com", tags: ["security", "vault", "corp", "critical"] },
    { title: "Bitwarden Enterprise Vault", url: "https://vault.bitwarden.com", tags: ["security", "vault"] },
    { title: "Okta Workforce Identity", url: "https://matrix-ops.okta.com", tags: ["identity", "sso", "security", "critical"] },
    { title: "Auth0 Production Tenant", url: "https://manage.auth0.com", tags: ["identity", "auth", "dev"] },
    { title: "Tailscale Zero-Trust Mesh", url: "https://login.tailscale.com", tags: ["network", "vpn", "security", "critical"] },

    // 46-60: Communications & Collaboration
    { title: "Slack Enterprise Grid", url: "https://slack.com", tags: ["comms", "corp"] },
    { title: "Discord Developer Portal", url: "https://discord.com/developers", tags: ["dev", "bots", "community"] },
    { title: "Zoom Enterprise Video", url: "https://zoom.us", tags: ["comms", "meetings"] },
    { title: "Google Workspace Admin", url: "https://admin.google.com", tags: ["corp", "email", "critical"] },
    { title: "Microsoft 365 Admin Center", url: "https://admin.microsoft.com", tags: ["corp", "email", "infra"] },
    { title: "Loom Video Sharing", url: "https://loom.com", tags: ["comms", "video"] },
    { title: "Miro Team Collaboration", url: "https://miro.com", tags: ["design", "whiteboard"] },
    { title: "Basecamp Project HQ", url: "https://basecamp.com", tags: ["pm", "operations"] },
    { title: "Asana Portfolio Management", url: "https://app.asana.com", tags: ["pm", "operations"] },
    { title: "Notion Workspace Admin", url: "https://notion.so", tags: ["wiki", "knowledge"] },
    { title: "Figma Organization Hub", url: "https://figma.com", tags: ["design", "product"] },
    { title: "Postman API Hub", url: "https://go.postman.co", tags: ["dev", "api", "testing"] },
    { title: "Insomnia Cloud Workspaces", url: "https://insomnia.rest", tags: ["dev", "api"] },
    { title: "Sourcegraph Code Intelligence", url: "https://sourcegraph.com", tags: ["dev", "code-search"] },
    { title: "Zendesk Support Enterprise", url: "https://zendesk.com", tags: ["support", "corp"] },

    // 61-75: Finance & Billing
    { title: "Stripe Production Dashboard", url: "https://dashboard.stripe.com", tags: ["finance", "billing", "critical"] },
    { title: "PayPal Merchant Gateway", url: "https://paypal.com", tags: ["finance", "payments"] },
    { title: "Square Developer Portal", url: "https://developer.squareup.com", tags: ["finance", "pos", "payments"] },
    { title: "Wise Business Multi-Currency", url: "https://wise.com", tags: ["finance", "banking", "fx"] },
    { title: "Mercury Corporate Banking", url: "https://mercury.com", tags: ["finance", "banking", "critical"] },
    { title: "Brex Financial Operations", url: "https://brex.com", tags: ["finance", "cards"] },
    { title: "Ramp Spend Management", url: "https://ramp.com", tags: ["finance", "corporate"] },
    { title: "Plaid Developer Console", url: "https://dashboard.plaid.com", tags: ["finance", "banking", "api"] },
    { title: "QuickBooks Online Finance", url: "https://qbo.intuit.com", tags: ["finance", "accounting"] },
    { title: "Xero Accounting Hub", url: "https://login.xero.com", tags: ["finance", "accounting"] },
    { title: "Carta Cap Table Management", url: "https://carta.com", tags: ["finance", "equity", "legal"] },
    { title: "Bill.com Payment Operations", url: "https://app.bill.com", tags: ["finance", "ap", "ar"] },
    { title: "Chargebee Subscription Billing", url: "https://app.chargebee.com", tags: ["finance", "billing"] },
    { title: "Adyen Global Payments", url: "https://ca-live.adyen.com", tags: ["finance", "gateway"] },
    { title: "Gusto Payroll Administration", url: "https://app.gusto.com", tags: ["hr", "payroll", "corp"] },

    // 76-85: Email & Marketing
    { title: "ProtonMail Secure Mailbox", url: "https://mail.proton.me", tags: ["email", "security", "privacy"] },
    { title: "Fastmail Team Email", url: "https://app.fastmail.com", tags: ["email", "corp"] },
    { title: "Twilio Communications API", url: "https://console.twilio.com", tags: ["api", "sms", "voice"] },
    { title: "SendGrid Production Delivery", url: "https://app.sendgrid.com", tags: ["email", "api", "prod"] },
    { title: "Postmark Transactional Mail", url: "https://account.postmarkapp.com", tags: ["email", "api"] },
    { title: "Mailchimp Campaigns Hub", url: "https://mailchimp.com", tags: ["marketing", "newsletters"] },
    { title: "HubSpot CRM & Marketing Suite", url: "https://app.hubspot.com", tags: ["marketing", "sales", "crm"] },
    { title: "Customer.io Messaging Platform", url: "https://fly.customer.io", tags: ["marketing", "automation"] },
    { title: "Braze Customer Engagement", url: "https://dashboard.braze.com", tags: ["marketing", "push"] },
    { title: "Klaviyo Ecommerce Marketing", url: "https://www.klaviyo.com", tags: ["marketing", "ecommerce"] },

    // 86-93: Storage & Domains & Network
    { title: "Dropbox Business Storage", url: "https://dropbox.com", tags: ["storage", "backup", "corp"] },
    { title: "Box Enterprise Content", url: "https://account.box.com", tags: ["storage", "compliance"] },
    { title: "Backblaze B2 Object Storage", url: "https://secure.backblaze.com", tags: ["storage", "s3", "backup"] },
    { title: "Wasabi Hot Cloud Storage", url: "https://console.wasabisys.com", tags: ["storage", "s3"] },
    { title: "Namecheap Domain Registrar", url: "https://namecheap.com", tags: ["domains", "infra"] },
    { title: "Porkbun DNS Management", url: "https://porkbun.com", tags: ["domains", "dns"] },
    { title: "Hover Domain Services", url: "https://hover.com", tags: ["domains", "dns"] },
    { title: "Ubiquiti UniFi Site Manager", url: "https://unifi.ui.com", tags: ["hardware", "network", "iot"] },

    // 94-100: App Stores, Media & Developer Portals
    { title: "Apple Developer Program", url: "https://developer.apple.com", tags: ["dev", "mobile", "apple"] },
    { title: "Google Play Console", url: "https://play.google.com/console", tags: ["dev", "mobile", "android"] },
    { title: "Reddit Corporate Admin", url: "https://reddit.com", tags: ["social", "community"] },
    { title: "X / Twitter Developer Portal", url: "https://developer.x.com", tags: ["social", "api"] },
    { title: "LinkedIn Corporate Talent", url: "https://linkedin.com", tags: ["social", "recruiting"] },
    { title: "Spotify Studio Audio Network", url: "https://spotify.com", tags: ["media", "audio"] },
    { title: "Netflix Studio Production Hub", url: "https://netflix.com", tags: ["media", "streaming"] }
];

function generateNote(index, s) {
    if (index % 10 === 0) {
        return `### Security & Operational Policy — ${s.title}
- **Account Classification:** Tier-1 Critical Production Infrastructure.
- **Rotation Schedule:** Semi-annually rotated under PBKDF2-HMAC-SHA256 standards.
- **MFA Enforcement:** Strict Hardware FIDO2 + TOTP fallback.
- **Emergency Break-Glass:** Retrieve hardware token from Safe #3, Slot B-${(index % 12) + 1}.
- **Recovery Token:** \`RECOVERY-TOKEN-${index + 1}-9941-F8B2\`
- **Access Constraints:** CIDR whitelists \`192.168.100.0/24\` and \`10.240.0.0/16\`.
- **On-Call:** \`security-oncall@matrix-ops.internal\` / Signal \`#infra-emergencies\`.`;
    }

    if (index % 10 === 5) {
        return `**Production Credentials Policy — ${s.title}**
- Primary account for production environment deployment pipelines.
- Multi-factor authentication enforced for all web dashboard sessions.
- Recovery code stored in encrypted cold backup: \`REC-${index * 1337 + 1000}-SEC\`.
- Scheduled rotation: 90 days.`;
    }

    if (index % 3 === 0) {
        return `Developer service account for CI/CD and automated toolchain integration. Single-sign-on enabled with TOTP backup.`;
    }

    if (index % 2 === 0) {
        return `Standard corporate credentials for ${s.title}. Rotated quarterly.`;
    }

    return `Managed service login for ${s.title}.`;
}

function generatePassword(index) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}[]";
    let pass = "";
    for (let i = 0; i < 20; i++) {
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
        const buf = fs.readFileSync(srcPath);
        carriers.push({
            name: file,
            type: 'image/jpeg',
            arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        });
    }

    console.log(`Building ${SERVICES.length} entries with fake sites and operational notes...`);
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
        const base32Secret = encodeBase32(secretBytes);
        const [totpUri] = buildOtpauthUri({
            label: s.title,
            secret: base32Secret,
            issuer: 'Ollie'
        });

        const slug = s.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const entry = {
            title: s.title,
            username: `admin-${slug}@ollie-vault.io`,
            password: generatePassword(i),
            url: s.url,
            tags: s.tags,
            totp: totpUri,
            notes: generateNote(i, s)
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
            console.log(`  ✓ Preserved unmutated carrier: ${originalName}`);
        }
    }

    // Clean up any extraneous files
    const staleFiles = fs.readdirSync(outDir).filter(f => f.startsWith('steg_'));
    for (const stale of staleFiles) {
        fs.unlinkSync(path.join(outDir, stale));
    }

    // Write an encrypted backup envelope (.ollie.json)
    const [envelope, expErr] = await vault.exportEncrypted('password');
    if (!expErr && envelope) {
        const envelopePath = path.join(outDir, 'sample-vault.ollie.json');
        fs.writeFileSync(envelopePath, JSON.stringify(envelope, null, 2));
        console.log(`  ✓ Wrote encrypted backup: sample-vault.ollie.json`);
    }

    // Write plaintext JSON export for convenience (decrypted entries for UI import / CLI)
    const [sessionKey] = await vault._resolveSessionKey();
    const plaintextEntries = [];
    for (const entry of vault.entries) {
        const [plain] = await entry.decrypt(sessionKey);
        plaintextEntries.push(plain);
    }

    const jsonPath = path.join(outDir, 'sample-vault-export.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
        version: '3.0',
        metadata: vault.metadata,
        entries: plaintextEntries
    }, null, 2));
    console.log(`  ✓ Wrote plaintext import JSON: sample-vault-export.json (${plaintextEntries.length} entries)`);

    // Verify loading the full set
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
    console.log(`First entry: ${loadedVault.entries[0].title}`);
    console.log(`Middle entry: ${loadedVault.entries[50].title}`);
    console.log(`Last entry: ${loadedVault.entries[loadedVault.entries.length - 1].title}`);

    const [loadedSessionKey] = await loadedVault._resolveSessionKey();
    const [entry0] = await loadedVault.entries[0].decrypt(loadedSessionKey);
    console.log(`Sample note preview (first 120 chars):`);
    console.log(`  "${entry0.notes.slice(0, 120).replace(/\n/g, ' ')}..."`);
    console.log(`Entry 0 TOTP URI: ${entry0.totp}`);
}

main().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
