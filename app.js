// Aura Website JavaScript Application Logic
const TMDB_KEY = "928fbb48997b55eb1ceeba4f2f4acf5a";
const TMDB_DOMAINS = [
    "https://api.tmdb.org/3",
    "https://api.themoviedb.org/3"
];

let activeDomainIndex = 0; // Remembers the last successful domain index
let watchlist = JSON.parse(localStorage.getItem("aura_watchlist")) || [];

// Core API caller with rotating domain failover
async function fetchJson(path, queryParams = "") {
    let attempts = 0;
    
    while (attempts < TMDB_DOMAINS.length) {
        const index = (activeDomainIndex + attempts) % TMDB_DOMAINS.length;
        const baseDomain = TMDB_DOMAINS[index];
        const requestUrl = `${baseDomain}/${path}?api_key=${TMDB_KEY}${queryParams}`;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5 seconds timeout per domain
            
            const response = await fetch(requestUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`Status ${response.status}`);
            
            const text = await response.text();
            let data = JSON.parse(text);
            
            // Success!
            activeDomainIndex = index;
            return data;
        } catch (error) {
            console.warn(`Domain index ${index} (${baseDomain}) failed: ${error.message}`);
            attempts++;
        }
    }
    
    // final fallback to standard direct
    try {
        const response = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${TMDB_KEY}${queryParams}`);
        return await response.json();
    } catch (e) {
        console.error("All domains failed for path: " + path);
        return null;
    }
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    loadHomeContent();
    renderWatchlist();
}

// Event listener configuration
function setupEventListeners() {
    // Search
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-btn");
    
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSearch(searchInput.value);
    });
    searchBtn.addEventListener("click", () => handleSearch(searchInput.value));

    // Tab Switching
    document.querySelectorAll(".nav-link").forEach(tab => {
        tab.addEventListener("click", (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Close Detail Modal
    document.getElementById("detail-close-btn").addEventListener("click", () => {
        document.getElementById("detail-modal").style.display = "none";
    });
    
    // Close Player Modal
    document.getElementById("player-back-btn").addEventListener("click", () => {
        const playerModal = document.getElementById("player-modal");
        playerModal.style.display = "none";
        document.getElementById("player-iframe").src = ""; // Stop audio/video playback
    });

    // Logo click (return to home)
    document.querySelector(".nav-brand").addEventListener("click", () => {
        switchTab("home");
    });
}

// View controller (tab switcher)
function switchTab(tabId) {
    document.querySelectorAll(".nav-link").forEach(link => {
        if (link.dataset.tab === tabId) link.classList.add("active");
        else link.classList.remove("active");
    });

    document.querySelectorAll(".content-view").forEach(view => {
        view.style.display = "none";
    });

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.style.display = "block";

    const heroBanner = document.getElementById("hero-banner");
    if (tabId === "home") {
        heroBanner.style.display = "flex";
        loadHomeContent();
    } else {
        heroBanner.style.display = "none";
        if (tabId === "movies") loadTabGrid("movies", "discover/movie", "&sort_by=popularity.desc");
        else if (tabId === "tv") loadTabGrid("tv", "discover/tv", "&sort_by=popularity.desc");
        else if (tabId === "anime") loadTabGrid("anime", "discover/tv", "&with_genres=16&sort_by=popularity.desc");
        else if (tabId === "watchlist") renderWatchlist();
    }
}

// Load Home Layout
async function loadHomeContent() {
    // 1. Hero banner (load a trending movie)
    const trending = await fetchJson("trending/all/day");
    if (trending && trending.results && trending.results.length > 0) {
        const featured = trending.results.find(m => m.backdrop_path && (m.media_type === "movie" || m.media_type === "tv"));
        if (featured) {
            setupHero(featured);
        }
    }

    // 2. Shelves loading
    if (trending && trending.results) {
        renderShelf("list-trending", trending.results.slice(0, 12));
    }
    
    const movies = await fetchJson("movie/now_playing");
    if (movies && movies.results) {
        renderShelf("list-movies", movies.results.slice(0, 12));
    }

    const series = await fetchJson("tv/on_the_air");
    if (series && series.results) {
        renderShelf("list-tv", series.results.slice(0, 12));
    }

    const anime = await fetchJson("discover/tv", "&with_genres=16&sort_by=popularity.desc");
    if (anime && anime.results) {
        renderShelf("list-anime", anime.results.slice(0, 12));
    }
}

// Setup Hero banner UI
function setupHero(item) {
    const hero = document.getElementById("hero-banner");
    const backdrop = document.getElementById("hero-backdrop");
    const title = document.getElementById("hero-title");
    const synopsis = document.getElementById("hero-synopsis");
    const rating = document.getElementById("hero-rating");
    const year = document.getElementById("hero-year");
    
    hero.style.display = "flex";
    backdrop.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path})`;
    title.innerText = item.title || item.name;
    synopsis.innerText = item.overview || "No synopsis available.";
    rating.innerText = `⭐ ${item.vote_average ? item.vote_average.toFixed(1) : "N/A"}`;
    year.innerText = (item.release_date || item.first_air_date || "").substring(0, 4) || "N/A";
    
    // Play button & Details click
    document.getElementById("hero-play-btn").onclick = () => {
        playMedia(item.id, item.media_type || (item.title ? "movie" : "tv"), item.title || item.name);
    };
    document.getElementById("hero-details-btn").onclick = () => {
        showDetails(item.id, item.media_type || (item.title ? "movie" : "tv"));
    };
}

