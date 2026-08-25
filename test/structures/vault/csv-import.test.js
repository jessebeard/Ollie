import { describe, it, expect } from '../../utils/test-runner.js';
// RED: module does not exist yet - this suite must fail until Cycle 2 GREEN.
import { detectFormat, importFromCsv } from '../../../src/structures/vault/csv-import.js';

const FIREFOX_CSV = [
    '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"',
    '"https://example.com/","user@example.com","s3cret","Example realm","","guid-111","1700000000000","1700100000000","1700200000000"',
    '"https://test.org/login","","pw2","","","guid-222","","",""'
].join('\r\n');

const CHROME_CSV = [
    'name,url,username,password,note',
    'GitHub,https://github.com,octocat,hunter2,work account',
    'Router,http://192.168.1.1,admin,admin,'
].join('\n');

const CHROME_GPM_CSV = [
    'url,username,password,first_detection_time,last_used_time',
    'https://example.net,u@net.example,hunter3,1712345678901234,1712345678000000'
].join('\n');

const APPLE_CSV = [
    'Title,URL,Username,Password,Notes,OTPAuth',
    'Apple,https://apple.com,user@apple.com,pw1,"multi',
    'line note",otpauth://totp/Apple:user@apple.com?secret=GEZDGNBVGY3TQOJQ&issuer=Apple',
    'Bare,https://bare.example,b@x.y,pw2,,'
].join('\n');

const KEEPASS_CSV = [
    '"Account","Login Name","Password","Web Site","Comments"',
    '"Site \\"A\\"","user","p\\\\w","https://a.example","some comments"'
].join('\n');

const KEEPASSXC_CSV = [
    '"Group","Title","Username","Password","URL","Notes","Icon","Last Modified","Created","TOTP"',
    '"Internet/Banking","Bank","u","p","https://bank.example","note n","00","2024-01-15T10:30:00Z","2023-01-15T10:30:00Z","otpauth://totp/Bank?secret=JBSWY3DPEHPK3PXP"'
].join('\n');

const BITWARDEN_CSV = [
    'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp',
    'Work,1,login,GitHub,gh notes,k=v,0,https://github.com,octo,hunter2,otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
    'Personal,0,card,MyCard,,,,,,,',
    ',0,note,SecretNote,plain body,,,,,,'
].join('\n');

const LASTPASS_CSV = [
    'url,username,password,totp,extra,name,grouping,fav',
    'https://facebook.com/me,me@x.com,pw1,,FB notes,Facebook,Social,1',
    'http://site.io,u2,pw2,JBSWY3DPEHPK3PXP,,Site2,FolderA/Sub,0'
].join('\n');

describe('CSV import: format detection', () => {
    it('identifies all seven vendor profiles', () => {
        expect(detectFormat(['url', 'username', 'password', 'httpRealm', 'formActionOrigin', 'guid'])).toBe('firefox');
        expect(detectFormat(['name', 'url', 'username', 'password', 'note'])).toBe('chrome');
        expect(detectFormat(['url', 'username', 'password', 'first_detection_time', 'last_used_time'])).toBe('chrome');
        expect(detectFormat(['Title', 'URL', 'Username', 'Password', 'Notes', 'OTPAuth'])).toBe('apple');
        expect(detectFormat(['Account', 'Login Name', 'Password', 'Web Site', 'Comments'])).toBe('keepass');
        expect(detectFormat(['Group', 'Title', 'Username', 'Password', 'URL', 'Notes', 'Icon'])).toBe('keepassxc');
        expect(detectFormat(['folder', 'favorite', 'type', 'name', 'notes', 'login_uri'])).toBe('bitwarden');
        expect(detectFormat(['url', 'username', 'password', 'totp', 'extra', 'name', 'grouping', 'fav'])).toBe('lastpass');
    });

    it('treats a bare url/username/password file as generic chrome', () => {
        expect(detectFormat(['url', 'username', 'password'])).toBe('chrome');
    });

    it('is case-insensitive', () => {
        expect(detectFormat(['TITLE', 'url', 'USERNAME', 'password', 'NOTES', 'OTPAuth'.toLowerCase()])).toBe('apple');
    });
});

