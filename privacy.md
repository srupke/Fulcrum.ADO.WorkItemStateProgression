# Privacy Policy

**Work Item State Progression**
**Publisher:** Scott Rupke
**Last updated:** June 11, 2026

## Overview

Work Item State Progression is an Azure DevOps extension that analyzes the time work items spend in each workflow state within a sprint. This policy describes how the extension handles data.

## Data Collection

This extension does **not** collect, store, transmit, or share any personal data or organizational data outside of your Azure DevOps environment.

All data accessed by this extension — including work item details, state history, team names, and sprint information — is retrieved directly from your Azure DevOps organization via the Azure DevOps REST API and is displayed only within the extension's hub page.

## Data Usage

- Data is fetched at runtime in response to user interaction (selecting a project, team, and sprint).
- Extension settings (column visibility, thresholds, state order) are persisted using the Azure DevOps Extension Data Service and stored within your organization. No settings data leaves your Azure DevOps environment.
- No analytics, telemetry, or tracking is performed by this extension.

## Third-Party Services

This extension does not integrate with or transmit data to any third-party services.

## Permissions

This extension requests the `vso.work` scope, which grants read-only access to work items, work item history, teams, and sprint data within your Azure DevOps organization. No write access is requested or used.

## Contact

For questions or concerns about this privacy policy, contact:

**Scott Rupke**
srupke@charter.net
