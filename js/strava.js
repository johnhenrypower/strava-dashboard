/**
 * Strava API Client
 * Handles authentication and API calls to Strava
 */

const StravaAPI = (function() {
    // Configuration
    const CONFIG = {
        clientId: '189937',
        workerUrl: 'https://strava-auth.johnhenry-pwr.workers.dev',
        redirectUri: 'https://strava.johnhpower.com',
        scope: 'read,activity:read_all',
        stravaApiBase: 'https://www.strava.com/api/v3'
    };

    // Storage keys
    const STORAGE_KEYS = {
        accessToken: 'strava_access_token',
        refreshToken: 'strava_refresh_token',
        tokenExpiry: 'strava_token_expiry',
        athleteId: 'strava_athlete_id',
        athleteData: 'strava_athlete_data',
        activitiesCache: 'strava_activities_cache',
        cacheTimestamp: 'strava_cache_timestamp'
    };

    // Cache duration: 5 minutes
    const CACHE_DURATION = 5 * 60 * 1000;

    /**
     * Get stored tokens
     */
    function getTokens() {
        return {
            accessToken: localStorage.getItem(STORAGE_KEYS.accessToken),
            refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken),
            tokenExpiry: parseInt(localStorage.getItem(STORAGE_KEYS.tokenExpiry) || '0'),
            athleteId: localStorage.getItem(STORAGE_KEYS.athleteId)
        };
    }

    /**
     * Store tokens
     */
    function storeTokens(accessToken, refreshToken, expiresAt, athleteId) {
        localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
        localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
        localStorage.setItem(STORAGE_KEYS.tokenExpiry, expiresAt.toString());
        if (athleteId) {
            localStorage.setItem(STORAGE_KEYS.athleteId, athleteId.toString());
        }
    }

    /**
     * Clear all stored data
     */
    function clearStorage() {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    }

    /**
     * Check if user is authenticated
     */
    function isAuthenticated() {
        const tokens = getTokens();
        return !!(tokens.accessToken && tokens.refreshToken);
    }

    /**
     * Check if token is expired or about to expire (within 5 minutes)
     */
    function isTokenExpired() {
        const tokens = getTokens();
        const now = Math.floor(Date.now() / 1000);
        return tokens.tokenExpiry < (now + 300); // 5 minute buffer
    }

    /**
     * Redirect to Strava OAuth
     */
    function authorize() {
        const params = new URLSearchParams({
            client_id: CONFIG.clientId,
            redirect_uri: CONFIG.redirectUri,
            response_type: 'code',
            scope: CONFIG.scope,
            approval_prompt: 'auto'
        });

        window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`;
    }

    /**
     * Handle OAuth callback - exchange code for tokens via Worker
     */
    async function handleCallback(code) {
        const response = await fetch(`${CONFIG.workerUrl}/auth/callback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to exchange authorization code');
        }

        const data = await response.json();

        storeTokens(
            data.access_token,
            data.refresh_token,
            data.expires_at,
            data.athlete?.id
        );

        if (data.athlete) {
            localStorage.setItem(STORAGE_KEYS.athleteData, JSON.stringify(data.athlete));
        }

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        return data;
    }

    /**
     * Refresh access token via Worker
     */
    async function refreshAccessToken() {
        const tokens = getTokens();

        if (!tokens.refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await fetch(`${CONFIG.workerUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: tokens.refreshToken })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to refresh token');
        }

        const data = await response.json();

        storeTokens(
            data.access_token,
            data.refresh_token,
            data.expires_at,
            tokens.athleteId
        );

        return data.access_token;
    }

    /**
     * Get a valid access token (refresh if needed)
     */
    async function getValidAccessToken() {
        if (!isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        if (isTokenExpired()) {
            return await refreshAccessToken();
        }

        return getTokens().accessToken;
    }

    /**
     * Make an authenticated API request to Strava
     */
    async function apiRequest(endpoint, options = {}) {
        const accessToken = await getValidAccessToken();

        const response = await fetch(`${CONFIG.stravaApiBase}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                ...options.headers
            }
        });

        if (response.status === 401) {
            // Token might be invalid, try refreshing
            const newToken = await refreshAccessToken();

            const retryResponse = await fetch(`${CONFIG.stravaApiBase}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${newToken}`,
                    ...options.headers
                }
            });

            if (!retryResponse.ok) {
                throw new Error(`API request failed: ${retryResponse.status}`);
            }

            return retryResponse.json();
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Get authenticated athlete
     */
    async function getAthlete() {
        // Try cache first
        const cached = localStorage.getItem(STORAGE_KEYS.athleteData);
        if (cached) {
            return JSON.parse(cached);
        }

        const athlete = await apiRequest('/athlete');
        localStorage.setItem(STORAGE_KEYS.athleteData, JSON.stringify(athlete));
        return athlete;
    }

    /**
     * Get athlete activities
     */
    async function getActivities(page = 1, perPage = 30) {
        // Check cache
        const cacheTimestamp = parseInt(localStorage.getItem(STORAGE_KEYS.cacheTimestamp) || '0');
        const cached = localStorage.getItem(STORAGE_KEYS.activitiesCache);

        if (cached && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
            return JSON.parse(cached);
        }

        const activities = await apiRequest(`/athlete/activities?page=${page}&per_page=${perPage}`);

        // Cache the results
        localStorage.setItem(STORAGE_KEYS.activitiesCache, JSON.stringify(activities));
        localStorage.setItem(STORAGE_KEYS.cacheTimestamp, Date.now().toString());

        return activities;
    }

    /**
     * Get athlete stats
     */
    async function getAthleteStats() {
        const tokens = getTokens();
        if (!tokens.athleteId) {
            const athlete = await getAthlete();
            return await apiRequest(`/athletes/${athlete.id}/stats`);
        }
        return await apiRequest(`/athletes/${tokens.athleteId}/stats`);
    }

    /**
     * Force refresh activities cache
     */
    async function refreshActivities() {
        localStorage.removeItem(STORAGE_KEYS.activitiesCache);
        localStorage.removeItem(STORAGE_KEYS.cacheTimestamp);
        return await getActivities();
    }

    /**
     * Disconnect (clear tokens)
     */
    function disconnect() {
        clearStorage();
    }

    // Public API
    return {
        CONFIG,
        isAuthenticated,
        authorize,
        handleCallback,
        getAthlete,
        getActivities,
        getAthleteStats,
        refreshActivities,
        disconnect,
        getTokens
    };
})();