// Renders list in shelves
function renderShelf(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    
    items.forEach(item => {
        if (!item.poster_path) return;
        const card = createMediaCard(item);
        container.appendChild(card);
    });
}

// Creates an individual movie/show card element
function createMediaCard(item) {
    const card = document.createElement("div");
    card.className = "card";
    
    const mediaType = item.media_type || (item.title ? "movie" : "tv");
    
    card.innerHTML = `
        <img src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${item.title || item.name}" class="card-image" loading="lazy">
        <div class="card-badge">${mediaType === "tv" ? "TV" : "Movie"}</div>
        <div class="card-overlay">
            <h4 class="card-title">${item.title || item.name}</h4>
            <span class="card-year">${(item.release_date || item.first_air_date || "").substring(0, 4) || "N/A"}</span>
        </div>
    `;
    
    card.addEventListener("click", () => {
        showDetails(item.id, mediaType);
    });
    
    return card;
}

// Load browse grids
async function loadTabGrid(type, endpoint, queryParams) {
    const grid = document.getElementById(`grid-${type}`);
    grid.innerHTML = "<div class='empty-state'>Loading...</div>";
    
    const data = await fetchJson(endpoint, queryParams);
    grid.innerHTML = "";
    
    if (data && data.results && data.results.length > 0) {
        data.results.forEach(item => {
            if (!item.poster_path) return;
            const card = createMediaCard(item);
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = "<div class='empty-state'>No results found.</div>";
    }
}

// Search handler
async function handleSearch(query) {
    if (!query || query.trim() === "") return;
    
    switchTab("search");
    const heading = document.getElementById("search-heading");
    heading.innerText = `Search Results for "${query}"`;
    
    const grid = document.getElementById("grid-search");
    grid.innerHTML = "<div class='empty-state'>Searching...</div>";
    
    const data = await fetchJson("search/multi", `&query=${encodeURIComponent(query)}&include_adult=false`);
    grid.innerHTML = "";
    
    if (data && data.results && data.results.length > 0) {
        data.results.forEach(item => {
            if (!item.poster_path || (item.media_type !== "movie" && item.media_type !== "tv")) return;
            const card = createMediaCard(item);
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = "<div class='empty-state'>No results found matching your query.</div>";
    }
}

// Details modal presenter
async function showDetails(id, mediaType) {
    const modal = document.getElementById("detail-modal");
    modal.style.display = "flex";
    
    // Clear old details
    document.getElementById("detail-title").innerText = "Loading...";
    document.getElementById("detail-synopsis").innerText = "";
    document.getElementById("detail-poster").src = "";
    document.getElementById("detail-backdrop").style.backgroundImage = "none";
    document.getElementById("tv-episodes-section").style.display = "none";
    
    const data = await fetchJson(`${mediaType}/${id}`);
    if (!data) return;
    
    const title = data.title || data.name;
    document.getElementById("detail-title").innerText = title;
    document.getElementById("detail-synopsis").innerText = data.overview || "No synopsis available.";
    document.getElementById("detail-poster").src = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
    document.getElementById("detail-backdrop").style.backgroundImage = `url(https://image.tmdb.org/t/p/original${data.backdrop_path})`;
    document.getElementById("detail-rating").innerText = `⭐ ${data.vote_average ? data.vote_average.toFixed(1) : "N/A"}`;
    document.getElementById("detail-year").innerText = (data.release_date || data.first_air_date || "").substring(0, 4) || "N/A";
    
    const genres = (data.genres || []).map(g => g.name).join(", ");
    document.getElementById("detail-genres").innerText = genres || "N/A";
    
    // Watchlist add/remove button
    const wlBtn = document.getElementById("detail-watchlist-btn");
    const inWl = watchlist.some(x => x.id === id && x.mediaType === mediaType);
    wlBtn.innerText = inWl ? "✓ In Library" : "+ Add to Library";
    wlBtn.onclick = () => toggleWatchlist(data, mediaType);
    
    const playBtn = document.getElementById("detail-play-btn");
    if (mediaType === "movie") {
        playBtn.style.display = "inline-flex";
        playBtn.onclick = () => playMedia(id, "movie", title);
    } else {
        playBtn.style.display = "none";
        setupTvEpisodes(id, data.number_of_seasons, title);
    }
}

// Load TV season/episode arrays
async function setupTvEpisodes(tvId, seasonsCount, seriesTitle) {
    const section = document.getElementById("tv-episodes-section");
    section.style.display = "block";
    
    const tabsContainer = document.getElementById("seasons-tabs");
    tabsContainer.innerHTML = "";
    
    const episodesList = document.getElementById("episodes-list");
    episodesList.innerHTML = "<div class='episode-btn'>Select a season to view episodes...</div>";
    
    // Add season buttons
    for (let s = 1; s <= seasonsCount; s++) {
        const tab = document.createElement("button");
        tab.className = "season-tab";
        tab.innerText = `Season ${s}`;
        tab.onclick = () => loadSeasonEpisodes(tvId, s, seriesTitle);
        tabsContainer.appendChild(tab);
    }
    
    // Load Season 1 by default
    if (seasonsCount > 0) {
        tabsContainer.children[0].click();
    }
}

async function loadSeasonEpisodes(tvId, seasonNum, seriesTitle) {
    // Mark tab active
    document.querySelectorAll(".season-tab").forEach(tab => {
        if (tab.innerText === `Season ${seasonNum}`) tab.classList.add("active");
        else tab.classList.remove("active");
    });
    
    const episodesList = document.getElementById("episodes-list");
    episodesList.innerHTML = "<div class='episode-btn'>Loading episodes...</div>";
    
    const data = await fetchJson(`tv/${tvId}/season/${seasonNum}`);
    episodesList.innerHTML = "";
    
    if (data && data.episodes && data.episodes.length > 0) {
        data.episodes.forEach(ep => {
            const epBtn = document.createElement("button");
            epBtn.className = "episode-btn";
            epBtn.innerHTML = `
                <span>Episode ${ep.episode_number} — ${ep.name || "Episode " + ep.episode_number}</span>
                <span>▶ Play</span>
            `;
            epBtn.onclick = () => playMedia(tvId, "tv", `${seriesTitle} - S${seasonNum}E${ep.episode_number}`, seasonNum, ep.episode_number);
            episodesList.appendChild(epBtn);
        });
    } else {
        episodesList.innerHTML = "<div class='episode-btn'>No episodes found for this season.</div>";
    }
}

// Plays streaming link in fullscreen Iframe modal
function playMedia(id, type, title, season = 1, episode = 1) {
    document.getElementById("detail-modal").style.display = "none";
    const playerModal = document.getElementById("player-modal");
    playerModal.style.display = "block";
    
    document.getElementById("player-title").innerText = title;
    
    const providerSelect = document.getElementById("provider-select");
    
    // Embed providers mapping
    const loadEmbed = () => {
        const server = providerSelect.value;
        let embedUrl = "";
        
        if (server === "peachify") {
            embedUrl = type === "movie" 
                ? `https://peachify.top/?id=${id}&type=movie` 
                : `https://peachify.top/?id=${id}&s=${season}&e=${episode}&type=tv`;
        } else if (server === "movies111") {
            // Movies111 uses IMDb id, but since this is client side, 111Movies supports TMDB IDs too or we fall back.
            // Let's resolve the URL structure
            embedUrl = type === "movie"
                ? `https://111movies.net/movie/${id}`
                : `https://111movies.net/tv/${id}/${season}/${episode}`;
        } else if (server === "vidzee") {
            embedUrl = type === "movie"
                ? `https://player.vidzee.wtf/embed/movie/${id}`
                : `https://player.vidzee.wtf/embed/tv/${id}/${season}/${episode}`;
        } else if (server === "vidzeev2") {
            embedUrl = type === "movie"
                ? `https://player.vidzee.wtf/v2/embed/movie/${id}`
                : `https://player.vidzee.wtf/v2/embed/tv/${id}/${season}/${episode}`;
        }
        
        const iframe = document.getElementById("player-iframe");
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
        iframe.src = embedUrl;
    };
    
    // Trigger initial load and setup switch listener
    loadEmbed();
    providerSelect.onchange = loadEmbed;
}

// Watchlist library CRUD
function toggleWatchlist(item, mediaType) {
    const index = watchlist.findIndex(x => x.id === item.id && x.mediaType === mediaType);
    const btn = document.getElementById("detail-watchlist-btn");
    
    if (index > -1) {
        watchlist.splice(index, 1);
        btn.innerText = "+ Add to Library";
    } else {
        watchlist.push({
            id: item.id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            release_date: item.release_date || item.first_air_date,
            mediaType: mediaType
        });
        btn.innerText = "✓ In Library";
    }
    
    localStorage.setItem("aura_watchlist", JSON.stringify(watchlist));
    renderWatchlist();
}

function renderWatchlist() {
    const grid = document.getElementById("grid-watchlist");
    const emptyState = document.getElementById("watchlist-empty");
    if (!grid) return;
    
    grid.innerHTML = "";
    
    if (watchlist.length > 0) {
        emptyState.style.display = "none";
        watchlist.forEach(item => {
            const card = createMediaCard({
                id: item.id,
                title: item.title,
                poster_path: item.poster_path,
                release_date: item.release_date,
                media_type: item.mediaType
            });
            grid.appendChild(card);
        });
    } else {
        emptyState.style.display = "block";
    }
}
