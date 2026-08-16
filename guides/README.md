# Guides

A dual-axis index into this repository's guides — by concept, and by directory.

## By concept

| Concept | Spec                   | Source                    | Tests                                 |
| ------- | ---------------------- | ------------------------- | ------------------------------------- |
| Table   | [`table.md`](table.md) | [`src/core`](../src/core) | [`tests/src/core`](../tests/src/core) |

## By directory

| Directory  | Guide                  |
| ---------- | ---------------------- |
| `src/core` | [`table.md`](table.md) |

The parity suite checks every fence in `table.md` — its language, its imports, and the exports it
names — and transcribes its worked examples, plus the Usage fence in the root `README.md`, into
tests that run against the real source. A documented value the code contradicts fails there.

## Dependency reference

[`guide.md`](guide.md) is a byte-identical mirror of the guide for `@orkestrel/guide` — the
devDependency powering this repository's guides-parity suite. It documents **that package's**
surface — the `Guide` and `Source` projections plus the manifest and comparison helpers — not
anything sourced here. It is kept beside this guide set so a reader of the parity suite can see the
primitives it is built from without leaving it.

[`scaffold.md`](scaffold.md) is a byte-identical mirror of the guide for `@orkestrel/scaffold` — the
devDependency that generates and repairs this workspace's vendored configuration, tests, and
tooling. It documents **that package's** surface, not anything sourced here, and it is kept for the
same reason.

A mirror's own relative links address its upstream tree, so they resolve to nothing here and sit
outside this repository's link parity. Refresh a mirror from upstream rather than rewriting it.

## See also

- [`AGENTS.md`](../AGENTS.md) — the coding contract every guide is written against.
