const API_KEY = '33e5561ademsh4dbb6ed6172afb7p191513jsnf7962a038564';
const API_HOST = 'visa-requirement.p.rapidapi.com';

let countriesData = [];

// Fetch all countries from API
async function fetchCountries() {
    const response = await fetch('https://visa-requirement.p.rapidapi.com/v2/destinations', {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': API_KEY,
            'X-RapidAPI-Host': API_HOST
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch countries');
    }

    return await response.json();
}

// Populate country dropdowns
async function initCountries() {
    try {
        const data = await fetchCountries();
        countriesData = data.data || data;

        const fromSelect = document.getElementById('from-country');
        const toSelect = document.getElementById('to-country');

        // Sort countries alphabetically
        const sorted = [...countriesData].sort((a, b) => a.name.localeCompare(b.name));

        const options = sorted.map(c => 
            `<option value="${c.iso_alpha2}">${c.name}</option>`
        ).join('');

        fromSelect.innerHTML = options;
        toSelect.innerHTML = options;

        // Set defaults
        fromSelect.value = 'US';
        toSelect.value = 'JP';

        updateFlag('from');
        updateFlag('to');
    } catch (err) {
        console.error('Failed to load countries:', err);
    }
}

// Convert country code to flag emoji
function codeToFlag(code) {
    if (!code || code.length !== 2) return '🏳️';
    const codePoints = code
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

// Update flag display
function updateFlag(type) {
    const select = document.getElementById(`${type}-country`);
    const flag = document.getElementById(`${type}-flag`);
    flag.textContent = codeToFlag(select.value);
}

// Event listeners for flag updates
document.getElementById('from-country').addEventListener('change', () => updateFlag('from'));
document.getElementById('to-country').addEventListener('change', () => updateFlag('to'));

// Fetch visa data from API
async function fetchVisaData(passport, destination) {
    const response = await fetch('https://visa-requirement.p.rapidapi.com/v2/visa/check', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': API_KEY,
            'X-RapidAPI-Host': API_HOST
        },
        body: JSON.stringify({ passport, destination })
    });

    if (!response.ok) {
        throw new Error('Failed to fetch visa data');
    }

    return await response.json();
}

// Map API color to status class
function getStatusClass(color) {
    const map = {
        green: 'visa-free',
        blue: 'evisa',
        yellow: 'evisa',
        red: 'visa-required'
    };
    return map[color] || 'evisa';
}

