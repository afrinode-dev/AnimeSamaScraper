const { scrapeAnimesama } = require('../utils/scraper');

module.exports = async (req, res) => {
    try {
        const $ = await scrapeAnimesama('https://anime-sama.eu/');
        
        const recentEpisodes = [];
        const seenItems = new Set();
        
        $('a[href*="/catalogue/"]').each((index, element) => {
            const $link = $(element);
            const href = $link.attr('href');
            
            if (!href || !href.includes('/catalogue/')) return;
            
            const cardText = $link.text().trim();
            
            const urlParts = href.split('/');
            const catalogueIndex = urlParts.indexOf('catalogue');
            if (catalogueIndex === -1) return;
            
            const animeId = urlParts[catalogueIndex + 1];
            if (!animeId || animeId === '') return;
            
            const hasSeasonInfo = href.includes('/saison');
            if (!hasSeasonInfo) return;
            
            if (href.includes('/scan')) return;
            
            let language = 'VOSTFR';
            if (href.includes('/vf/') || href.includes('/vf1/') || href.includes('/vf2/')) {
                language = 'VF';
            } else if (href.includes('/vj/') || href.includes('/vj')) {
                language = 'VJ';
            } else if (href.includes('/va/')) {
                language = 'VA';
            }
            
            const $flag = $link.find('img[src*="flag_"]');
            if ($flag.length) {
                const flagSrc = $flag.attr('src') || '';
                if (flagSrc.includes('flag_fr')) language = 'VF';
                else if (flagSrc.includes('flag_jp')) language = 'VOSTFR';
                else if (flagSrc.includes('flag_cn')) language = 'VCN';
            }
            
            if (cardText.toLowerCase().includes('scans') || cardText.toLowerCase().includes('scan')) {
                return;
            }
            
            const seasonMatch = href.match(/saison(\d+)/i);
            const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1;
            
            const timeMatch = cardText.match(/(\d{1,2}h\d{2})/);
            const releaseTime = timeMatch ? timeMatch[1] : null;
            
            let title = '';
            const $strong = $link.find('strong').first();
            if ($strong.length) {
                title = $strong.text().trim();
            }
            if (!title) {
                title = animeId.replace(/-/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
            
            const $img = $link.find('img[src*="/contenu/"]').first();
            let image = $img.attr('src') || `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`;
            
            const uniqueKey = `${animeId}-${seasonNumber}-${language}`;
            if (seenItems.has(uniqueKey)) return;
            seenItems.add(uniqueKey);
            
            const seasonText = cardText.match(/Saison\s*(\d+)(?:\s*Partie\s*(\d+))?/i);
            let seasonName = `Saison ${seasonNumber}`;
            if (seasonText && seasonText[2]) {
                seasonName = `Saison ${seasonText[1]} Partie ${seasonText[2]}`;
            }
            
            recentEpisodes.push({
                animeId,
                title,
                season: seasonNumber,
                seasonName,
                language,
                contentType: 'anime',
                releaseTime,
                url: href.startsWith('http') ? href : `https://anime-sama.org${href}`,
                image,
                addedAt: new Date().toISOString()
            });
        });
        
        res.json({
            success: true,
            count: recentEpisodes.length,
            extractedAt: new Date().toISOString(),
            recentEpisodes
        });
        
    } catch (error) {
        console.error('Recent episodes API error:', error);
        res.status(500).json({
            error: 'Failed to fetch recent episodes',
            message: 'Impossible de récupérer les épisodes récents'
        });
    }
};
