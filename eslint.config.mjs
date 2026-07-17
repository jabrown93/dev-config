import base from './eslint.js';

// dev-config's own active ESLint config -- can't `extends` its own published
// package (bootstrap/circularity), so this imports the shared base directly
// via a relative path instead of through node_modules.
export default [...base, { ignores: ['**/node_modules'] }];