describe('CSV import: vendor mapping', () => {
    it('firefox: derives title from hostname, converts epoch-ms created, preserves provenance', async () => {
        const [result, err] = await importFromCsv(FIREFOX_CSV);
        expect(err).toEqual(null);
        expect(result.format).toBe('firefox');
        expect(result.entries.length).toBe(2);

        const e1 = result.entries[0];
        expect(e1.title).toBe('example.com');
        expect(e1.url).toBe('https://example.com/');
        expect(e1.username).toBe('user@example.com');
        expect(e1.password).toBe('s3cret');
        expect(e1.created).toBe(new Date(1700000000000).toISOString());
        const cf = Object.fromEntries(e1.customFields.map(f => [f.label, f.value]));
        expect(cf['httpRealm']).toBe('Example realm');
        expect(cf['guid']).toBe('guid-111');

        const e2 = result.entries[1];
        expect(e2.title).toBe('test.org');
        expect(e2.created).toBe(undefined);
    });

    it('chrome: uses native name, maps note to notes', async () => {
        const [result, err] = await importFromCsv(CHROME_CSV);
        expect(err).toEqual(null);
        expect(result.format).toBe('chrome');
        expect(result.entries[0].title).toBe('GitHub');
        expect(result.entries[0].notes).toBe('work account');
        expect(result.entries[0].password).toBe('hunter2');
    });

    it('chrome gpm: converts microsecond timestamps', async () => {
        const [result, err] = await importFromCsv(CHROME_GPM_CSV);
        expect(err).toEqual(null);
        expect(result.entries[0].created).toBe(new Date(1712345678901).toISOString());
        const cf = Object.fromEntries(result.entries[0].customFields.map(f => [f.label, f.value]));
        expect(cf['last_used_time']).toBeDefined();
    });

    it('apple: preserves multiline notes and verbatim otpauth URI', async () => {
        const [result, err] = await importFromCsv(APPLE_CSV);
        expect(err).toEqual(null);
        expect(result.format).toBe('apple');
        const e1 = result.entries[0];
        expect(e1.title).toBe('Apple');
        expect(e1.notes).toContain('line note');
        expect(e1.totp).toBe('otpauth://totp/Apple:user@apple.com?secret=GEZDGNBVGY3TQOJQ&issuer=Apple');
        expect(result.entries[1].title).toBe('Bare');
    });

    it('keepass: applies backslash-quote unescaping after detection', async () => {
        const [result, err] = await importFromCsv(KEEPASS_CSV);
        expect(err).toEqual(null);
        expect(result.format).toBe('keepass');
        const e = result.entries[0];
        expect(e.title).toBe('Site "A"');
        expect(e.password).toBe('p\\w');
        expect(e.notes).toBe('some comments');
        expect(e.url).toBe('https://a.example');
    });

    it('keepassxc: group path becomes tag plus folder field, timestamps converted, totp kept', async () => {
        const [result, err] = await importFromCsv(KEEPASSXC_CSV);
        expect(err).toEqual(null);
        const e = result.entries[0];
        expect(e.tags).toContain('Banking');
        const cf = Object.fromEntries(e.customFields.map(f => [f.label, f.value]));
        expect(cf['Folder']).toBe('Internet/Banking');
        expect(cf['Icon']).toBe('00');
        expect(e.created).toBe('2023-01-15T10:30:00Z');
        expect(e.totp).toBe('otpauth://totp/Bank?secret=JBSWY3DPEHPK3PXP');
    });

    it('bitwarden: logins import fully, cards skip as TODO, notes import passwordless', async () => {
        const [result, err] = await importFromCsv(BITWARDEN_CSV);
        expect(err).toEqual(null);
        expect(result.entries.length).toBe(2);

        const gh = result.entries[0];
        expect(gh.title).toBe('GitHub');
        expect(gh.tags).toContain('favorite');
        const cf = Object.fromEntries(gh.customFields.map(f => [f.label, f.value]));
        expect(cf['Folder']).toBe('Work');
        expect(gh.customFields.some(f => f.label === 'k' && f.value === 'v')).toBe(true);
        expect(gh.totp).toContain('secret=JBSWY3DPEHPK3PXP');

        const note = result.entries[1];
        expect(note.title).toBe('SecretNote');
        expect(note.password).toBe(undefined);

        expect(result.skipped.length).toBe(1);
        expect(result.skipped[0].reason).toContain('todo(card-identity-import)');
    });

    it('lastpass: extra->notes, grouping->folder+tag, fav->favorite, bare secret wrapped into otpauth', async () => {
        const [result, err] = await importFromCsv(LASTPASS_CSV);
        expect(err).toEqual(null);
        expect(result.format).toBe('lastpass');

        const fb = result.entries[0];
        expect(fb.title).toBe('Facebook');
        expect(fb.notes).toBe('FB notes');
        expect(fb.tags).toContain('favorite');

        const s2 = result.entries[1];
        expect(s2.totp).toBe('otpauth://totp/Site2?secret=JBSWY3DPEHPK3PXP');
        const cf = Object.fromEntries(s2.customFields.map(f => [f.label, f.value]));
        expect(cf['Folder']).toBe('FolderA/Sub');
        expect(s2.tags).toContain('Sub');
    });
});

describe('CSV import: failure and edge policy', () => {
    it('rejects unrecognized headers with a typed error naming them', async () => {
        const [, err] = await importFromCsv('foo,bar\n1,2');
        if (!(err instanceof Error)) throw new Error('expected tuple error');
        expect(err.message).toContain('foo');
        expect(err.message.toLowerCase()).toContain('unsupported');
    });

    it('skips ragged rows with a stated reason instead of aborting', async () => {
        const csv = 'name,url,username,password\nGood,https://g.example,u,p\nShort,x';
        const [result, err] = await importFromCsv(csv);
        expect(err).toEqual(null);
        expect(result.entries.length).toBe(1);
        expect(result.skipped.length).toBe(1);
        expect(result.skipped[0].reason.toLowerCase()).toContain('columns');
    });

    it('stores hostile cell content verbatim (render layer owns escaping)', async () => {
        const xss = 'Title,URL,Username,Password,Notes,OTPAuth\n<img src=x onerror=alert(1)>,https://x.example,a,p,,\n';
        const [result, err] = await importFromCsv(xss);
        expect(err).toEqual(null);
        expect(result.entries[0].title).toBe('<img src=x onerror=alert(1)>');
    });

    it('falls back to username then hostname-derived title when no name column exists', async () => {
        // Chrome GPM layout has no name/title column: username wins when the URL is empty.
        const csv = 'url,username,password,first_detection_time,last_used_time\n,solo,p,123,456\n';
        const [result, err] = await importFromCsv(csv);
        expect(err).toEqual(null);
        expect(result.entries[0].title).toBe('solo');

        // With a URL and no username, hostname becomes the title.
        const csv2 = 'url,username,password,first_detection_time,last_used_time\nhttps://anon.example,,p,1,2\n';
        const [result2] = await importFromCsv(csv2);
        expect(result2.entries[0].title).toBe('anon.example');
    });
});
