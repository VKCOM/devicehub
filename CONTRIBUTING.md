# Contributing

We welcome contributions that adhere to the guidelines outlined below.

## How to contribute

1. Fork the repository.
2. Create a feature branch for your contribution based on the `master` branch. Each branch should focus on a single contribution.
3. Implement your contribution while following our guidelines (see below).
4. If possible, include tests for your contribution to ensure its functionality.
5. Before submitting, run `npm run lint` and `npm run typecheck` to check for code style and type issues. These are the same checks that CI runs for `lib/`.
6. Submit a pull request against the `master` branch of our repository.

## Guidelines

* **Do** use feature branches for your contributions.
* **Do** adhere to the existing coding style to maintain consistency.
* **Do** use [EditorConfig] to apply our [whitespace rules](.editorconfig). If your editor does not support EditorConfig, manually adjust the settings.
* **Do not** modify the `version` field in [package.json](package.json).
* **Do not** commit generated files unless they are already present in the repository. If necessary, provide an explanation.
* **Do not** create top-level files or directories without justification, and ensure updates to [.npmignore](.npmignore) if needed.

## License

By contributing your code, you agree to license your contribution under our [LICENSE](LICENSE).
