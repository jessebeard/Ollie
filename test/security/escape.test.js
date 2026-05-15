import { describe, it, expect } from "../utils/test-runner.js";
import { Arbitrary, assertProperty } from "../utils/pbt.js";
import { VaultView } from "../../app/components/vault/components/vault-view.js";

describe("HTML Escaping Security", () => {
    it("should prevent XSS attribute injections in VaultView", async () => {
        // VaultView's escape method is a pure function, so we don't need JSDOM to test it directly
        // We can just instantiate it with dummy arguments.
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string()],
            (str) => {
                const escaped = view.escape(str);

                // Single quotes are not escaped in the original code, allowing attribute injection
                if (str.includes("'") && escaped.includes("'")) {
                    return false; // Fails if single quotes are left unescaped
                }

                // Double quotes should be escaped
                if (str.includes('"') && escaped.includes('"')) {
                    return false;
                }
                return true;
            }
        );
    });
});
