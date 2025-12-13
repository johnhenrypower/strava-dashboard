/**
 * Public Strava Dashboard
 * Fetches and displays activities from the API
 */

const Dashboard = (function() {
    const API_URL = 'https://strava-auth.johnhenry-pwr.workers.dev';

    // Activity type icons
    const ACTIVITY_ICONS = {
        'Run': '\u{1F3C3}',
        'Ride': '\u{1F6B4}',
        'Swim': '\u{1F3CA}',
        'Walk': '\u{1F6B6}',
        'Hike': '\u{26F0}\u{FE0F}',
        'AlpineSki': '\u{26F7}\u{FE0F}',
        'NordicSki': '\u{26F7}\u{FE0F}',
        'Workout': '\u{1F4AA}',
        'WeightTraining': '\u{1F3CB}\u{FE0F}',
        'Yoga': '\u{1F9D8}',
        'VirtualRide': '\u{1F6B4}',
        'VirtualRun': '\u{1F3C3}',
        'default': '\u{1F3C3}'
    };

    // DOM Elements
    let elements = {};

    /**
     * Initialize dashboard
     */
    async function init() {
        cacheElements();
        bindEvents();
        await loadDashboard();
    }

    /**
     * Cache DOM elements
     */
    function cacheElements() {
        elements = {
            dashboardSection: document.getElementById('dashboard-section'),
            errorSection: document.getElementById('error-section'),
            retryBtn: document.getElementById('retry-btn'),
            athleteAvatar: document.getElementById('athlete-avatar'),
            athleteName: document.getElementById('athlete-name'),
            athleteLocation: document.getElementById('athlete-location'),
            weekRange: document.getElementById('week-range'),
            statDistance: document.getElementById('stat-distance'),
            statTime: document.getElementById('stat-time'),
            statPace: document.getElementById('stat-pace'),
            statActivities: document.getElementById('stat-activities'),
            activitiesList: document.getElementById('activities-list'),
            errorMessage: document.getElementById('error-message')
        };
    }

    /**
     * Bind event listeners
     */
    function bindEvents() {
        elements.retryBtn?.addEventListener('click', loadDashboard);
    }

    /**
     * Show error section
     */
    function showError(message) {
        elements.dashboardSection.style.display = 'none';
        elements.errorMessage.textContent = message;
        elements.errorSection.style.display = 'flex';
    }

    /**
     * Show dashboard section
     */
    function showDashboard() {
        elements.errorSection.style.display = 'none';
        elements.dashboardSection.style.display = 'block';
    }

    /**
     * Fetch data from API
     */
    async function fetchAPI(endpoint) {
        const response = await fetch(`${API_URL}${endpoint}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    }

    /**
     * Load dashboard data
     */
    async function loadDashboard() {
        try {
            const [athlete, activities] = await Promise.all([
                fetchAPI('/api/athlete'),
                fetchAPI('/api/activities')
            ]);

            renderAthlete(athlete);
            renderWeeklyStats(activities);
            renderActivities(activities);
            showDashboard();
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            showError('Unable to load activities. Please try again later.');
        }
    }

    /**
     * Render athlete info
     */
    function renderAthlete(athlete) {
        elements.athleteAvatar.src = athlete.profile || athlete.profile_medium || '';
        elements.athleteName.textContent = `${athlete.firstname} ${athlete.lastname}`;

        const location = [athlete.city, athlete.state, athlete.country]
            .filter(Boolean)
            .join(', ');
        elements.athleteLocation.textContent = location;
    }

    /**
     * Render weekly stats
     */
    function renderWeeklyStats(activities) {
        // Get start and end of current week
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        // Format week range
        const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        elements.weekRange.textContent = `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;

        // Filter activities for this week
        const weeklyActivities = activities.filter(activity => {
            const activityDate = new Date(activity.start_date_local);
            return activityDate >= startOfWeek && activityDate <= now;
        });

        // Calculate stats
        let totalDistance = 0;
        let totalTime = 0;
        let runDistance = 0;
        let runTime = 0;

        weeklyActivities.forEach(activity => {
            totalDistance += activity.distance || 0;
            totalTime += activity.moving_time || 0;

            if (activity.type === 'Run' || activity.type === 'VirtualRun') {
                runDistance += activity.distance || 0;
                runTime += activity.moving_time || 0;
            }
        });

        // Convert meters to miles
        const distanceMiles = totalDistance / 1609.34;

        // Calculate average pace (minutes per mile) for runs
        let avgPace = '--';
        if (runDistance > 0) {
            const paceSecondsPerMile = runTime / (runDistance / 1609.34);
            avgPace = formatPace(paceSecondsPerMile);
        }

        // Update UI
        elements.statDistance.textContent = distanceMiles.toFixed(1);
        elements.statTime.textContent = formatDuration(totalTime);
        elements.statPace.textContent = avgPace;
        elements.statActivities.textContent = weeklyActivities.length.toString();
    }

    /**
     * Render activities list
     */
    function renderActivities(activities) {
        if (!activities || activities.length === 0) {
            elements.activitiesList.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20v-6M6 20V10M18 20V4"/>
                    </svg>
                    <p>No activities yet.</p>
                </div>
            `;
            return;
        }

        // Show last 10 activities
        const recentActivities = activities.slice(0, 10);

        elements.activitiesList.innerHTML = recentActivities.map(activity => {
            const icon = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.default;
            const date = new Date(activity.start_date_local);
            const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
            });

            const distanceMiles = (activity.distance / 1609.34).toFixed(1);
            const duration = formatDuration(activity.moving_time);

            let paceStr = '';
            if (activity.type === 'Run' || activity.type === 'VirtualRun') {
                const paceSecondsPerMile = activity.moving_time / (activity.distance / 1609.34);
                paceStr = formatPace(paceSecondsPerMile);
            } else if (activity.type === 'Ride' || activity.type === 'VirtualRide') {
                const speedMph = (activity.distance / 1609.34) / (activity.moving_time / 3600);
                paceStr = speedMph.toFixed(1) + ' mph';
            }

            const stravaUrl = `https://www.strava.com/activities/${activity.id}`;

            return `
                <a href="${stravaUrl}" target="_blank" class="activity-card">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-details">
                        <div class="activity-name">${escapeHtml(activity.name)}</div>
                        <div class="activity-date">${dateStr}</div>
                    </div>
                    <div class="activity-stats">
                        <div class="activity-stat">
                            <div class="activity-stat-value">${distanceMiles} mi</div>
                            <div class="activity-stat-label">Distance</div>
                        </div>
                        ${paceStr ? `
                        <div class="activity-stat">
                            <div class="activity-stat-value">${paceStr}</div>
                            <div class="activity-stat-label">${activity.type.includes('Run') ? 'Pace' : 'Speed'}</div>
                        </div>
                        ` : ''}
                        <div class="activity-stat">
                            <div class="activity-stat-value">${duration}</div>
                            <div class="activity-stat-label">Time</div>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    }

    /**
     * Format seconds to h:mm:ss or m:ss
     */
    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format pace (seconds per mile) to m:ss/mi
     */
    function formatPace(secondsPerMile) {
        if (!isFinite(secondsPerMile) || secondsPerMile <= 0) return '--';
        const minutes = Math.floor(secondsPerMile / 60);
        const seconds = Math.floor(secondsPerMile % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { refresh: loadDashboard };
})();
