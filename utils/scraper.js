const cheerio = require('cheerio');
const { cleanTitleWithFallback } = require('./title-cleaner');
const { 
    scrapeToCheerio, 
    scrapeWithRetry, 
    postWithPlaywright, 
    fetchJavaScriptFile,
    checkUrlExists,
    getRandomUserAgent 
} = require('./playwright-scraper');

const LANGUAGE_SYSTEM = {
    'vostfr': { 
        code: 'vostfr', 
        name: 'VOSTFR', 
        fullName: 'Version Originale Sous-Titrée Française',
        flag: 'jp',
        priority: 1 
    },
    'vf': { 
        code: 'vf', 
        name: 'VF', 
        fullName: 'Version Française',
        flag: 'fr',
        priority: 2 
    },
    'va': { 
        code: 'va', 
        name: 'VA', 
        fullName: 'Version Anglaise',
        flag: 'en',
        priority: 3 
    },
    'vkr': { 
        code: 'vkr', 
        name: 'VKR', 
        fullName: 'Version Coréenne',
        flag: 'kr',
        priority: 4 
    },
    'vcn': { 
        code: 'vcn', 
        name: 'VCN', 
        fullName: 'Version Chinoise',
        flag: 'cn',
        priority: 5 
    },
    'vqc': { 
        code: 'vqc', 
        name: 'VQC', 
        fullName: 'Version Québécoise',
        flag: 'qc',
        priority: 6 
    },
    'vf1': { 
        code: 'vf1', 
        name: 'VF1', 
        fullName: 'Version Française 1',
        flag: 'fr',
        priority: 7 
    },
    'vf2': { 
        code: 'vf2', 
        name: 'VF2', 
        fullName: 'Version Française 2',
        flag: 'fr',
        priority: 8 
    },
    'vj': { 
        code: 'vj', 
        name: 'VJ', 
        fullName: 'Version Japonaise Sous-Titrée Française',
        flag: 'jp',
        priority: 9 
    }
};

const SERVER_MAPPING = {
    'sibnet.ru': 'Sibnet',
    'sendvid.com': 'SendVid', 
    'vidmoly.to': 'Vidmoly',
    'smoothpre.com': 'SmoothPre',
    'oneupload.to': 'OneUpload',
    'doodstream.com': 'DoodStream',
    'streamtape.com': 'StreamTape',
    'upstream.to': 'Upstream',
    'embedgram.com': 'EmbedGram'
};

function randomDelay(min = 100, max = 300) {
    return new Promise(resolve => {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        setTimeout(resolve, delay);
    });
}

