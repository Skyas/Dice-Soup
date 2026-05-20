'use strict';

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'server',
        'web-admin',
        'shared-types',
        'logger',
        'onebot-client',
        'security',
        'dice-engine',
        'llm-router',
        'card-renderer',
        'game-soup',
        'game-avalon',
        'game-undercover',
        'rule-coc7',
        'docker',
        'deps',
        'ci',
      ],
    ],
  },
};
