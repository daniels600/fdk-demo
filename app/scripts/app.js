let client;
let listenersInitialized = false;

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const VIN_EUROCODE_PREFIXES = {
  '1F': ['35', '37', 'AF'],
  '2F': ['35', '37', 'AF'],
  '3F': ['35', '37', 'AF'],
  '4JG': ['53', '54', '55', 'CM'],
  '5X': ['44', '41'],
  'ABM': ['23', '24'],
  'KM': ['44', '41'],
  'KN': ['44', '41'],
  'MAL': ['44', '41'],
  'NLH': ['44', '41'],
  'NLJ': ['44', '41'],
  'NM0': ['35', '37', 'AF'],
  'SA': ['70', '43'],
  'SJN': ['59', '60', '61'],
  'TMA': ['44', '41'],
  'U5': ['44', '41'],
  'U6': ['44', '41'],
  'UU1': ['70', '72', '73', '93'],
  'VF1': ['70', '72', '73', '93'],
  'VF3': ['65'],
  'VF6': ['70', '72', '73', '93'],
  'VF7': ['27'],
  'VR1': ['27'],
  'VR3': ['65'],
  'VR7': ['27'],
  'VS6': ['35', '37', 'AF'],
  'VX': ['62', '63'],
  'W0L': ['62', '63'],
  'W0V': ['62', '63'],
  'W1N': ['53', '54', '55', 'CM'],
  'W1T': ['53', '54', '55', 'CM'],
  'W1V': ['53', '54', '55', 'CM'],
  'WBA': ['23', '24'],
  'WBS': ['23', '24'],
  'WBX': ['23', '24'],
  'WBY': ['23', '24'],
  'WD3': ['53', '54', '55', 'CM'],
  'WD4': ['53', '54', '55', 'CM'],
  'WDA': ['53', '54', '55', 'CM'],
  'WDB': ['53', '54', '55', 'CM'],
  'WDC': ['53', '54', '55', 'CM'],
  'WDD': ['53', '54', '55', 'CM'],
  'WDF': ['53', '54', '55', 'CM'],
  'WF0': ['35', '37', 'AF'],
  'WMW': ['23', '24'],
  'WMX': ['53', '54', '55', 'CM'],
  'WMZ': ['23', '24'],
  'WP': ['67'],
  'WV': ['8'],
  'YV1': ['88'],
  'ZAR': ['20'],
  'ZFA': ['33', '37']
};