async function scrapeAnimesama(url, options = {}) {
    try {
        await randomDelay();
        console.log(`🎭 [Playwright] Scraping: ${url}`);
        
        const $ = await scrapeToCheerio(url, {
            waitFor: options.waitFor || 'networkidle',
            timeout: options.timeout || 30000,
            waitForSelector: options.waitForSelector
        });
        
        console.log(`✅ [Playwright] Successfully scraped: ${url}`);
        return $;
    } catch (error) {
        console.error(`❌ [Playwright] Scraping error for ${url}:`, error.message);
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
}

async function searchAnime(query) {
    try {
        await randomDelay();
        console.log(`🔍 [Playwright] Searching for: ${query}`);
        
        const postData = `query=${encodeURIComponent(query)}`;
        const result = await postWithPlaywright(
            'https://anime-sama.eu/template-php/defaut/fetch.php',
            postData
        );

        if (!result.success || !result.html) {
            console.log('⚠️ POST search failed, falling back to homepage search');
            return await fallbackHomepageSearch(query);
        }

        const $ = cheerio.load(result.html);
        const results = [];
        const seenTitles = new Set();

        $('a[href*="/catalogue/"]').each((index, element) => {
            const $el = $(element);
            
            const link = $el.attr('href');
            if (!link || !link.includes('/catalogue/')) return;
            
            const fullUrl = link.startsWith('http') ? link : `https://anime-sama.eu${link}`;
            
            const urlParts = fullUrl.split('/');
            const catalogueIndex = urlParts.findIndex(part => part === 'catalogue');
            if (catalogueIndex === -1 || catalogueIndex + 1 >= urlParts.length) return;
            
            let animeId = urlParts[catalogueIndex + 1];
            if (animeId.endsWith('/')) {
                animeId = animeId.slice(0, -1);
            }
            
            let title = $el.find('h3').text().trim();
            
            if (!title) {
                title = $el.find('.title, .name').text().trim() ||
                       $el.attr('title') || 
                       $el.find('img').attr('alt');
            }
            
            if (!title || title.length < 3) {
                title = animeId.replace(/-/g, ' ')
                              .split(' ')
                              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ');
            }
            
            title = title.replace(/\s+/g, ' ')
                        .replace(/\n/g, ' ')
                        .replace(/\t/g, ' ')
                        .trim();
            
            const image = $el.find('img').attr('src') || 
                         $el.find('img').attr('data-src');
            
            if (title && title.length > 1 && animeId && !seenTitles.has(animeId)) {
                seenTitles.add(animeId);
                
                results.push({
                    id: animeId,
                    title: title,
                    image: image ? (image.startsWith('http') ? image : `https://anime-sama.eu${image}`) : null,
                    url: fullUrl
                });
            }
        });

        if (results.length === 0) {
            return await fallbackHomepageSearch(query);
        }

        console.log(`✅ [Playwright] Found ${results.length} results for: ${query}`);
        return results.slice(0, 15);
        
    } catch (error) {
        console.error('❌ [Playwright] Search API error:', error.message);
        return await fallbackHomepageSearch(query);
    }
}

async function fallbackHomepageSearch(query) {
    console.log(`🔄 [Playwright] Fallback homepage search for: ${query}`);
    const $ = await scrapeAnimesama('https://anime-sama.eu');
    const results = [];
    const queryLower = query.toLowerCase();
    const seenTitles = new Set();
    
    $('a[href*="/catalogue/"]').each((index, element) => {
        const $el = $(element);
        const link = $el.attr('href');
        
        if (!link || link === 'https://anime-sama.eu/catalogue' || link.split('/').length < 5) return;
        
        const urlParts = link.split('/');
        const catalogueIndex = urlParts.indexOf('catalogue');
        if (catalogueIndex === -1 || catalogueIndex + 1 >= urlParts.length) return;
        
        const animeId = urlParts[catalogueIndex + 1];
        
        let title = animeId.replace(/-/g, ' ')
                          .replace(/\b\w/g, l => l.toUpperCase());
        
        const elementTitle = $el.text().trim() || 
                           $el.attr('title') || 
                           $el.find('img').attr('alt');
        
        if (elementTitle && elementTitle.length > title.length) {
            title = elementTitle.replace(/\s+/g, ' ')
                              .replace(/\n/g, ' ')
                              .replace(/\t/g, ' ')
                              .replace(/\s*VF\s*/gi, '')
                              .replace(/\s*VOSTFR\s*/gi, '')
                              .replace(/\s*Saison\s*\d+.*$/gi, '')
                              .replace(/\s*Episode\s*\d+.*$/gi, '')
                              .replace(/\s*\[FIN\]\s*/gi, '')
                              .trim();
        }
        
        const titleMatches = title.toLowerCase().includes(queryLower);
        const urlMatches = animeId.toLowerCase().includes(queryLower);
        
        const titleWords = title.toLowerCase().split(' ');
        const animeIdWords = animeId.toLowerCase().split('-');
        const queryWords = queryLower.split(' ');
        
        const partialMatch = queryWords.some(qWord => 
            qWord.length > 2 && (
                titleWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord)) ||
                animeIdWords.some(aWord => aWord.includes(qWord) || qWord.includes(aWord))
            )
        );
        
        if ((titleMatches || urlMatches || partialMatch) && !seenTitles.has(title.toLowerCase())) {
            seenTitles.add(title.toLowerCase());
            
            const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
            
            results.push({
                id: animeId,
                title: title,
                image: image ? (image.startsWith('http') ? image : `https://anime-sama.eu${image}`) : null,
                url: `https://anime-sama.eu/catalogue/${animeId}`
            });
        }
    });
    
    return results.slice(0, 15);
}

