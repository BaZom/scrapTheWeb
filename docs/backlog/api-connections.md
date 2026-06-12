# API Connections Backlog Plan

## Summary

Add an optional API connection feature for cases where visual website capture is blocked,
fragile, slow, or the customer already has official API access.

This should be presented as a safe official data source, not as a technical plugin system.

User-facing name:

- API Connection
- Official Data Source
- Connected Source

Avoid leading with words like plugin, scraper, endpoint, token, or JSON unless the user is
already in an advanced setup view.

## Product Goal

Skrowt should support two ways to collect data:

1. Website capture: user opens a website and clicks the data they want.
2. API connection: user connects an official API and chooses the data they want from the
   returned response.

This gives customers a trustworthy path when scraping is not allowed, not stable, or not the
best technical option.

## Mental Model

There are two levels of connection.

### Custom API Connection

This is the realistic MVP.

The user has an API URL and a key from the provider's documentation or account settings.
They enter the connection details, test the request, choose the data, and save a monitor.

Example:

```text
GET https://api.example.com/products
Authorization: Bearer ********
```

Flow:

```text
User enters API details
-> Skrowt tests the connection
-> Skrowt stores the secret encrypted
-> User selects the list and details
-> Monitor uses the connection for future checks
```

### Official OAuth Connection

This is the PayPal-style experience and should come later for popular platforms.

The user clicks a provider button, logs in on the provider website, approves access, and
returns to Skrowt.

Example providers later:

- Shopify
- Airtable
- HubSpot
- Stripe
- WooCommerce

Flow:

```text
User clicks "Connect Shopify"
-> Provider login and approval page
-> Provider redirects back to Skrowt
-> Skrowt stores encrypted access tokens
-> Monitor uses the official connection
```

This is more trustworthy than pasting raw API keys, but it requires one dedicated integration
per provider.

## Secure No-Code UX

### 1. Choose Source

Show two clear choices:

```text
Website
Click on data from a page.

API Connection
Use an official data connection.
```

### 2. Create Connection

Ask only for the minimum needed details:

- API URL
- Authentication type
- Secret value, if needed
- Optional query parameters
- Optional headers

Supported MVP auth types:

- No key
- Bearer token
- API key in header
- API key in query parameter

Important UI copy:

```text
Use a read-only key with the smallest permissions possible.
Your key is encrypted and never shown again.
```

### 3. Test Connection

Primary action:

```text
Test connection
```

Success state:

```text
Connected successfully.
We found data you can collect.
```

Failure states should be plain and helpful:

```text
The key was rejected.
Check that the key is active and has read-only access.
```

```text
The API did not return data we can read yet.
For the first version, the API must return JSON.
```

### 4. Pick The List

Do not start with JSON paths.

Show detected groups in plain language:

```text
Products - 120 items
Orders - 50 items
Customers - 12 items
```

The user selects the repeating list they want to collect.

### 5. Pick Details

Show sample values in a friendly table/tree view:

```text
title      Adidas Shoes
price      79.99
url        https://...
image      https://...
stock      12
```

The user checks the details they want.

Advanced users can optionally reveal technical paths, but this should not be the default.

### 6. Preview

Show the first rows in the same preview table pattern as the website builder:

```text
25 items found
5 details selected
```

### 7. Save Monitor

The user names the monitor and chooses the refresh schedule.

## Trust And Security Requirements

API keys are effectively passwords. The product must treat them as secrets, not normal
configuration.

Required baseline:

- Encrypt secrets at rest.
- Never log secrets.
- Never log full authorization headers.
- Never log query parameters that contain secret values.
- Mask secrets immediately after entry.
- Never show the full secret again after saving.
- Show only a masked value, optionally with the last 4 characters.
- Store secrets separately from monitor configuration.
- Allow users to replace a secret.
- Allow users to delete a connection.
- Show where a connection is used.
- Recommend read-only keys.
- Encourage least-privilege access.
- Add audit events for connection tested, key updated, key deleted, and monitor checked.

Example usage display:

```text
Used by:
- Price monitor
- Stock monitor
```

## MVP Scope

Build first:

- Custom REST API connections.
- GET requests only.
- JSON responses only.
- No OAuth.
- No GraphQL.
- No POST workflows.
- Bearer token support.
- API key in header support.
- API key in query parameter support.
- Simple query parameter editor.
- Test connection.
- Detect candidate lists in JSON.
- Select the list to collect.
- Select details from sample values.
- Preview table.
- Save monitor.
- Encrypted secret storage.
- Scheduled refresh using the same monitor/run infrastructure.

Internal monitor shape:

```json
{
  "source_type": "api",
  "url": "https://api.example.com/products",
  "method": "GET",
  "auth": {
    "type": "bearer_token",
    "secret_ref": "secret_123"
  },
  "records_path": "$.products[*]",
  "details": [
    { "name": "title", "path": "$.title" },
    { "name": "price", "path": "$.price" },
    { "name": "url", "path": "$.url" }
  ]
}
```

## Later Scope

Add after the MVP proves useful:

- OAuth provider connections.
- Pagination helpers.
- Cursor pagination.
- Offset/page pagination.
- Rate limit handling per connection.
- POST request setup for search APIs.
- GraphQL support.
- Webhook-based sources.
- Provider-specific templates.
- Self-hosted worker option for enterprise users.
- Customer-managed secrets through Vault or AWS Secrets Manager.

## API Variability To Expect

A general API connection cannot support every API perfectly on day one.

APIs differ in:

- Authentication style.
- Pagination style.
- Rate limits.
- Nested response shapes.
- Required headers.
- Required query parameters.
- REST vs GraphQL.
- Polling vs webhook models.

The MVP promise should be:

```text
Connect APIs that return JSON.
```

Not:

```text
Connect every API.
```

## Design Principle

The user experience should feel like:

```text
Connect a safe official data source.
```

Not:

```text
Paste a secret into a scraper.
```

This feature improves trust, compliance, performance, and reliability when official data access
is available.