const VALIDATION_RULES = {
  clientContext: {
    name: 'Client Context',
    description: 'Reports the customer context for the lookup',
    check: (oem, eurocode, clientName, industry, record, vin) => {
      void oem;
      void eurocode;
      void record;
      const customer = clientName || 'Unknown';
      const ind = industry || 'Standard';
      const vinDisplay = vin || 'N/A';
      return { valid: true, info: `Customer: ${customer} | Industry: ${ind} | VIN: ${vinDisplay}` };
    }
  },

  wrongOem: {
    name: 'Wrong OEM Check',
    description: 'Rejects OEM containing exclamation mark',
    check: (oem) => {
      if (oem.includes('!')) {
        return { valid: false, error: 'Invalid OEM: contains "!" character' };
      }
      return { valid: true };
    }
  },

  doubleOem: {
    name: 'Double OEM Check',
    description: 'Rejects if OEM is X and eurocode is also X',
    check: (oem, eurocode) => {
      if (oem === 'X' && eurocode === 'X') {
        return { valid: false, error: 'Double OEM validation failed: both OEM and Eurocode are X' };
      }
      return { valid: true };
    }
  },

  carglass: {
    name: 'CARGLASS Position Check',
    description: 'For CARGLASS clients, validates 5th character of returned eurocode is position indicator',
    check: (oem, eurocode, clientName) => {
      void oem;
      const normalizedClientName = (clientName || '').toUpperCase();
      if (normalizedClientName !== 'CARGLASS') {
        return { valid: true };
      }
      if (!eurocode || eurocode.length < 5) {
        return { valid: true, info: 'CARGLASS validation: Eurocode too short for position check' };
      }
      const positionChars = { A: 'FRONT', C: 'FRONT', F: 'SIDE', L: 'SIDE', R: 'SIDE', B: 'BACK', G: 'ROOF' };
      const fifthChar = eurocode.charAt(4).toUpperCase();
      const position = positionChars[fifthChar];
      if (!position) {
        return { valid: true, info: `CARGLASS: 5th character "${fifthChar}" is not a position indicator (A/C/F/L/R/B/G)` };
      }
      return { valid: true, info: `Customer is CARGLASS, position: ${position} (char: ${fifthChar})` };
    }
  },

  agc: {
    name: 'AGC Safety Check',
    description: 'For AGC clients, validates OEM does not contain "/" or start with "N"',
    check: (oem, eurocode, clientName) => {
      void eurocode;
      const normalizedClientName = (clientName || '').toUpperCase();
      if (normalizedClientName !== 'AGC') {
        return { valid: true };
      }
      if (oem.includes('/')) {
        return { valid: false, error: 'AGC validation: OEM cannot contain "/" character' };
      }
      if (oem.toUpperCase().startsWith('N')) {
        return { valid: false, error: 'AGC validation: OEM cannot start with "N"' };
      }
      return { valid: true, info: 'Customer is AGC, OEM safety checks passed' };
    }
  },

  usIndustry: {
    name: 'US Industry Autofill',
    description: 'For US industry, autofills with NAGS if available',
    check: (oem, eurocode, clientName, industry, record) => {
      void oem;
      void clientName;
      if (industry !== 'US') {
        return { valid: true };
      }
      if (record && record.Nags) {
        return { valid: true, transformed: record.Nags, info: `US industry detected, using NAGS code: ${record.Nags}` };
      }
      return { valid: true, transformed: eurocode, info: 'US industry detected, no NAGS available - using Eurocode' };
    }
  },

  oemPrefix: {
    name: 'OEM "A" Prefix Handling',
    description: 'Handles leading "A" prefix in OEM values',
    check: (oem) => {
      if (oem.startsWith('A') && oem.length > 1) {
        return { valid: true, info: `OEM has "A" prefix (${oem})` };
      }
      return { valid: true };
    }
  },

  vinEurocodeValidation: {
    name: 'VIN-Eurocode Prefix Validation',
    description: 'Validates returned Eurocode prefix matches VIN prefix rules (warning only)',
    check: (oem, eurocode, clientName, industry, record, vin) => {
      void oem;
      void clientName;
      void record;
      if (industry === 'US') {
        return { valid: true, info: 'VIN validation skipped (US industry)' };
      }
      if (!vin || vin.length < 2) {
        return { valid: true, info: 'VIN validation skipped (no VIN in ticket subject)' };
      }
      if (!eurocode) {
        return { valid: true, info: 'VIN validation skipped (no eurocode returned)' };
      }
      const vinUpper = vin.toUpperCase();
      const ecUpper = eurocode.toUpperCase();
      let matchedVinPrefix = null;
      let validEcPrefixes = null;
      const vinPrefixes = Object.keys(VIN_EUROCODE_PREFIXES).sort((a, b) => b.length - a.length);
      for (const vinPrefix of vinPrefixes) {
        if (vinUpper.startsWith(vinPrefix)) {
          matchedVinPrefix = vinPrefix;
          validEcPrefixes = VIN_EUROCODE_PREFIXES[vinPrefix];
          break;
        }
      }
      if (!matchedVinPrefix) {
        return { valid: true, info: `VIN "${vin}" has no specific prefix rules` };
      }
      const allValidPrefixes = [...validEcPrefixes, 'F', 'D'];
      const ecStartsWithValid = allValidPrefixes.some(prefix => ecUpper.startsWith(prefix));
      if (!ecStartsWithValid) {
        return {
          valid: true,
          warning: `VIN "${matchedVinPrefix}" typically expects Eurocode to start with: ${allValidPrefixes.join(', ')}. Got: "${ecUpper.substring(0, 4)}"`
        };
      }
      const matchedEcPrefix = allValidPrefixes.find(prefix => ecUpper.startsWith(prefix));
      return { valid: true, info: `VIN ${matchedVinPrefix} → Eurocode prefix "${matchedEcPrefix}" valid` };
    }
  }
};