async function getTrendingAnime() {
    try {
        console.log(`🎭 [Playwright] Getting trending anime...`);
        const $ = await scrapeAnimesama('https://anime-sama.eu');
        
        const trending = [];
        const seenAnimes = new Set();
        
        console.log('🎯 [Playwright] Extraction des épisodes récents via boutons bg-cyan-600');
        
        $('.bg-cyan-600').each((index, button) => {
            if (trending.length >= 25) return false;
            
            const $button = $(button);
            const episodeText = $button.text().trim();
            
            const $animeLink = $button.closest('a[href*="/catalogue/"]');
            if (!$animeLink.length) return;
            
            const href = $animeLink.attr('href');
            if (!href || !href.includes('/catalogue/')) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://anime-sama.eu${href}`;
            const urlParts = fullUrl.split('/');
            const catalogueIndex = urlParts.findIndex(part => part === 'catalogue');
            
            if (catalogueIndex === -1 || catalogueIndex + 1 >= urlParts.length) return;
            
            const animeId = urlParts[catalogueIndex + 1];
            
            const uniqueId = `${animeId}-${urlParts.slice(catalogueIndex + 2).join('-')}`;
            
            if (seenAnimes.has(uniqueId)) return;
            seenAnimes.add(uniqueId);
            
            let title = $animeLink.text().trim();
            
            const lines = title.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const animeName = lines[0] || animeId.replace(/-/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            const $img = $animeLink.find('img').first();
            let image = $img.attr('src');
            
            if (!image) {
                image = `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`;
            }
            
            const seasonPath = urlParts[catalogueIndex + 2];
            const languagePath = urlParts[catalogueIndex + 3];
            
            let contentType = 'anime';
            if (seasonPath && seasonPath.toLowerCase().includes('scan')) {
                contentType = 'scan';
            } else if (seasonPath && seasonPath.toLowerCase().includes('film')) {
                contentType = 'film';
            }
            
            let languageInfo = LANGUAGE_SYSTEM.vostfr;
            if (languagePath && LANGUAGE_SYSTEM[languagePath.toLowerCase()]) {
                languageInfo = LANGUAGE_SYSTEM[languagePath.toLowerCase()];
            }
            
            const episodeMatch = episodeText.match(/Episode\s*(\d+)/i);
            const seasonMatch = episodeText.match(/Saison\s*(\d+)/i);
            
            const isFinale = title.includes('[FIN]') || episodeText.includes('[FIN]');
            const isVFCrunchyroll = title.includes('VF Crunchyroll');
            
            trending.push({
                id: uniqueId,
                animeId: animeId,
                title: animeName,
                image: image,
                url: fullUrl,
                contentType: contentType,
                language: languageInfo,
                episodeInfo: episodeText,
                currentEpisode: episodeMatch ? parseInt(episodeMatch[1]) : null,
                currentSeason: seasonMatch ? parseInt(seasonMatch[1]) : null,
                isTrending: true,
                isFinale: isFinale,
                isVFCrunchyroll: isVFCrunchyroll,
                extractedFrom: 'Recent Episodes (Playwright)',
                specialIndicators: {
                    finale: isFinale,
                    crunchyrollVF: isVFCrunchyroll
                }
            });
            
            console.log(`✅ [Playwright] Trending: ${animeName} - ${episodeText}`);
        });
        
        const planningMatches = $.html().match(/cartePlanningAnime\([^)]+\)/g);
        if (planningMatches && trending.length < 20) {
            planningMatches.forEach(match => {
                const params = match.match(/cartePlanningAnime\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]*)",\s*"([^"]+)"\)/);
                
                if (params) {
                    const [, title, path, animeId, time, extra, language] = params;
                    
                    if (seenAnimes.has(animeId)) return;
                    seenAnimes.add(animeId);
                    
                    const cleanedTitle = cleanTitleWithFallback(title, animeId);
                    const languageInfo = LANGUAGE_SYSTEM[language.toLowerCase()] || LANGUAGE_SYSTEM.vostfr;
                    
                    trending.push({
                        id: animeId,
                        title: cleanedTitle,
                        image: `https://anime-sama.eu/s2/img/animes/${animeId}.jpg`,
                        url: `https://anime-sama.eu/catalogue/${animeId}`,
                        contentType: 'anime',
                        language: languageInfo,
                        releaseTime: time,
                        isTrending: true,
                        extractedFrom: 'planning_scheduled',
                        isVFCrunchyroll: title.includes('VF Crunchyroll'),
                        specialIndicators: {
                            scheduled: true,
                            crunchyrollVF: title.includes('VF Crunchyroll')
                        }
                    });
                }
            });
        }

        if (trending.length < 15) {
            $('a[href*="/catalogue/"]').slice(0, 20).each((index, element) => {
                const $el = $(element);
                const link = $el.attr('href');
                
                if (!link || link.includes('/planning') || link.includes('/aide')) return;
                
                const urlParts = link.split('/');
                const catalogueIndex = urlParts.findIndex(part => part === 'catalogue');
                if (catalogueIndex === -1 || catalogueIndex + 1 >= urlParts.length) return;
                
                const animeId = urlParts[catalogueIndex + 1];
                
                if (seenAnimes.has(animeId)) return;
                seenAnimes.add(animeId);
                
                let title = $el.text().trim();
                title = cleanTitleWithFallback(title, animeId);
                
                if (!title || title.length < 3) {
                    title = animeId.replace(/-/g, ' ')
                                  .split(' ')
                                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                  .join(' ');
                }
                
                const image = $el.find('img').attr('src') || $el.find('img').attr('data-src');
                
                trending.push({
                    id: animeId,
                    title: title,
                    image: image ? (image.startsWith('http') ? image : `https://anime-sama.eu${image}`) : null,
                    url: `https://anime-sama.eu/catalogue/${animeId}`,
                    contentType: 'anime',
                    language: LANGUAGE_SYSTEM.vostfr,
                    releaseDay: null,
                    isTrending: false,
                    extractedFrom: 'Homepage Featured (Playwright)'
                });
            });
        }
        
        trending.sort((a, b) => {
            if (a.isTrending && !b.isTrending) return -1;
            if (b.isTrending && !a.isTrending) return 1;
            
            if (a.contentType === 'anime' && b.contentType !== 'anime') return -1;
            if (b.contentType === 'anime' && a.contentType !== 'anime') return 1;
            
            return 0;
        });
        
        console.log(`✅ [Playwright] Found ${trending.length} trending anime`);
        return trending.slice(0, 20);
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting trending anime:', error.message);
        return [];
    }
}

