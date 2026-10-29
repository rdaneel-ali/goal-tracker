# Goal Tracker

A small savings-goal tracker: set a target and date, record deposits and withdrawals, and see whether you are on pace for your paydays.

> Status: early development. Not yet usable.

## Stack

- Web: React, Vite, Tailwind
- API: Node on AWS Lambda
- Data: DynamoDB
- Auth: Amazon Cognito
- Infra: Terraform
- Language: TypeScript throughout

## Layout

| Folder | Purpose |
| :---- | :---- |
| `web/` | Front end |
| `api/` | Lambda API |
| `shared/` | Types and logic shared by web and api |
| `infra/` | Terraform |

## Getting started

Requires Node 24 (see `.nvmrc`) and [gitleaks](https://github.com/gitleaks/gitleaks#installing) 8.19 or newer.

```bash
npm install   # also enables the pre-commit secret scan
npm test
```

## Contributing

Read [CLAUDE.md](CLAUDE.md) and [.github/copilot-instructions.md](.github/copilot-instructions.md) for working agreements and code standards.

## License

[MIT](LICENSE)
