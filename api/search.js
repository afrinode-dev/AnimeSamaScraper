const { searchAnime } = require('../utils/scraper');

module.exports = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Query parameter is required',
                message: 'Utilisez ?query=nom_anime'
            });
        }

        const results = await searchAnime(query.trim());

        res.json({
            success: true,
            query: query.trim(),
            count: results.length,
            animes: results
        });

    } catch (error) {
        console.error('Search API error:', error);
        res.status(500).json({
            error: 'Search failed',
            message: 'Impossible de rechercher pour le moment'
        });
    }
};