async function getAnimeDetails(animeId) {
    try {
        const url = `https://anime-sama.eu/catalogue/${animeId}/`;
        console.log(`🎭 [Playwright] Getting details for: ${animeId}`);
        const $ = await scrapeAnimesama(url);
        
        const bodyText = $('body').text();
        if (bodyText.includes('301 Moved Permanently') || bodyText.length < 100) {
            throw new Error('Anime page not found');
        }
        
        const title = $('#titreOeuvre').text().trim() || 
                     $('meta[property="og:title"]').attr('content') || 
                     $('title').text().split('|')[0].trim() ||
                     animeId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        const alternativeTitles = $('#titreAlter').text().trim();
        
        let synopsis = $('meta[property="og:description"]').attr('content') || '';
        if (!synopsis) {
            const descElements = ['p.synopsis', '.synopsis', '.description', '#synopsis'];
            for (const selector of descElements) {
                const found = $(selector).text().trim();
                if (found && found.length > 50) {
                    synopsis = found;
                    break;
                }
            }
        }
        
        let image = $('meta[property="og:image"]').attr('content') ||
                   $('img[src*="contenu"]').first().attr('src') ||
                   $('img.cover').first().attr('src');
        
        if (!image) {
            image = `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`;
        }
        
        if (image && !image.startsWith('http')) {
            image = `https://anime-sama.eu${image}`;
        }
        
        const genres = [];
        const genrePatterns = [
            '#sousTitreOeuvre',
            '.genres a', 
            '.genre', 
            '[class*="genre"]',
            'a[href*="genre"]'
        ];
        
        for (const pattern of genrePatterns) {
            $(pattern).each((i, el) => {
                const genreText = $(el).text().trim();
                if (genreText && genreText.length > 1 && genreText.length < 50) {
                    genreText.split(/[,;|]/).forEach(genre => {
                        const cleanGenre = genre.trim();
                        if (cleanGenre && !genres.includes(cleanGenre)) {
                            genres.push(cleanGenre);
                        }
                    });
                }
            });
            if (genres.length > 0) break;
        }
        
        let status = 'En cours';
        const statusPatterns = ['.status', '.state', '[class*="status"]'];
        for (const pattern of statusPatterns) {
            const found = $(pattern).text().trim();
            if (found) {
                status = found;
                break;
            }
        }
        
        const pageText = $('body').text().toLowerCase();
        if (pageText.includes('terminé') || pageText.includes('completed') || pageText.includes('fini')) {
            status = 'Terminé';
        }
        
        let year = null;
        const yearMatch = $('body').text().match(/\b(19\d{2}|20[0-2]\d)\b/);
        if (yearMatch) {
            year = parseInt(yearMatch[0]);
        }
        
        const seasons = await getAnimeSeasons(animeId);
        
        console.log(`✅ [Playwright] Got details for: ${title}`);
        
        return {
            id: animeId,
            title: title,
            alternativeTitles: alternativeTitles || null,
            synopsis: synopsis,
            image: image,
            genres: genres,
            status: status,
            year: year,
            url: url,
            seasons: seasons
        };
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting anime details:', error.message);
        throw error;
    }
}