function applyValidationRules(oem, eurocode, clientName, industry, record, vin) {
  const errors = [];
  const warnings = [];
  const infos = [];
  let transformedValue = eurocode;
  let hasTransformation = false;

  for (const rule of Object.values(VALIDATION_RULES)) {
    const result = rule.check(oem, eurocode, clientName, industry, record, vin);

    if (!result.valid) {
      errors.push(`[${rule.name}] ${result.error}`);
    }

    if (result.warning) {
      warnings.push(`[${rule.name}] ${result.warning}`);
    }

    if (result.info) {
      infos.push(result.info);
    }

    if (result.transformed) {
      if (hasTransformation) {
        warnings.push(`[${rule.name}] Overriding previous transformation with: ${result.transformed}`);
      }
      transformedValue = result.transformed;
      hasTransformation = true;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
    transformedValue
  };
}

init();

async function init() {
  client = await app.initialized();
  client.events.on('app.activated', renderText);
}

async function renderText() {
  const textElement = document.getElementById('apptext');
  const contactData = await client.data.get('contact');
  const {
    contact: { name }
  } = contactData;

  // Log all available ticket properties
  const ticketData = await client.data.get('ticket');
  console.log('=== TICKET DATA ===');
  console.log('Full ticket object:', ticketData);
  console.log('Ticket properties:', ticketData.ticket);
  console.log('Custom fields:', ticketData.ticket.custom_fields);
  console.log('===================');

  // Also log contact data for reference
  console.log('=== CONTACT DATA ===');
  console.log('Full contact object:', contactData);
  console.log('Contact properties:', contactData.contact);
  console.log('====================');

  textElement.textContent = `Ticket is created by ${name}`;

  if (!listenersInitialized) {
    const lookupOEMBtn = document.getElementById('lookupOEMBtn');
    if (lookupOEMBtn) {
      lookupOEMBtn.addEventListener('fwClick', lookupOEM);
    }

    const closeTicketBtn = document.getElementById('closeTicketBtn');
    if (closeTicketBtn) {
      closeTicketBtn.addEventListener('fwClick', closeTicket);
    }
    listenersInitialized = true;
  }
}

async function lookupOEM() {
  const statusMessage = document.getElementById('statusMessage');
  const inputElement = document.getElementById('oemInput');
  const infoDisplay = document.getElementById('infoDisplay');
  const lookupBtn = document.getElementById('lookupOEMBtn');
  const oem = inputElement.value.trim();

  if (!oem) {
    statusMessage.textContent = 'Please enter an OEM code';
    statusMessage.style.color = 'orange';
    return;
  }

  const MAX_OEM_LENGTH = 50;
  if (oem.length > MAX_OEM_LENGTH) {
    statusMessage.textContent = `OEM code too long (max ${MAX_OEM_LENGTH} characters)`;
    statusMessage.style.color = 'orange';
    return;
  }

  const oemPattern = /^[A-Za-z0-9\-_]+$/;
  if (!oemPattern.test(oem)) {
    statusMessage.textContent = 'Invalid OEM format (only letters, numbers, hyphens, underscores allowed)';
    statusMessage.style.color = 'orange';
    return;
  }

  lookupBtn.disabled = true;
  statusMessage.textContent = 'Looking up OEM...';
  statusMessage.style.color = 'blue';

  try {
    const contactData = await client.data.get('contact');
    const clientName = contactData.contact.company_name || '';

    const ticketData = await client.data.get('ticket');
    const vin = ticketData.ticket.subject || '';

    const response = await client.request.invokeTemplate('queryNocoDBByOEM', {
      context: { oem: encodeURIComponent(oem) }
    });
    const data = JSON.parse(response.response);

    if (!data.list || data.list.length === 0) {
      statusMessage.textContent = 'No matching OEM found in database';
      statusMessage.style.color = 'orange';
      infoDisplay.innerHTML = '';
      return;
    }

    const record = data.list[0];
    const eurocode = record.eurocode || '';
    const manufacturer = record.Manufacten || '';
    const model = record.Modelen || '';
    const industry = record.Industry || '';

    if (!eurocode) {
      statusMessage.textContent = 'OEM found but no Eurocode available';
      statusMessage.style.color = 'orange';
      infoDisplay.innerHTML = `<strong>OEM:</strong> ${escapeHtml(oem)}<br><strong>Eurocode:</strong> N/A`;
      return;
    }

    const validation = applyValidationRules(oem, eurocode, clientName, industry, record, vin);

    if (!validation.valid) {
      statusMessage.innerHTML = escapeHtml(validation.errors.join('\n')).replace(/\n/g, '<br>');
      statusMessage.style.color = 'red';
      infoDisplay.innerHTML = `<strong>OEM:</strong> ${escapeHtml(oem)}<br><strong>Eurocode:</strong> ${escapeHtml(eurocode)}<br><strong>Status:</strong> Validation failed`;
      return;
    }

    const displayEurocode = validation.transformedValue;
    let infoHtml = `<strong>OEM:</strong> ${escapeHtml(oem)}<br><strong>Eurocode:</strong> ${escapeHtml(displayEurocode)}<br><strong>Manufacturer:</strong> ${escapeHtml(manufacturer)}<br><strong>Model:</strong> ${escapeHtml(model)}`;
    if (validation.infos.length > 0) {
      const infosHtml = validation.infos.map(i => `• ${escapeHtml(i)}`).join('<br>');
      infoHtml += `<br><br><span style="color: #666; font-size: 11px;">${infosHtml}</span>`;
    }
    infoDisplay.innerHTML = infoHtml;

    const ticket = ticketData.ticket;

    const updatePayload = {
      custom_fields: {
        cf_eurocode: displayEurocode,
        cf_manufacturer: manufacturer,
        cf_model: model
      }
    };

    await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticket.id },
      body: JSON.stringify(updatePayload)
    });

    try {
      await client.interface.trigger("setValue", {
        id: "cf_eurocode",
        value: displayEurocode
      });
      await client.interface.trigger("setValue", {
        id: "cf_manufacturer",
        value: manufacturer
      });
      await client.interface.trigger("setValue", {
        id: "cf_model",
        value: model
      });
    } catch (uiError) {
      // UI setValue not supported in this context
    }

    let successMsg = `Updated: Eurocode=${escapeHtml(displayEurocode)}, Manufacturer=${escapeHtml(manufacturer)}, Model=${escapeHtml(model)}`;
    if (validation.warnings.length > 0) {
      const warningsHtml = validation.warnings.map(w => escapeHtml(w)).join('<br>');
      successMsg += `<br><small style="color: orange;">${warningsHtml}</small>`;
    }
    statusMessage.innerHTML = successMsg;
    statusMessage.style.color = 'green';
    inputElement.value = '';

    setTimeout(() => {
      statusMessage.innerHTML = '';
    }, 5000);

  } catch (error) {
    console.error('OEM lookup error:', error);

    let errorMsg = 'Lookup failed';
    if (error.response) {
      try {
        const errData = JSON.parse(error.response);
        errorMsg = errData.message || errData.description || errorMsg;
      } catch (e) {
        // Use default error message
      }
    }
    statusMessage.textContent = `Error: ${errorMsg}`;
    statusMessage.style.color = 'red';
  } finally {
    lookupBtn.disabled = false;
  }
}

