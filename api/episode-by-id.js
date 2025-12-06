const { getEpisodeSources } = require('../utils/scraper');

module.exports = async (req, res) => {
    try {
        const episodeId = req.params?.episodeId || req.query?.episodeId;

        if (!episodeId || episodeId.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Episode ID is required',
                message: 'Utilisez /api/episode-by-id/:episodeId'
            });
        }

        const sources = await getEpisodeSources(episodeId.trim());

        res.json({
            success: true,
            episodeId: episodeId.trim(),
            count: sources.length,
            sources
        });

    } catch (error) {
        console.error('Episode sources API error:', error);
        res.status(500).json({
            error: 'Failed to fetch episode sources',
            message: 'Impossible de récupérer les sources'
        });
    }
};
