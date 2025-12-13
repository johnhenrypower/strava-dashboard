/**
 * Cloudflare Worker for Strava OAuth
 *
 * This worker handles the secure token exchange with Strava,
 * keeping your CLIENT_SECRET safe on the server side.
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Cloudflare Worker at https://workers.cloudflare.com
 * 2. Copy this code into the worker
 * 3. Add these secrets in the Worker settings:
 *    - STRAVA_CLIENT_ID: Your Strava API Client ID
 *    - STRAVA_CLIENT_SECRET: Your Strava API Client Secret
 * 4. Deploy the worker
 * 5. Update the workerUrl in strava.js with your worker URL
 */

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

// CORS headers for cross-origin requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // In production, replace with your domain
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

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
            // Route requests
            if (path === '/auth/callback' && request.method === 'POST') {
                return await handleCallback(request, env);
            }

            if (path === '/auth/refresh' && request.method === 'POST') {
                return await handleRefresh(request, env);
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
 * Handle OAuth callback - exchange authorization code for tokens
 */
async function handleCallback(request, env) {
    const { code } = await request.json();

    if (!code) {
        return jsonResponse({ error: 'Authorization code is required' }, 400);
    }

    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code'
        })
    });

    const data = await response.json();

    if (!response.ok) {
        return jsonResponse({
            error: data.message || 'Failed to exchange authorization code',
            details: data
        }, response.status);
    }

    // Return tokens and athlete info
    return jsonResponse({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        athlete: data.athlete
    });
}

/**
 * Handle token refresh
 */
async function handleRefresh(request, env) {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
        return jsonResponse({ error: 'Refresh token is required' }, 400);
    }

    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token: refresh_token,
            grant_type: 'refresh_token'
        })
    });

    const data = await response.json();

    if (!response.ok) {
        return jsonResponse({
            error: data.message || 'Failed to refresh token',
            details: data
        }, response.status);
    }

    // Return new tokens
    return jsonResponse({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at
    });
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
