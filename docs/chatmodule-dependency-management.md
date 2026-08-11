# ChatModule dependency management

Image Production consumes ChatModule as a private, independently versioned
GitHub Packages dependency. The application does not copy ChatModule source and
does not update one package from the family separately from the others.

## Version policy

- Direct `@prodactionpro/chat-*` dependencies use one exact stable version, for
  example `0.5.1`. Ranges such as `^0.5.1`, tags such as `latest`, Git branches
  and tarballs are not allowed.
- Dependabot groups every ChatModule package update into one pull request.
- ChatModule pull requests are never merged automatically. The normal Image
  Production CI is the consumer compatibility check.
- A minor update before `1.0.0` may contain incompatible changes and requires
  review of the ChatModule migration notes.

`npm run check:chatmodule-versions` enforces the exact-version and single-family
rules in both `package.json` and `package-lock.json`.

## GitHub secret

Until automatic package access is explicitly granted to this repository,
configure one classic personal access token with only `read:packages` and
access to the private ChatModule packages. Store the same value in two separate
GitHub secret stores before `.github/dependabot.yml` reaches the default branch:

1. `Settings -> Secrets and variables -> Actions`;
2. `Settings -> Secrets and variables -> Dependabot`.

Use the name `PRODACTION_PACKAGES_READ_TOKEN` in both places. From an
authenticated terminal, both commands prompt for the value without writing it
to shell history:

```bash
gh secret set PRODACTION_PACKAGES_READ_TOKEN --repo mzhoff/image-prodaction
gh secret set PRODACTION_PACKAGES_READ_TOKEN --repo mzhoff/image-prodaction --app dependabot
```

Do not commit a token or a project `.npmrc`. The CI workflow passes the token
only to `npm ci` and to the Docker BuildKit secret mount. The Dockerfile removes
the temporary npm configuration in the same build layer, so it is not included
in the resulting image. Local full-container builds use
`compose.private-packages.yaml`; see `docs/local-setup.md` for the hidden-input
command.

If consumer repositories are moved under the same GitHub organization as the
packages, prefer GitHub's automatic Dependabot package access: grant each
consumer repository Read access under the package's `Manage Actions access`
settings and remove the PAT-backed registry entry.

## Update flow

Dependabot checks the registry every day at 09:00 Europe/Moscow. When a new
ChatModule release is available it updates the manifest and lockfile together
and opens one pull request for the package family. The pull request must pass:

1. package installation from GitHub Packages;
2. ChatModule version-family policy;
3. database migration check;
4. typecheck, lint, architecture checks and tests;
5. production build and container build;
6. critical-path smoke and browser E2E.

Dependabot polling is not an immediate release notification. When several
products consume ChatModule, add a release workflow in the ChatModule repository
that sends a GitHub App-authenticated `repository_dispatch` event to registered
consumer repositories. The dispatch should request a Dependabot refresh or
start the same consumer integration workflow; it must not merge dependency
updates automatically.
