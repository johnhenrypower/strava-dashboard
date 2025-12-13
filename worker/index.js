/**
 * Cloudflare Worker for Strava Dashboard
 *
 * Public API that serves your Strava data to the dashboard.
 * Uses stored refresh token to authenticate with Strava.
 */

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

// In-memory token cache (per worker instance)
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Handle incoming requests
 */
export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Public API endpoints
            if (path === '/api/athlete') {
                return await handleGetAthlete(env);
            }

            if (path === '/api/activities') {
                const page = url.searchParams.get('page') || '1';
                const perPage = url.searchParams.get('per_page') || '30';
                return await handleGetActivities(env, page, perPage);
            }

            if (path === '/api/stats') {
                return await handleGetStats(env);
            }

            // Health check
            if (path === '/health') {
                return jsonResponse({ status: 'ok' });
            }

            return jsonResponse({ error: 'Not found' }, 404);
        } catch (error) {
            console.error('Worker error:', error);
            return jsonResponse({ error: error.message || 'Internal server error' }, 500);
        }
    }
};

/**
 * Get a valid access token using the stored refresh token
 */
async function getAccessToken(env) {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if still valid (with 5 min buffer)
    if (cachedToken && tokenExpiry > now + 300) {
        return cachedToken;
    }

    // Refresh the token
    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token: env.STRAVA_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to refresh token');
    }

    const data = await response.json();

    // Cache the new token
    cachedToken = data.access_token;
    tokenExpiry = data.expires_at;

    return cachedToken;
}

/**
 * Make an authenticated request to Strava API
 */
async function stravaRequest(env, endpoint) {
    const accessToken = await getAccessToken(env);

    const response = await fetch(`${STRAVA_API_BASE}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Strava API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Get athlete info
 */
async function handleGetAthlete(env) {
    const athlete = await stravaRequest(env, '/athlete');
    return jsonResponse(athlete);
}

/**
 * Get activities
 */
async function handleGetActivities(env, page, perPage) {
    const activities = await stravaRequest(env, `/athlete/activities?page=${page}&per_page=${perPage}`);
    return jsonResponse(activities);
}

/**
 * Get athlete stats
 */
async function handleGetStats(env) {
    // First get athlete ID
    const athlete = await stravaRequest(env, '/athlete');
    const stats = await stravaRequest(env, `/athletes/${athlete.id}/stats`);
    return jsonResponse(stats);
}

/**
 * Helper to create JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        }
    });
}
