// Shared commitlint configuration for jabrown93 repos. This file doubles as
// dev-config's own active commitlint config (auto-discovered by commitlint's
// standard filename search) and the shareable module consumers reference:
//
//   export default { extends: ['@jabrown93/dev-config/commitlint'] };
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [2, 'never', '500'],
    'body-max-length': [2, 'never', '2000'],
    'footer-max-line-length': [2, 'never', '500'],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
  },
};