// Render results with 5 pillars
function renderResults(data) {
    console.log('API Response:', JSON.stringify(data, null, 2));
    const d = data.data;
    const primary = d.visa_rules?.primary_rule || {};
    const secondary = d.visa_rules?.secondary_rule;
    const exception = d.visa_rules?.exception_rule;
    const registration = d.mandatory_registration;

    const statusClass = getStatusClass(primary.color);
    const statusText = primary.name || 'Visa Required';
    const duration = primary.duration || 'Check official sources';
    const validity = d.destination?.passport_validity || 'Minimum 6 months beyond stay';

    // Build visa options
    const visaOptions = [];
    if (primary.name) {
        visaOptions.push({ name: primary.name, duration: primary.duration, link: primary.link });
    }
    if (secondary?.name) {
        visaOptions.push({ name: secondary.name, duration: secondary.duration, link: secondary.link });
    }

    // Pro tip from exception rule
    let proTip = '';
    if (exception?.full_text) {
        proTip = exception.full_text;
    }

    document.getElementById('results').innerHTML = `
        <div class="summary-card">
            <div class="status-badge ${statusClass}">
                <span class="status-icon">${statusClass === 'visa-free' ? '✅' : statusClass === 'visa-required' ? '🔴' : '📋'}</span>
                <span class="status-text">${statusText}</span>
            </div>
            <div class="summary-details">
                <div class="detail-item">
                    <span class="detail-label">Stay Duration</span>
                    <span class="detail-value">${duration}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Passport Validity</span>
                    <span class="detail-value">${validity}</span>
                </div>
            </div>
        </div>

        ${proTip ? `
        <div class="pro-tip-card">
            <span class="pro-tip-icon">💡</span>
            <div class="pro-tip-content">
                <strong>Pro Tip</strong>
                <p>${proTip}</p>
            </div>
        </div>
        ` : ''}

        <div class="pillars-grid">
            <!-- Pillar 1: Identity & Travel Eligibility -->
            <div class="pillar-card">
                <div class="pillar-header">
                    <span class="pillar-number">1</span>
                    <div>
                        <h3>🛂 Identity & Travel Eligibility</h3>
                        <p class="pillar-subtitle">Proof of who you are</p>
                    </div>
                </div>
                <ul class="pillar-list">
                    <li>
                        <strong>Valid Passport</strong>
                        <span>${validity}</span>
                    </li>
                    <li>
                        <strong>Blank Pages</strong>
                        <span>At least 2 blank pages required</span>
                    </li>
                    <li>
                        <strong>Passport Photo</strong>
                        <span>35mm × 45mm, white background, 80% face</span>
                    </li>
                    <li>
                        <strong>National ID</strong>
                        <span>Color copy may be required</span>
                    </li>
                </ul>
            </div>

            <!-- Pillar 2: Financial Stability -->
            <div class="pillar-card">
                <div class="pillar-header">
                    <span class="pillar-number">2</span>
                    <div>
                        <h3>💰 Financial Stability</h3>
                        <p class="pillar-subtitle">Proof of funds</p>
                    </div>
                </div>
                <ul class="pillar-list">
                    <li>
                        <strong>Bank Statements</strong>
                        <span>Last 3-6 months, bank stamped</span>
                    </li>
                    <li>
                        <strong>Income Tax Returns</strong>
                        <span>Last 2-3 years of ITR filings</span>
                    </li>
                    <li>
                        <strong>Salary Slips</strong>
                        <span>Last 3 months from employer</span>
                    </li>
                    ${d.funds_requirement ? `
                    <li class="highlight">
                        <strong>Border Check</strong>
                        <span>Proof of funds verified at entry</span>
                    </li>
                    ` : ''}
                </ul>
            </div>

            <!-- Pillar 3: Purpose & Intent -->
            <div class="pillar-card">
                <div class="pillar-header">
                    <span class="pillar-number">3</span>
                    <div>
                        <h3>✈️ Purpose & Intent to Return</h3>
                        <p class="pillar-subtitle">Why you're traveling</p>
                    </div>
                </div>
                <ul class="pillar-list">
                    <li>
                        <strong>Flight Itinerary</strong>
                        <span>${d.return_ticket ? 'Round-trip ticket required' : 'Confirmed booking recommended'}</span>
                    </li>
                    <li>
                        <strong>Hotel Reservations</strong>
                        <span>Proof for each night of stay</span>
                    </li>
                    <li>
                        <strong>Cover Letter</strong>
                        <span>Purpose of trip & daily itinerary</span>
                    </li>
                    <li>
                        <strong>Employment NOC</strong>
                        <span>Letter from employer granting leave</span>
                    </li>
                </ul>
            </div>

            <!-- Pillar 4: Health & Security -->
            <div class="pillar-card">
                <div class="pillar-header">
                    <span class="pillar-number">4</span>
                    <div>
                        <h3>🏥 Health & Security</h3>
                        <p class="pillar-subtitle">Medical requirements</p>
                    </div>
                </div>
                <ul class="pillar-list">
                    ${registration ? `
                    <li class="highlight">
                        <strong>${registration.name}</strong>
                        <span>Submit 24-72 hours before arrival</span>
                    </li>
                    ` : ''}
                    <li>
                        <strong>Yellow Fever</strong>
                        <span>${d.yellowfever_vaccination_requirement ? 'Certificate required' : 'Check if arriving from high-risk zone'}</span>
                    </li>
                    <li>
                        <strong>Polio Vaccination</strong>
                        <span>${d.polio_vaccination_requirement ? 'Certificate required' : 'May be required'}</span>
                    </li>
                    <li>
                        <strong>Travel Insurance</strong>
                        <span>Min $30,000-$50,000 coverage recommended</span>
                    </li>
                </ul>
            </div>

            <!-- Pillar 5: Filing Process -->
            <div class="pillar-card wide">
                <div class="pillar-header">
                    <span class="pillar-number">5</span>
                    <div>
                        <h3>📝 Filing Process</h3>
                        <p class="pillar-subtitle">Timeline & application</p>
                    </div>
                </div>
                <div class="filing-grid">
                    <div class="filing-section">
                        <h4>Visa Options Available</h4>
                        <ul class="pillar-list">
                            ${visaOptions.map(opt => `
                            <li>
                                <strong>${opt.name}</strong>
                                <span>${opt.duration || 'Duration varies'}</span>
                            </li>
                            `).join('')}
                        </ul>
                    </div>
                    <div class="filing-section">
                        <h4>Processing Times</h4>
                        <ul class="pillar-list">
                            <li>
                                <strong>eVisa / eTA</strong>
                                <span>10 minutes - 3 days</span>
                            </li>
                            <li>
                                <strong>Sticker Visa</strong>
                                <span>14-30 days (embassy visit)</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Official Links -->
        <div class="links-section">
            <h3>🔗 Official Links</h3>
            <div class="link-buttons">
                ${visaOptions.filter(o => o.link).map((opt, i) => `
                    <a href="${opt.link}" target="_blank" class="link-btn ${i === 0 ? 'primary' : 'secondary'}">
                        <span>Apply: ${opt.name}</span>
                        ${i === 0 ? '<span class="link-badge">Official</span>' : ''}
                    </a>
                `).join('')}
                ${registration?.link ? `
                    <a href="${registration.link}" target="_blank" class="link-btn secondary">
                        <span>${registration.name}</span>
                    </a>
                ` : ''}
                ${d.destination?.embassy_url ? `
                    <a href="${d.destination.embassy_url}" target="_blank" class="link-btn secondary">
                        <span>Embassy Website</span>
                    </a>
                ` : ''}
                ${!visaOptions.some(o => o.link) && !registration?.link && !d.destination?.embassy_url ? 
                    '<p style="color: var(--text-muted);">No official links available</p>' : ''}
            </div>
        </div>
    `;
}

// Show loading state
function showLoading() {
    document.getElementById('results').innerHTML = `
        <div class="summary-card" style="justify-content: center;">
            <span style="color: var(--text-muted);">Loading visa requirements...</span>
        </div>
    `;
}

// Show error
function showError(msg) {
    document.getElementById('results').innerHTML = `
        <div class="summary-card" style="border-color: rgba(239, 68, 68, 0.3);">
            <div class="status-badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                <span>❌</span>
                <span>${msg}</span>
            </div>
        </div>
    `;
}

// Search button handler
document.getElementById('search-btn').addEventListener('click', async function() {
    const passport = document.getElementById('from-country').value;
    const destination = document.getElementById('to-country').value;

    if (!passport || !destination) {
        showError('Please select both countries');
        return;
    }

    if (passport === destination) {
        showError('Passport and destination cannot be the same country');
        return;
    }

    showLoading();

    try {
        const data = await fetchVisaData(passport, destination);
        
        if (data.error) {
            showError(data.message || 'Failed to fetch visa data');
            return;
        }
        
        renderResults(data);
    } catch (err) {
        showError('Failed to fetch visa data. Please try again.');
        console.error(err);
    }
});

// Initialize on page load
initCountries();
