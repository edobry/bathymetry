module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "rules": {
        "indent": ["warn", 4],
        "linebreak-style": ["error", "unix"],
        "prefer-const": ["warn"],
        "comma-dangle": ["error", "never"],
        "no-extra-semi": "error",
        "no-return-assign": "off",
        "quotes": ["warn", "double", { "avoidEscape": true }],
        "no-unreachable": "error",
        "use-isnan": "error",
        "dot-notation": "warn",
        "no-else-return": "error",
        "no-loop-func": "warn",
        "no-new-wrappers": "error",
        "no-undef": "error",
        "brace-style": ["warn", "1tbs", { "allowSingleLine": true }],
        "curly": ["error", "multi"],
        "comma-style": ["warn", "last"],
        "eol-last": "error",
        "no-mixed-spaces-and-tabs": "error",
        "semi-spacing": ["error"],
        "no-trailing-spaces": "warn",
        "semi": ["error"],
        "space-before-function-paren": ["warn", "never"],
        "space-before-blocks": "error",
        "space-infix-ops": "warn",
        "strict": "off",
        "new-cap": "off",
        "no-unused-vars": ["warn", {
            "args": "after-used"
        }],
        "no-use-before-define": "off",
        "eqeqeq": "off"
    }
};
