# AV Database Lookup - Freshdesk FDK App Developer Guide

This guide covers everything you need to develop, test, and deploy the AV Database Lookup app for Freshdesk.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Configuration](#configuration)
4. [Adding New Validation Rules](#adding-new-validation-rules)
5. [Testing Guide](#testing-guide)
6. [Deployment](#deployment)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js** v18.x or later
- **Freshworks FDK CLI** - Install globally:
  ```bash
  npm install -g @freshworks/fdk
  ```
- **Freshdesk account** with admin access
- **NocoDB** database access with API token

### Project Setup

1. Clone or copy the project:
   ```bash
   git clone <repository-url>
   cd fdk-demo
   ```

2. Verify FDK installation:
   ```bash
   fdk version
   ```

### Project Structure

```
fdk-demo/
├── app/
│   ├── index.html          # Main UI template
│   ├── scripts/
│   │   └── app.js          # Application logic & validation rules
│   └── styles/
│       ├── style.css       # App styling
│       └── images/
│           └── icon.svg    # App icon
├── config/
│   ├── iparams.json        # Installation parameters (API keys, domain)
│   └── requests.json       # API request templates
├── manifest.json           # App manifest (permissions, locations)
└── DEVELOPER_GUIDE.md      # This file
```

---

## Development Workflow

### Starting Local Development

1. Navigate to the project directory:
   ```bash
   cd fdk-demo
   ```

2. Start the FDK development server:
   ```bash
   fdk run
   ```

3. The server starts on `http://localhost:10001`

### Configuring Installation Parameters

Before testing in Freshdesk, configure your installation parameters:

1. Open your browser to: `http://localhost:10001/custom_configs`
2. Fill in the required fields:
   - **Freshdesk Domain**: Your subdomain (e.g., `mycompany` for `mycompany.freshdesk.com`)
   - **Freshdesk API Key**: Get from Profile Settings > API Key in Freshdesk
   - **NocoDB API Token**: Get from NocoDB account settings

3. Click **Install** to save the configuration

### Viewing the App in Freshdesk

1. Log into your Freshdesk account
2. Open any ticket
3. **Important**: Enable insecure content in Chrome:
   - Click the lock/shield icon in the address bar
   - Select "Site settings"
   - Set "Insecure content" to "Allow"
   - Refresh the page
4. The app appears in the ticket sidebar

### Hot Reloading

- Changes to `app.js`, `index.html`, and `style.css` are picked up automatically
- Refresh the Freshdesk ticket page to see changes
- Changes to `manifest.json`, `iparams.json`, or `requests.json` require restarting `fdk run`

---

## Configuration

### manifest.json

Defines app metadata, permissions, and locations.

```json
{
  "platform-version": "3.0",
  "modules": {
    "support_ticket": {
      "location": {
        "ticket_sidebar": {
          "url": "index.html",
          "icon": "styles/images/icon.svg"
        }
      }
    }
  },
  "engines": {
    "node": "18.20.4",
    "fdk": "9.7.4"
  }
}
```

**Key sections:**
- `modules.support_ticket.location.ticket_sidebar` - Places app in ticket sidebar
- `modules.common.requests` - Declares API request templates used

### config/iparams.json

Installation parameters collected during app installation.

```json
{
  "domain": {
    "display_name": "Freshdesk Domain",
    "type": "text",
    "required": true
  },
  "api_key": {
    "display_name": "Freshdesk API Key",
    "type": "text",
    "required": true,
    "secure": true
  },
  "nocodb_token": {
    "display_name": "NocoDB API Token",
    "type": "text",
    "required": true,
    "secure": true
  }
}
```

**Important:** Fields marked `secure: true` are encrypted and not exposed in logs.

### config/requests.json

API request templates for external calls.

```json
{
  "queryNocoDB": {
    "schema": {
      "method": "GET",
      "host": "app.nocodb.com",
      "path": "/api/v2/tables/moeo293n3g8bj7k/records?where=(eurocode,eq,<%= context.eurocode %>)",
      "headers": {
        "xc-token": "<%= iparam.nocodb_token %>"
      }
    }
  }
}
```

**Template variables:**
- `<%= iparam.xxx %>` - Installation parameter value
- `<%= context.xxx %>` - Runtime context passed from `invokeTemplate()`
- `<%= encode(value) %>` - Base64 encode (for Basic auth)

---

## Adding New Validation Rules

Validation rules are defined in `app/scripts/app.js`. Each rule validates Eurocode/OEM data before updating Freshdesk.

### Rule Structure

Rules are defined in the `VALIDATION_RULES` object:

```javascript
const VALIDATION_RULES = {
  ruleName: {
    name: 'Human Readable Name',
    description: 'What this rule does',
    check: (eurocode, oem, clientName, industry) => {
      // Return { valid: true } if passes
      // Return { valid: false, error: 'message' } if fails
      // Return { valid: true, warning: 'message' } for non-blocking warnings
      // Return { valid: true, transformed: 'newValue' } to modify the value
    }
  }
};
```

### Adding a New Rule

1. Open `app/scripts/app.js`

2. Find the `VALIDATION_RULES` object

3. Add your new rule:

```javascript
const VALIDATION_RULES = {
  // ... existing rules ...

  myNewRule: {
    name: 'My New Rule',
    description: 'Validates something specific',
    check: (eurocode, oem, clientName, industry) => {
      // Example: Reject if eurocode starts with "TEST"
      if (eurocode.startsWith('TEST')) {
        return { valid: false, error: 'Test eurocodes not allowed' };
      }
      return { valid: true };
    }
  }
};
```

4. The rule is automatically applied during lookup

### Rule Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `eurocode` | The entered Eurocode value | `"3371AGNBL"` |
| `oem` | OEM1 value from database | `"ABC123"` |
| `clientName` | Contact's company name | `"CARGLASS"` |
| `industry` | Industry field from database | `"US"` |

### Rule Return Values

```javascript
// Pass - continue processing
return { valid: true };

// Pass with info message - show feedback to user about logic applied
return { valid: true, info: 'Customer is AGC, applying AGC rules' };

// Pass with warning - continue but show warning
return { valid: true, warning: 'This eurocode is deprecated' };

// Pass with transformation - use modified value
return { valid: true, transformed: oem.substring(1) };

// Pass with info and transformation - explain what happened
return { valid: true, transformed: record.NAGS, info: 'US industry detected, using NAGS code' };

// Fail - stop processing and show error
return { valid: false, error: 'Invalid eurocode format' };
```

**Message types:**
- `info` - Informational feedback shown to user (gray text, explains logic)
- `warning` - Non-blocking warning (orange text)
- `error` - Blocking error that stops processing (red text)

### Existing Rules Reference

| Rule | Trigger | Behavior |
|------|---------|----------|
| `clientContext` | Always | Shows customer name and industry in info panel |
| `wrongEurocode` | Always | Rejects eurocodes containing `!` |
| `noNPrefix` | Industry ≠ US, Client ≠ AGC | Eurocode cannot start with "N" (Master Rule) |
| `doubleOem` | OEM = "X" | Rejects if eurocode is also "X" |
| `carglass` | Client = CARGLASS | 5th character must be position: A(Front), C(Front), F(Side), L(Side), R(Side), B(Back), G(Roof) |
| `agc` | Client = AGC | Rejects if OEM/EC contains `/` or OEM/EC starts with `N` |
| `usIndustry` | Industry = US | Autofills with NAGS if available, else uses Eurocode |
| `oemPrefix` | OEM starts with "A" | Reports that OEM has "A" prefix (same glass with/without A) |

---

## Testing Guide

### Manual Testing Checklist

Before deployment, test these scenarios:

#### Basic Functionality
- [ ] Enter valid Eurocode - OEM1 returns and autofills
- [ ] Enter non-existent Eurocode - "Not found" message
- [ ] Empty input - Validation error shown
- [ ] API timeout - Error handled gracefully

#### Validation Rules
- [ ] Eurocode with `!` - Error shown, no autofill
- [ ] CARGLASS client + valid position - Passes
- [ ] CARGLASS client + invalid position - Error shown
- [ ] AGC client + EC starting with `N` - Error shown
- [ ] AGC client + EC containing `/` - Error shown
- [ ] Multiple OEMs returned - Correct selection based on rules

#### Edge Cases
- [ ] Contact has no company_name - Uses empty string
- [ ] Multiple matching database records - First result used
- [ ] Very long Eurocode input - Handles gracefully
- [ ] Special characters in input - Properly escaped

### Using Browser DevTools

1. Open Chrome DevTools (F12)
2. Go to the **Console** tab
3. Look for:
   - `Querying NocoDB for Eurocode: XXX` - Confirms lookup started
   - `NocoDB response: {...}` - Shows database response
   - `Validation result: {...}` - Shows rule results
   - Any red error messages - Indicates failures

4. Go to the **Network** tab to inspect API calls:
   - Filter by "nocodb" to see database queries
   - Filter by "freshdesk" to see ticket updates

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Request blocked" | Mixed content | Enable insecure content in Chrome |
| "401 Unauthorized" | Invalid API key | Check iparams configuration |
| "Template not found" | Missing manifest entry | Add request to `manifest.json` |
| "Network error" | CORS or connectivity | Check NocoDB API endpoint |

---

## Deployment

### Step 1: Validate

Run the FDK validator to check for issues:

```bash
fdk validate
```

Fix any errors before proceeding.

### Step 2: Pack

Create a deployable package:

```bash
fdk pack
```

This creates a `.zip` file in the `dist/` folder.

### Step 3: Upload to Freshdesk

1. Log into Freshdesk as an admin
2. Go to **Admin** > **Apps** > **Custom Apps**
3. Click **Upload Custom App**
4. Select the `.zip` file from `dist/`
5. Follow the installation wizard
6. Enter your installation parameters (domain, API keys)
7. Click **Install**

### Step 4: Verify

1. Open a ticket in Freshdesk
2. Check that the app loads in the sidebar
3. Test the Eurocode lookup functionality
4. Verify custom field updates work

---

## Troubleshooting

### App Not Showing in Sidebar

1. Check `manifest.json` has correct location configured
2. Verify installation completed without errors
3. Clear browser cache and refresh
4. Check browser console for JavaScript errors

### API Calls Failing

1. Verify API keys are correct in installation parameters
2. Check NocoDB table ID matches `requests.json`
3. Ensure NocoDB API token has read permissions
4. Check Freshdesk API key has ticket update permissions

### Validation Rules Not Working

1. Check rule is properly defined in `VALIDATION_RULES`
2. Add `console.log` statements to debug rule execution
3. Verify client name matches exactly (case-sensitive)
4. Check rule return value format

### Changes Not Appearing

1. Restart `fdk run` if you changed config files
2. Hard refresh browser (Ctrl+Shift+R)
3. Clear Freshdesk app cache
4. Check for JavaScript syntax errors in console

---

## Quick Reference

### FDK Commands

| Command | Purpose |
|---------|---------|
| `fdk run` | Start local development server |
| `fdk validate` | Check app for issues |
| `fdk pack` | Create deployment package |
| `fdk version` | Show FDK version |

### Freshworks Crayons Components

The app uses Freshworks Crayons web components:

```html
<fw-input id="eurocodeInput" placeholder="Enter Eurocode"></fw-input>
<fw-button id="lookupBtn" color="primary">Lookup</fw-button>
```

Event handling:
```javascript
button.addEventListener('fwClick', handler);
input.addEventListener('fwChange', handler);
```

### Data Access

```javascript
// Get ticket data
const ticketData = await client.data.get('ticket');
const ticketId = ticketData.ticket.id;

// Get contact data
const contactData = await client.data.get('contact');
const companyName = contactData.contact.company_name;

// Invoke API template
const response = await client.request.invokeTemplate('templateName', {
  context: { key: 'value' },
  body: JSON.stringify(payload)
});
```

---

*Last updated: January 2026*
