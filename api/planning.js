const { scrapeAnimesama } = require('../utils/scraper');

function convertTime(frenchTime, targetTimezone) {
    if (!frenchTime || !targetTimezone || frenchTime === '?') return frenchTime;
    
    const timeMatch = frenchTime.match(/(\d{1,2})[h:](\d{2})/);
    if (!timeMatch) return frenchTime;
    
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    
    switch(targetTimezone.toLowerCase()) {
        case 'gmt':
        case 'utc':
        case 'gmt+0':
            const now = new Date();
            const isWinter = now.getMonth() < 2 || now.getMonth() > 9;
            hours += isWinter ? -1 : -2;
            break;
        case 'gmt+1':
            hours -= 1;
            break;
        default:
            return frenchTime;
    }
    
    if (hours < 0) hours += 24;
    if (hours >= 24) hours -= 24;
    
    return `${hours.toString().padStart(2, '0')}h${minutes}`;
}

module.exports = async (req, res) => {
    try {
        const { day, filter, timezone } = req.query;
        const detectedTimezone = timezone || 'gmt+0';
        
        const today = new Date();
        const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        const currentDay = dayNames[today.getDay()];
        
        const $ = await scrapeAnimesama('https://anime-sama.org/planning');
        
        const planningData = {
            success: true,
            extractedAt: new Date().toISOString(),
            days: {}
        };
        
        const daysOfWeek = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
        const daysFrench = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        
        daysOfWeek.forEach((dayKey, index) => {
            planningData.days[dayKey] = {
                day: daysFrench[index],
                count: 0,
                items: []
            };
        });
        
        const pageHtml = $.html();
        const dayPositions = [];
        
        daysOfWeek.forEach(dayKey => {
            const dayFrench = daysFrench[daysOfWeek.indexOf(dayKey)];
            const regex = new RegExp(`##\\s*${dayFrench}|<h2[^>]*>\\s*${dayFrench}|>\\s*${dayFrench}\\s*<\\/`, 'gi');
            let match;
            while ((match = regex.exec(pageHtml)) !== null) {
                dayPositions.push({ day: dayKey, position: match.index });
            }
        });
        
        dayPositions.sort((a, b) => a.position - b.position);
        
        function getDayForPosition(pos) {
            let currentDay = 'dimanche';
            for (const dp of dayPositions) {
                if (dp.position > pos) break;
                currentDay = dp.day;
            }
            return currentDay;
        }
        
        $('a[href*="/catalogue/"]').each((index, element) => {
            const $link = $(element);
            const href = $link.attr('href');
            
            if (!href || !href.includes('/catalogue/')) return;
            if (!href.includes('/saison') && !href.includes('/scan')) return;
            
            const cardText = $link.text().trim();
            const urlParts = href.split('/');
            const catalogueIndex = urlParts.indexOf('catalogue');
            if (catalogueIndex === -1) return;
            
            const animeId = urlParts[catalogueIndex + 1];
            if (!animeId) return;
            
            let language = 'VOSTFR';
            const $flag = $link.find('img[src*="flag_"]');
            if ($flag.length) {
                const flagSrc = $flag.attr('src') || '';
                if (flagSrc.includes('flag_fr')) language = 'VF';
                else if (flagSrc.includes('flag_cn')) language = 'VCN';
            }
            if (href.includes('/vf/')) language = 'VF';
            
            const contentType = href.includes('/scan/') ? 'scan' : 'anime';
            const timeMatch = cardText.match(/(\d{1,2}h\d{2})/);
            const releaseTime = timeMatch ? timeMatch[1] : '?';
            
            let title = $link.find('strong').first().text().trim();
            if (!title) {
                title = animeId.replace(/-/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
            }
            
            const seasonMatch = cardText.match(/Saison\s*(\d+)/i);
            const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1;
            
            const $img = $link.find('img[src*="/contenu/"]').first();
            const image = $img.attr('src') || `https://cdn.statically.io/gh/Anime-Sama/IMG/img/contenu/${animeId}.jpg`;
            
            const isReported = cardText.toLowerCase().includes('reporté');
            
            const elementHtml = $.html(element);
            const elementPosition = pageHtml.indexOf(elementHtml);
            const daySection = getDayForPosition(elementPosition);
            
            const item = {
                animeId,
                title,
                url: href.startsWith('http') ? href : `https://anime-sama.org${href}`,
                image,
                releaseTime: convertTime(releaseTime, detectedTimezone),
                language,
                type: contentType,
                season: seasonNumber,
                status: isReported ? 'reporté' : 'scheduled'
            };
            
            if (planningData.days[daySection]) {
                const exists = planningData.days[daySection].items.some(
                    existing => existing.animeId === animeId && existing.language === language
                );
                if (!exists) {
                    planningData.days[daySection].items.push(item);
                    planningData.days[daySection].count++;
                }
            }
        });
        
        Object.keys(planningData.days).forEach(dayKey => {
            planningData.days[dayKey].items.sort((a, b) => {
                if (a.releaseTime === '?' && b.releaseTime !== '?') return 1;
                if (a.releaseTime !== '?' && b.releaseTime === '?') return -1;
                return a.releaseTime.localeCompare(b.releaseTime);
            });
        });
        
        if (day && day.toLowerCase() !== 'all' && planningData.days[day.toLowerCase()]) {
            return res.json({
                success: true,
                day,
                extractedAt: planningData.extractedAt,
                ...planningData.days[day.toLowerCase()]
            });
        }
        
        if (!day || day.toLowerCase() !== 'all') {
            const todayData = planningData.days[currentDay];
            if (todayData) {
                return res.json({
                    success: true,
                    currentDay,
                    extractedAt: planningData.extractedAt,
                    ...todayData
                });
            }
        }
        
        if (filter) {
            Object.keys(planningData.days).forEach(dayKey => {
                planningData.days[dayKey].items = planningData.days[dayKey].items.filter(item => {
                    switch (filter.toLowerCase()) {
                        case 'anime': return item.type === 'anime';
                        case 'scan': return item.type === 'scan';
                        case 'vf': return item.language === 'VF';
                        case 'vostfr': return item.language === 'VOSTFR';
                        default: return true;
                    }
                });
                planningData.days[dayKey].count = planningData.days[dayKey].items.length;
            });
        }
        
        planningData.totalItems = Object.values(planningData.days).reduce((sum, day) => sum + day.count, 0);
        planningData.currentDay = currentDay;
        
        res.json(planningData);
        
    } catch (error) {
        console.error('Planning API error:', error);
        res.status(500).json({
            error: 'Failed to fetch planning',
            message: 'Impossible de récupérer le planning'
        });
    }
};
