# Security policy

The simulator is a static web app. It has no server, no accounts and no analytics, and it makes no network calls beyond loading its own files; saves stay in the browser (CLAUDE.md rule 12). Even so, we take problems seriously: a script injection in the app, a dependency with a known vulnerability, or anything that would make the app send data elsewhere.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository (private vulnerability reporting). Include what you found, how to reproduce it and its impact. Do not open a public issue for security problems.

We aim to acknowledge reports within a week and to fix confirmed issues in the next release.

## Scope

- In scope: this repository's code, its build and deployment workflows, and its dependencies as used here.
- Out of scope: medical correctness of the simulation. Use a Data correction issue for that; the app is educational only and must not be used for patient care.