async function closeTicket() {
  const statusMessage = document.getElementById('statusMessage');
  const closeBtn = document.getElementById('closeTicketBtn');

  closeBtn.disabled = true;
  statusMessage.textContent = 'Closing ticket...';
  statusMessage.style.color = 'blue';

  try {
    const ticketData = await client.data.get('ticket');
    const ticket = ticketData.ticket;

    if (ticket.status === 5) {
      statusMessage.textContent = 'Ticket is already closed';
      statusMessage.style.color = 'orange';
      return;
    }

    const fieldsResponse = await client.request.invokeTemplate('getTicketFields');
    const fields = JSON.parse(fieldsResponse.response);

    const apiField = fields.find(f => f.label === 'API' || f.name === 'cf_api');

    const updatePayload = { status: 5 };

    if (apiField) {
      const fieldName = apiField.name;
      const currentValue = ticket.custom_fields?.[fieldName];

      if (!currentValue || currentValue.trim() === '') {
        updatePayload.custom_fields = {
          [fieldName]: 'Closed via app'
        };
      }
    }

    await client.request.invokeTemplate('updateTicket', {
      context: { ticket_id: ticket.id },
      body: JSON.stringify(updatePayload)
    });

    try {
      await client.interface.trigger("setValue", {
        id: "status",
        value: 5
      });
    } catch (uiError) {
      // UI update not supported in this context
    }

    statusMessage.textContent = 'Ticket closed!';
    statusMessage.style.color = 'green';

    setTimeout(() => {
      statusMessage.textContent = '';
    }, 5000);

  } catch (error) {
    console.error('Error closing ticket:', error);

    let errorMsg = 'Failed to close';
    if (error.response) {
      try {
        const errData = JSON.parse(error.response);
        if (errData.description) {
          errorMsg = errData.description;
        } else if (errData.errors) {
          errorMsg = Object.values(errData.errors).flat().join(', ');
        }
      } catch (e) {
        // Use default error message
      }
    }

    statusMessage.textContent = `Error: ${errorMsg}`;
    statusMessage.style.color = 'red';
  } finally {
    closeBtn.disabled = false;
  }
}
