import { runComplianceTests } from './compliance-test.js';

runComplianceTests().catch(err => {
    console.error('Compliance Tests Failed:', err);
    process.exit(1);
});
