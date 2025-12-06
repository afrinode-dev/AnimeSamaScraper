const { scrapeAnimesama } = require('../utils/scraper');

// Cache system for recommendations
let recommendationsCache = {
    data: [],
    lastUpdated: null,
    isUpdating: false
};

// Cache duration in milliseconds (5 minutes for production use)
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Smart page rotation system
let exploredPages = new Set();
let totalPagesDiscovered = 0;
const MAX_PAGES_TO_EXPLORE = 50; // Explore up to 50 different pages before resetting

// Function to get a random unexplored page
function getRandomUnexploredPage() {
    // If we've explored too many pages, reset the system
    if (exploredPages.size >= MAX_PAGES_TO_EXPLORE) {
        console.log('🔄 Resetting explored pages to discover new content...');
        exploredPages.clear();
    }
    
    let randomPage;
    let attempts = 0;
    do {
        // Generate random page between 1 and 38 (verified range for anime-sama catalogue)
        randomPage = Math.floor(Math.random() * 38) + 1;
        attempts++;
    } while (exploredPages.has(randomPage) && attempts < 20);
    
    exploredPages.add(randomPage);
    return randomPage;
}

// Background refresh function
async function refreshRecommendationsCache() {
    if (recommendationsCache.isUpdating) {
        console.log('🔄 Cache refresh already in progress, skipping...');
        return;
    }
    
    try {
        recommendationsCache.isUpdating = true;
        const targetPage = getRandomUnexploredPage();
        console.log(`🎯 Starting background refresh from random page ${targetPage} (explored: ${exploredPages.size}/${MAX_PAGES_TO_EXPLORE})...`);
        
        // Scrape target page
        const $ = await scrapeAnimesama(`https://anime-sama.eu/catalogue/?page=${targetPage}`);
        const recommendations = [];
        const seenAnimes = new Set();
        
        $('a[href*="/catalogue/"]').each((index, element) => {
            const $link = $(element);
            const href = $link.attr('href');
            
            if (!href || !href.includes('/catalogue/')) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://anime-sama.eu${href}`;
            const urlParts = fullUrl.split('/');
            const catalogueIndex = urlParts.findIndex(part => part === 'catalogue');
            
            if (catalogueIndex === -1 || catalogueIndex + 1 >= urlParts.length) return;
            
            const animeId = urlParts[catalogueIndex + 1];
            
            if (!animeId || animeId === '' || seenAnimes.has(animeId)) return;
            
            const $card = $link.closest('.shrink-0') || $link;
            const cardText = $card.text().toLowerCase();
            const isScans = cardText.includes('scans') || 
                           cardText.includes('manga') ||
                           cardText.includes('manhwa') ||
                           cardText.includes('manhua');
            
            if (isScans) return;
            
            seenAnimes.add(animeId);
            
            let title = $card.find('h1').text().trim();
            
            if (!title) {
                title = $card.find('.title, .name').text().trim() ||
                       $link.attr('title') || 
                       $card.find('img').attr('alt');
            }
            
            if (!title || title.length < 3) {
                title = animeId.replace(/-/g, ' ')
                              .split(' ')
                              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ');
            }
            
            title = title.replace(/^#/, '')
                        .replace(/\s+/g, ' ')
                        .replace(/\n/g, ' ')
                        .replace(/\t/g, ' ')
                        .replace(/\s*VF\s*/gi, '')
                        .replace(/\s*VOSTFR\s*/gi, '')
                        .replace(/\s*Saison\s*\d+.*$/gi, '')
                        .replace(/\s*Episode\s*\d+.*$/gi, '')
                        .replace(/\s*\[FIN\]\s*/gi, '')
                        .trim();
            
            const $img = $card.find('img.imageCarteHorizontale').first();
            let image = $img.attr('src') || $img.attr('data-src');
            
            if (!image || !image.includes('http')) {
                image = `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`;
            }
            
            const genreElements = $card.find('p.text-gray-300.font-medium.text-xs');
            let genres = [];
            genreElements.each((i, el) => {
                const text = $(el).text().trim();
                if (text && text !== 'Anime' && text !== 'Scans' && !text.includes('http')) {
                    genres.push(text);
                }
            });
            
            const contentType = 'anime';
            const languages = ['VOSTFR'];
            
            recommendations.push({
                id: animeId,
                title: title,
                image: image,
                url: fullUrl,
                contentType: contentType,
                genres: genres.length > 0 ? genres : ['Genre non spécifié'],
                languages: languages,
                category: 'recommendation',
                extractedFrom: 'Catalogue Page'
            });
        });
        
        // Remove duplicates
        const uniqueRecommendations = recommendations
            .filter((anime, index, self) => 
                index === self.findIndex(a => a.id === anime.id)
            );
        
        // Shuffle array to get random order each time
        for (let i = uniqueRecommendations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueRecommendations[i], uniqueRecommendations[j]] = [uniqueRecommendations[j], uniqueRecommendations[i]];
        }
        
        // Update cache
        recommendationsCache.data = uniqueRecommendations;
        recommendationsCache.lastUpdated = new Date();
        recommendationsCache.isUpdating = false;
        
        // Check if this page had content to estimate total pages
        if (uniqueRecommendations.length > 0) {
            totalPagesDiscovered = Math.max(totalPagesDiscovered, targetPage);
        }
        
        console.log(`✅ Cache refreshed: ${uniqueRecommendations.length} animes loaded from page ${targetPage} at ${recommendationsCache.lastUpdated.toISOString()}`);
        console.log(`📊 Discovery stats: Total pages found: ${totalPagesDiscovered}, Pages explored: ${exploredPages.size}/${MAX_PAGES_TO_EXPLORE}`);
        
    } catch (error) {
        console.error('❌ Error refreshing cache:', error.message);
        recommendationsCache.isUpdating = false;
    }
}

