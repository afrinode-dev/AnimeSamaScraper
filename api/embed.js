const { getEpisodeSources } = require('../utils/scraper');

module.exports = async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ 
                error: 'URL parameter is required',
                message: 'Utilisez /api/embed?url=...'
            });
        }

        const decodedUrl = decodeURIComponent(url);

        if (!decodedUrl.includes('anime-sama.eu') && !decodedUrl.match(/^https?:\/\//)) {
            return res.status(400).json({
                error: 'Invalid URL',
                message: 'URL anime-sama.eu requise'
            });
        }

        const sources = await getEpisodeSources(decodedUrl);

        if (sources.length === 0) {
            return res.status(404).json({
                error: 'No streaming sources found',
                message: 'Aucune source trouvée',
                url: decodedUrl
            });
        }

        res.json({
            success: true,
            url: decodedUrl,
            sources,
            count: sources.length,
            extractedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Embed API error:', error);
        res.status(500).json({
            error: 'Failed to extract sources',
            message: 'Impossible d\'extraire les sources'
        });
    }
};