async function getAnimeSeasons(animeId) {
    try {
        const url = `https://anime-sama.eu/catalogue/${animeId}/`;
        console.log(`🎭 [Playwright] Getting seasons for: ${animeId}`);
        const $ = await scrapeAnimesama(url);
        
        const seasons = [];
        const seenSeasons = new Set();
        
        const saisonMatch = $.html().match(/saison(\d+)/gi);
        if (saisonMatch) {
            const uniqueSeasons = [...new Set(saisonMatch.map(s => s.toLowerCase()))];
            
            uniqueSeasons.forEach((season, index) => {
                const seasonNum = parseInt(season.replace('saison', ''));
                const seasonKey = `saison${seasonNum}`;
                
                if (!seenSeasons.has(seasonKey)) {
                    seenSeasons.add(seasonKey);
                    seasons.push({
                        number: seasonNum,
                        name: `Saison ${seasonNum}`,
                        value: seasonKey,
                        type: 'anime',
                        url: `saison${seasonNum}`,
                        fullUrl: `https://anime-sama.eu/catalogue/${animeId}/saison${seasonNum}/`,
                        languages: ['VOSTFR', 'VF'],
                        available: true,
                        contentType: 'anime'
                    });
                }
            });
        }
        
        $('a[href*="/catalogue/' + animeId + '/"]').each((index, element) => {
            const $el = $(element);
            const href = $el.attr('href') || '';
            const text = $el.text().trim();
            
            if (href.includes('/saison')) {
                const seasonMatch = href.match(/saison(\d+)/i);
                if (seasonMatch) {
                    const seasonNum = parseInt(seasonMatch[1]);
                    const seasonKey = `saison${seasonNum}`;
                    
                    if (!seenSeasons.has(seasonKey)) {
                        seenSeasons.add(seasonKey);
                        seasons.push({
                            number: seasonNum,
                            name: text || `Saison ${seasonNum}`,
                            value: seasonKey,
                            type: 'anime',
                            url: seasonKey,
                            fullUrl: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                            languages: ['VOSTFR', 'VF'],
                            available: true,
                            contentType: 'anime'
                        });
                    }
                }
            }
            
            if (href.includes('/film') || text.toLowerCase().includes('film')) {
                const filmUrl = href.replace(`https://anime-sama.eu/catalogue/${animeId}/`, '');
                if (!seenSeasons.has('film')) {
                    seenSeasons.add('film');
                    seasons.push({
                        number: 1000,
                        name: text || 'Film',
                        value: 'film',
                        type: 'Film',
                        url: filmUrl || 'film',
                        fullUrl: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                        languages: ['VOSTFR', 'VF'],
                        available: true,
                        contentType: 'film'
                    });
                }
            }
            
            if (href.includes('/scan') || text.toLowerCase().includes('scan')) {
                const scanUrl = href.replace(`https://anime-sama.eu/catalogue/${animeId}/`, '');
                if (!seenSeasons.has('scan')) {
                    seenSeasons.add('scan');
                    seasons.push({
                        number: 2000,
                        name: text || 'Scans',
                        value: 'scan',
                        type: 'Scan',
                        url: scanUrl || 'scan',
                        fullUrl: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                        languages: ['VF'],
                        available: true,
                        contentType: 'manga'
                    });
                }
            }
            
            if (href.includes('/oav') || text.toLowerCase().includes('oav') || text.toLowerCase().includes('ova')) {
                const oavUrl = href.replace(`https://anime-sama.eu/catalogue/${animeId}/`, '');
                if (!seenSeasons.has('oav')) {
                    seenSeasons.add('oav');
                    seasons.push({
                        number: 990,
                        name: text || 'OAV',
                        value: 'oav',
                        type: 'OAV',
                        url: oavUrl || 'oav',
                        fullUrl: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                        languages: ['VOSTFR', 'VF'],
                        available: true,
                        contentType: 'anime'
                    });
                }
            }
        });
        
        if (seasons.length === 0) {
            seasons.push({
                number: 1,
                name: 'Saison 1',
                value: 'saison1',
                type: 'anime',
                url: 'saison1',
                fullUrl: `https://anime-sama.eu/catalogue/${animeId}/saison1/`,
                languages: ['VOSTFR', 'VF'],
                available: true,
                contentType: 'anime'
            });
        }
        
        seasons.sort((a, b) => {
            if (a.number < 100 && b.number < 100) return a.number - b.number;
            if (a.number < 100) return -1;
            if (b.number < 100) return 1;
            if (a.number < 1000 && b.number < 1000) return a.number - b.number;
            if (a.number < 1000) return -1;
            if (b.number < 1000) return 1;
            if (a.number < 2000 && b.number < 2000) return a.number - b.number;
            if (a.number < 2000) return -1;
            if (b.number < 2000) return 1;
            return a.number - b.number;
        });
        
        seasons.forEach((season, index) => {
            season.apiIndex = index + 1;
        });
        
        console.log(`✅ [Playwright] Found ${seasons.length} seasons for: ${animeId}`);
        return seasons;
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting anime seasons:', error.message);
        return [];
    }
}