// Cache is now loaded on-demand only (no automatic background refresh)

// Get anime recommendations from catalogue page
async function getRecommendations(req, res) {
    try {
        // Check if cache needs refresh
        const now = new Date();
        const cacheAge = recommendationsCache.lastUpdated ? 
            now.getTime() - recommendationsCache.lastUpdated.getTime() : 
            Infinity;
        
        // If cache is empty or older than CACHE_DURATION, refresh it
        if (recommendationsCache.data.length === 0 || cacheAge > CACHE_DURATION) {
            console.log('🔄 Cache expired or empty, refreshing...');
            
            // If already updating, wait for it to complete
            if (recommendationsCache.isUpdating) {
                console.log('⏳ Cache refresh in progress, waiting...');
                // Wait for the cache to be updated (max 30 seconds)
                const maxWaitTime = 30000; // 30 seconds
                const startTime = Date.now();
                
                while (recommendationsCache.isUpdating && (Date.now() - startTime) < maxWaitTime) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms between checks
                }
                
                // If still updating after max wait time, continue with empty cache
                if (recommendationsCache.isUpdating) {
                    console.log('⚠️ Cache refresh took too long, proceeding with current data');
                } else {
                    console.log('✅ Cache refresh completed during wait');
                }
            } else {
                // Start the refresh if not already updating
                await refreshRecommendationsCache();
            }
        } else {
            console.log(`💾 Using cached data (age: ${Math.round(cacheAge / 1000)}s, next refresh in: ${Math.round((CACHE_DURATION - cacheAge) / 1000)}s)`);
        }
        
        const uniqueRecommendations = recommendationsCache.data;
        
        // Pagination support with random rotation for each request
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        
        // Create a fresh shuffled copy for each request to ensure variety
        const shuffledRecommendations = [...uniqueRecommendations];
        for (let i = shuffledRecommendations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledRecommendations[i], shuffledRecommendations[j]] = [shuffledRecommendations[j], shuffledRecommendations[i]];
        }
        
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        const paginatedResults = shuffledRecommendations.slice(startIndex, endIndex);
        
        res.json({
            success: true,
            data: paginatedResults,
            pagination: {
                page: page,
                limit: limit,
                total: uniqueRecommendations.length,
                totalPages: Math.ceil(uniqueRecommendations.length / limit),
                hasNext: endIndex < uniqueRecommendations.length,
                hasPrev: page > 1
            },
            metadata: {
                extractedAt: new Date().toISOString(),
                source: 'anime-sama.eu/catalogue/',
                totalFound: uniqueRecommendations.length,
                filtered: 'Animes only (scans excluded)',
                cacheInfo: {
                    lastUpdated: recommendationsCache.lastUpdated?.toISOString(),
                    cacheAge: recommendationsCache.lastUpdated ? 
                        Math.round((new Date().getTime() - recommendationsCache.lastUpdated.getTime()) / 1000) : 0,
                    nextRefreshIn: recommendationsCache.lastUpdated ? 
                        Math.max(0, Math.round((CACHE_DURATION - (new Date().getTime() - recommendationsCache.lastUpdated.getTime())) / 1000)) : 0,
                    cacheDuration: CACHE_DURATION / 1000,
                    lastPageLoaded: [...exploredPages].pop() || 1,
                    pagesExplored: exploredPages.size,
                    maxPagesToExplore: MAX_PAGES_TO_EXPLORE,
                    totalPagesDiscovered: totalPagesDiscovered,
                    explorationProgress: `${exploredPages.size}/${MAX_PAGES_TO_EXPLORE}`
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des recommandations:', error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recommendations',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = getRecommendations;