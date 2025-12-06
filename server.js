const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.get('/', (req, res) => {
    res.json({
        name: 'Anime-Sama API',
        version: '2.0.0',
        description: 'API de scraping temps réel pour anime-sama.eu',
        author: 'el_cid',
        status: 'running',
        endpoints: {
            search: '/api/search?query=naruto',
            recent: '/api/recent',
            planning: '/api/planning',
            popular: '/api/popular',
            recommendations: '/api/recommendations?page=1&limit=50',
            animeDetails: '/api/anime/:id',
            seasons: '/api/seasons/:animeId',
            episodes: '/api/episodes/:animeId?season=1&language=VOSTFR',
            episodeSources: '/api/episode-by-id/:episodeId',
            specificEpisode: '/api/episode/:animeId/:season/:episode',
            embed: '/api/embed?url=...'
        }
    });
});

app.get('/api/search', require('./api/search'));
app.get('/api/recent', require('./api/recent'));
app.get('/api/planning', require('./api/planning'));
app.get('/api/popular', require('./api/popular'));
app.get('/api/recommendations', require('./api/recommendations'));

app.get('/api/anime/:id', (req, res) => {
    req.query.id = req.params.id;
    require('./api/anime/[id]')(req, res);
});

app.get('/api/seasons/:animeId', (req, res) => {
    require('./api/seasons/[animeId]')(req, res);
});

app.get('/api/episodes/:animeId', (req, res) => {
    require('./api/episodes/[animeId]')(req, res);
});

app.get('/api/seasons', require('./api/seasons/index'));

app.get('/api/episode-by-id/:episodeId', (req, res) => {
    req.query.episodeId = req.params.episodeId;
    require('./api/episode-by-id')(req, res);
});

app.get('/api/episode/:animeId/:season/:ep', (req, res) => {
    req.query.animeId = req.params.animeId;
    req.query.season = req.params.season;
    req.query.ep = req.params.ep;
    require('./api/episode/[animeId]/[season]/[ep]')(req, res);
});

app.get('/api/embed', require('./api/embed'));

app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'Endpoint non trouvé',
        availableEndpoints: [
            '/api/search',
            '/api/recent',
            '/api/planning',
            '/api/popular',
            '/api/recommendations',
            '/api/anime/:id',
            '/api/seasons/:animeId',
            '/api/episodes/:animeId',
            '/api/episode-by-id/:episodeId',
            '/api/embed'
        ]
    });
});

app.use((error, req, res, next) => {
    console.error('Erreur:', error);
    res.status(500).json({
        error: 'Erreur serveur',
        message: process.env.NODE_ENV === 'production' ? 'Une erreur est survenue' : error.message
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║         ANIME-SAMA API v2.0               ║');
    console.log('║         Powered by el_cid                 ║');
    console.log('╠═══════════════════════════════════════════╣');
    console.log(`║  Server: http://0.0.0.0:${PORT}              ║`);
    console.log('║  Status: Running                          ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
});

module.exports = app;