async function getAnimeEpisodes(animeId, season = 1, language = 'VOSTFR') {
    try {
        console.log(`🎭 [Playwright] Getting episodes for: ${animeId} S${season} (${language})`);
        
        let seasonPath;
        if (typeof season === 'string' && season.startsWith('saison')) {
            seasonPath = season;
        } else if (typeof season === 'number' || /^\d+$/.test(season)) {
            seasonPath = `saison${season}`;
        } else {
            seasonPath = season.toString();
        }
        
        let languageCode = 'vostfr';
        const requestedLang = language.toLowerCase();
        
        const languagesToTest = requestedLang === 'vf' ? ['vf1', 'vf2', 'vf'] : [requestedLang];
        
        for (const testLang of languagesToTest) {
            const testUrl = `https://anime-sama.eu/catalogue/${animeId}/${seasonPath}/${testLang}/episodes.js`;
            try {
                const checkResult = await checkUrlExists(testUrl, { timeout: 8000 });
                if (checkResult.exists) {
                    languageCode = testLang;
                    console.log(`✅ [Playwright] Found language: ${testLang}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        const seasonUrl = `https://anime-sama.eu/catalogue/${animeId}/${seasonPath}/${languageCode}/`;
        const episodesJsUrl = `${seasonUrl}episodes.js`;
        
        const episodes = [];
        let maxEpisodes = 0;
        
        try {
            console.log(`🎭 [Playwright] Fetching episodes.js: ${episodesJsUrl}`);
            const jsResult = await fetchJavaScriptFile(episodesJsUrl, { 
                referer: seasonUrl,
                timeout: 15000 
            });
            
            const jsContent = jsResult.content;
            
            if (typeof jsContent === 'string' && jsContent.includes('var eps')) {
                const episodeArrayMatches = jsContent.match(/var eps(\d+) = \[([\s\S]*?)\];/g);
                const servers = new Map();
                
                if (episodeArrayMatches) {
                    episodeArrayMatches.forEach((match) => {
                        const serverMatch = match.match(/var eps(\d+) = \[([\s\S]*?)\];/);
                        if (serverMatch) {
                            const serverNum = parseInt(serverMatch[1]);
                            const urlsContent = serverMatch[2];
                            
                            const urls = urlsContent.match(/'([^']+)'/g);
                            
                            if (urls) {
                                const cleanUrls = urls.map(url => url.replace(/'/g, '').trim()).filter(url => url.length > 0);
                                servers.set(serverNum, cleanUrls);
                            }
                        }
                    });
                }
                
                servers.forEach(urls => {
                    maxEpisodes = Math.max(maxEpisodes, urls.length);
                });
                
                for (let episodeNum = 1; episodeNum <= maxEpisodes; episodeNum++) {
                    const streamingSources = [];
                    
                    servers.forEach((urls, serverNum) => {
                        if (urls[episodeNum - 1]) {
                            const serverUrl = urls[episodeNum - 1];
                            let serverName = `Server ${serverNum}`;
                            
                            for (const [domain, name] of Object.entries(SERVER_MAPPING)) {
                                if (serverUrl.toLowerCase().includes(domain)) {
                                    serverName = name;
                                    break;
                                }
                            }
                            
                            streamingSources.push({
                                server: serverName,
                                url: serverUrl,
                                quality: 'HD',
                                serverNumber: serverNum
                            });
                        }
                    });
                    
                    episodes.push({
                        number: episodeNum,
                        title: `Épisode ${episodeNum}`,
                        url: `${seasonUrl}episode-${episodeNum}`,
                        streamingSources: streamingSources,
                        language: language.toUpperCase(),
                        season: parseInt(season),
                        available: streamingSources.length > 0
                    });
                }
            }
            
            try {
                const $ = await scrapeAnimesama(seasonUrl);
                
                const episodeSelectors = [
                    'button[onclick*="episode"], a[href*="episode"]',
                    '.episode, .ep, [class*="episode"], [class*="ep"]',
                    'select option[value*="episode"]'
                ];
                
                let maxFoundEpisode = maxEpisodes;
                
                episodeSelectors.forEach(selector => {
                    $(selector).each((index, element) => {
                        const $el = $(element);
                        const text = $el.text() || $el.attr('onclick') || $el.attr('href') || $el.attr('value') || '';
                        
                        const episodeMatches = text.match(/(?:épisode|episode|ep\.?)\s*(\d+)/i);
                        if (episodeMatches) {
                            const foundEpisode = parseInt(episodeMatches[1]);
                            if (foundEpisode > maxFoundEpisode) {
                                maxFoundEpisode = foundEpisode;
                            }
                        }
                    });
                });
                
                if (maxFoundEpisode > maxEpisodes) {
                    console.log(`🎭 [Playwright] Found additional episodes up to ${maxFoundEpisode}`);
                    
                    for (let episodeNum = maxEpisodes + 1; episodeNum <= maxFoundEpisode; episodeNum++) {
                        episodes.push({
                            number: episodeNum,
                            title: `Épisode ${episodeNum}`,
                            url: `${seasonUrl}episode-${episodeNum}`,
                            streamingSources: [],
                            language: language.toUpperCase(),
                            season: parseInt(season),
                            available: true
                        });
                    }
                }
            } catch (htmlCheckError) {
                console.log('⚠️ [Playwright] Could not check HTML page for additional episodes:', htmlCheckError.message);
            }
            
        } catch (jsError) {
            console.error(`⚠️ [Playwright] Could not fetch episodes.js:`, jsError.message);
            
            try {
                const $ = await scrapeAnimesama(seasonUrl);
                
                const selectEpisodes = $('#selectEpisodes option').length;
                if (selectEpisodes > 0) {
                    for (let i = 1; i <= selectEpisodes; i++) {
                        episodes.push({
                            number: i,
                            title: `Épisode ${i}`,
                            url: `${seasonUrl}episode-${i}`,
                            streamingSources: [],
                            language: language.toUpperCase(),
                            season: parseInt(season),
                            available: false
                        });
                    }
                }
            } catch (fallbackError) {
                console.error('❌ [Playwright] Fallback page access failed:', fallbackError.message);
            }
        }
        
        episodes.sort((a, b) => a.number - b.number);
        
        if (episodes.length === 0) {
            throw new Error(`No episodes found for ${animeId} season ${season} in ${language}`);
        }
        
        console.log(`✅ [Playwright] Found ${episodes.length} episodes for: ${animeId} S${season}`);
        return episodes;
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting anime episodes:', error.message);
        throw error;
    }
}

async function getEpisodeSources(episodeUrl) {
    try {
        console.log(`🎭 [Playwright] Getting episode sources: ${episodeUrl}`);
        
        let finalUrl = episodeUrl;
        
        const episodeIdMatch = episodeUrl.match(/^([a-z0-9-]+)-s(\d+)-e(\d+)$/i);
        if (episodeIdMatch) {
            const [, animeId, season, episode] = episodeIdMatch;
            finalUrl = `https://anime-sama.eu/catalogue/${animeId}/saison${season}/vostfr/episode-${episode}`;
        } else if (!episodeUrl.includes('anime-sama.eu')) {
            finalUrl = `https://anime-sama.eu${episodeUrl}`;
        }
        
        console.log(`🎭 [Playwright] Extracting streaming sources from: ${finalUrl}`);
        
        if (finalUrl.includes('/catalogue/') && finalUrl.includes('/episode-')) {
            return await extractFromEpisodePage(finalUrl);
        }
        
        if (finalUrl.includes('/catalogue/') && (finalUrl.includes('/vostfr') || finalUrl.includes('/vf'))) {
            return await extractFromSeasonPage(finalUrl);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting episode sources:', error.message);
        return [];
    }
}

async function extractFromEpisodePage(episodeUrl) {
    try {
        const urlParts = episodeUrl.split('/');
        const animeId = urlParts[4];
        const seasonPath = urlParts[5];
        const language = urlParts[6];
        const episodePart = urlParts[7];
        
        if (!episodePart || !episodePart.includes('episode-')) {
            throw new Error('Invalid episode URL format');
        }
        
        const episodeNumber = parseInt(episodePart.replace('episode-', ''));
        
        const seasonUrl = `https://anime-sama.eu/catalogue/${animeId}/${seasonPath}/${language}/`;
        const episodesJsUrl = `${seasonUrl}episodes.js`;
        
        console.log(`🎭 [Playwright] Getting episodes.js from: ${episodesJsUrl}`);
        
        const jsResult = await fetchJavaScriptFile(episodesJsUrl, { 
            referer: seasonUrl,
            timeout: 15000 
        });
        
        const jsContent = jsResult.content;
        const sources = [];
        
        if (typeof jsContent === 'string' && jsContent.includes('var eps')) {
            const episodeArrayMatches = jsContent.match(/var eps(\d+) = \[([\s\S]*?)\];/g);
            
            if (episodeArrayMatches) {
                episodeArrayMatches.forEach((match) => {
                    const serverMatch = match.match(/var eps(\d+) = \[([\s\S]*?)\];/);
                    if (serverMatch) {
                        const serverNum = parseInt(serverMatch[1]);
                        const urlsContent = serverMatch[2];
                        
                        const urls = urlsContent.match(/'([^']+)'/g);
                        
                        if (urls && urls[episodeNumber - 1]) {
                            const episodeUrl = urls[episodeNumber - 1].replace(/'/g, '').trim();
                            
                            if (episodeUrl && episodeUrl.startsWith('http')) {
                                let serverName = `Server ${serverNum}`;
                                
                                for (const [domain, name] of Object.entries(SERVER_MAPPING)) {
                                    if (episodeUrl.toLowerCase().includes(domain)) {
                                        serverName = name;
                                        break;
                                    }
                                }
                                
                                sources.push({
                                    server: serverName,
                                    url: episodeUrl,
                                    quality: 'HD',
                                    type: 'streaming',
                                    episode: episodeNumber,
                                    serverNumber: serverNum
                                });
                            }
                        }
                    }
                });
            }
        }
        
        console.log(`✅ [Playwright] Found ${sources.length} sources for episode ${episodeNumber}`);
        return sources;
        
    } catch (error) {
        console.error('❌ [Playwright] Error extracting from episode page:', error.message);
        return [];
    }
}

async function extractFromSeasonPage(seasonUrl) {
    try {
        const episodesJsUrl = `${seasonUrl}episodes.js`;
        
        console.log(`🎭 [Playwright] Getting episodes.js from: ${episodesJsUrl}`);
        
        const jsResult = await fetchJavaScriptFile(episodesJsUrl, { 
            referer: seasonUrl,
            timeout: 15000 
        });
        
        const jsContent = jsResult.content;
        const sources = [];
        
        if (typeof jsContent === 'string' && jsContent.includes('var eps')) {
            const episodeArrayMatches = jsContent.match(/var eps(\d+) = \[([\s\S]*?)\];/g);
            
            if (episodeArrayMatches) {
                episodeArrayMatches.forEach((match) => {
                    const serverMatch = match.match(/var eps(\d+) = \[([\s\S]*?)\];/);
                    if (serverMatch) {
                        const serverNum = parseInt(serverMatch[1]);
                        const urlsContent = serverMatch[2];
                        
                        const urls = urlsContent.match(/'([^']+)'/g);
                        
                        if (urls && urls[0]) {
                            const firstEpisodeUrl = urls[0].replace(/'/g, '').trim();
                            
                            if (firstEpisodeUrl && firstEpisodeUrl.startsWith('http')) {
                                let serverName = `Server ${serverNum}`;
                                
                                for (const [domain, name] of Object.entries(SERVER_MAPPING)) {
                                    if (firstEpisodeUrl.toLowerCase().includes(domain)) {
                                        serverName = name;
                                        break;
                                    }
                                }
                                
                                sources.push({
                                    server: serverName,
                                    url: firstEpisodeUrl,
                                    quality: 'HD',
                                    type: 'streaming',
                                    episode: 1,
                                    serverNumber: serverNum,
                                    totalEpisodes: urls.length
                                });
                            }
                        }
                    }
                });
            }
        }
        
        console.log(`✅ [Playwright] Found ${sources.length} sources for season`);
        return sources;
        
    } catch (error) {
        console.error('❌ [Playwright] Error extracting from season page:', error.message);
        return [];
    }
}

async function getRecentEpisodes() {
    try {
        console.log(`🎭 [Playwright] Getting recent episodes...`);
        const $ = await scrapeAnimesama('https://anime-sama.eu/');
        
        const recentEpisodes = [];
        const seenEpisodes = new Set();
        
        const processedButtons = new Set();
        
        $('button.bg-cyan-600').each((index, element) => {
            const $button = $(element);
            const buttonText = $button.text().trim();
            
            const buttonId = `${index}-${buttonText}`;
            if (processedButtons.has(buttonId)) return;
            processedButtons.add(buttonId);
            
            const $container = $button.closest('a[href*="/catalogue/"]') || 
                              $button.parent().find('a[href*="/catalogue/"]') ||
                              $button.siblings('a[href*="/catalogue/"]');
            
            const href = $container.attr('href');
            if (!href || !href.includes('/catalogue/')) return;
            
            const isFinale = buttonText.includes('[FIN]');
            const isVFCrunchyroll = buttonText.includes('VF Crunchyroll');
            const isVFNetflix = buttonText.includes('VF Netflix');
            
            const episodeMatch = buttonText.match(/Episode\s*(\d+)/i);
            const seasonMatch = buttonText.match(/Saison\s*(\d+)/i);
            
            let seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1;
            let episodeNumber = episodeMatch ? parseInt(episodeMatch[1]) : null;
            
            const urlParts = href.split('/');
            const catalogueIndex = urlParts.indexOf('catalogue');
            const animeId = catalogueIndex >= 0 ? urlParts[catalogueIndex + 1] : null;
            
            if (!animeId || !episodeNumber) return;
            
            const uniqueKey = `${animeId}-s${seasonNumber}-e${episodeNumber}`;
            if (seenEpisodes.has(uniqueKey)) return;
            seenEpisodes.add(uniqueKey);
            
            let language = 'VOSTFR';
            if (href.includes('/vf/') || buttonText.includes('VF')) {
                language = 'VF';
            }
            
            let title = animeId.replace(/-/g, ' ')
                              .split(' ')
                              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ');
            
            recentEpisodes.push({
                id: uniqueKey,
                animeId: animeId,
                title: title,
                episode: episodeNumber,
                season: seasonNumber,
                language: language,
                isFinale: isFinale,
                isVFCrunchyroll: isVFCrunchyroll,
                isVFNetflix: isVFNetflix,
                url: href.startsWith('http') ? href : `https://anime-sama.eu${href}`,
                extractedFrom: 'Recent Episodes (Playwright)'
            });
        });
        
        console.log(`✅ [Playwright] Found ${recentEpisodes.length} recent episodes`);
        return recentEpisodes;
        
    } catch (error) {
        console.error('❌ [Playwright] Error getting recent episodes:', error.message);
        return [];
    }
}

module.exports = {
    scrapeAnimesama,
    searchAnime,
    getTrendingAnime,
    getAnimeDetails,
    getAnimeSeasons,
    getAnimeEpisodes,
    getEpisodeSources,
    getRecentEpisodes,
    LANGUAGE_SYSTEM,
    SERVER_MAPPING
};
