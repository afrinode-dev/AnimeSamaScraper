const { scrapeAnimesama } = require('../utils/scraper');
const { cleanTitleWithFallback } = require('../utils/title-cleaner');

module.exports = async (req, res) => {
    try {
        const $ = await scrapeAnimesama('https://anime-sama.org/');
        
        const popularAnime = {
            classiques: [],
            pepites: []
        };
        
        function extractAnimeFromContainer(containerId, sectionName, targetArray, maxItems = 15) {
            const $container = $(`#${containerId}`);
            if (!$container.length) return;
            
            $container.find('a[href*="/catalogue/"]').each((i, link) => {
                if (targetArray.length >= maxItems) return false;
                
                const $link = $(link);
                const href = $link.attr('href');
                
                if (href && href.includes('/catalogue/')) {
                    const urlParts = href.split('/');
                    const catalogueIndex = urlParts.indexOf('catalogue');
                    const animeId = catalogueIndex >= 0 ? urlParts[catalogueIndex + 1] : null;
                    
                    if (animeId && !targetArray.some(anime => anime.id === animeId)) {
                        let title = $link.text().trim().replace(/\s+/g, ' ');
                        title = cleanTitleWithFallback(title, animeId);
                        
                        const $img = $link.find('img').first();
                        let image = $img.attr('src') || $img.attr('data-src');
                        if (image && !image.startsWith('http')) {
                            image = image.startsWith('//') ? `https:${image}` : `https://anime-sama.org${image}`;
                        }
                        
                        targetArray.push({
                            id: animeId,
                            title,
                            image: image || `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`,
                            url: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                            category: sectionName.toLowerCase()
                        });
                    }
                }
            });
        }
        
        extractAnimeFromContainer('containerClassiques', 'Classiques', popularAnime.classiques, 20);
        extractAnimeFromContainer('containerPepites', 'Pépites', popularAnime.pepites, 15);
        
        if (popularAnime.pepites.length === 0) {
            $('div').each((i, div) => {
                const $div = $(div);
                const divText = $div.text().toLowerCase();
                const catalogueLinks = $div.find('a[href*="/catalogue/"]').length;
                
                if ((divText.includes('pépites') || divText.includes('découvrez')) &&
                    catalogueLinks >= 5 && catalogueLinks <= 50 && popularAnime.pepites.length < 15) {
                    
                    $div.find('a[href*="/catalogue/"]').each((linkIndex, link) => {
                        if (popularAnime.pepites.length >= 15) return false;
                        
                        const $link = $(link);
                        const href = $link.attr('href');
                        
                        if (href && href.includes('/catalogue/')) {
                            const urlParts = href.split('/');
                            const catalogueIndex = urlParts.indexOf('catalogue');
                            const animeId = catalogueIndex >= 0 ? urlParts[catalogueIndex + 1] : null;
                            
                            if (animeId && !popularAnime.pepites.some(anime => anime.id === animeId)) {
                                let title = $link.text().trim().replace(/\s+/g, ' ');
                                title = cleanTitleWithFallback(title, animeId);
                                
                                const $img = $link.find('img').first();
                                let image = $img.attr('src') || $img.attr('data-src');
                                if (image && !image.startsWith('http')) {
                                    image = image.startsWith('//') ? `https:${image}` : `https://anime-sama.eu${image}`;
                                }
                                
                                popularAnime.pepites.push({
                                    id: animeId,
                                    title,
                                    image: image || `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`,
                                    url: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                                    category: 'pépite'
                                });
                            }
                        }
                    });
                    return false;
                }
            });
        }
        
        const allPopular = [...popularAnime.classiques, ...popularAnime.pepites];
        
        res.json({
            success: true,
            totalCount: allPopular.length,
            categories: {
                classiques: {
                    count: popularAnime.classiques.length,
                    anime: popularAnime.classiques
                },
                pepites: {
                    count: popularAnime.pepites.length,
                    anime: popularAnime.pepites
                }
            },
            allPopular,
            extractedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Popular API error:', error);
        res.status(500).json({
            error: 'Failed to fetch popular anime',
            message: 'Impossible de récupérer les anime populaires'
        });
    }
};
