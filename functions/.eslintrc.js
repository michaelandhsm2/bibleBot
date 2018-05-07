module.exports = {
  extends: [
    'airbnb-base',
    'plugin:jest/recommended',
  ],
  plugins: [
    'import',
    'jest',
  ],
  env: {
    node: true,
    'jest/globals': true,
  },
  rules:{
    "no-console": 0,
    "comma-dangle": [1, {
        "arrays": "always-multiline",
        "objects": "always-multiline",
        "imports": "always-multiline",
        "exports": "always-multiline",
        "functions": "ignore"
    }],
    "no-use-before-define": ["error", "nofunc"],
    "eqeqeq": ["error", "smart"],

   }
};
