# Security Policy

## Supported versions

This project is pre-1.0. Only the latest published `0.x` release receives security
fixes. Pin a version and review the [CHANGELOG](./CHANGELOG.md) before upgrading.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Report privately via GitHub's [Security Advisories](https://github.com/rajeevdesai/face-verification-api/security/advisories/new)
(Security tab → "Report a vulnerability").

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if available).
- Affected version(s) and environment.

Expect an acknowledgement within **5 business days**. We will work with you on a fix
and coordinate a disclosure timeline. We do not currently run a paid bounty program.

## Scope: vulnerabilities vs. known limitations

This is a face-verification library, not a complete authentication system. Several
properties are **documented design limitations, not vulnerabilities** — see
[Open Risks](./README.md#open-risks):

- **Liveness is not a complete spoof defense.** The default two-model ensemble reliably
  rejects screen and video replay, but print is the hard case — a printed photo can
  still occasionally pass as live. Do not rely on the liveness check as your only
  anti-spoof measure.
- **Uncalibrated thresholds.** The default `threshold` / `livenessThreshold` are
  placeholders; recognition accuracy is bounded by the embedding model. Calibrate
  on your own data before production.
- **Not a sole authentication factor.** Pair with another factor for anything
  security-critical.

Reports about these documented behaviors will be treated as design feedback, not
security vulnerabilities. In scope are issues such as: a path that leaks biometric
data off-device, a way to bypass the documented decision logic, dependency
vulnerabilities, or unsafe handling of untrusted image input.
