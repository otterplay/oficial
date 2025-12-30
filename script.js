class OtterPlay {
    constructor() {
        this.config = {
            JIKAN_API: 'https://api.jikan.moe/v4',
            INITIAL_COINS: 300,
            DAILY_COST: 50,
            VIP_COINS: 3000,
            CACHE_TTL: 30 * 60 * 1000,
            MAX_PAGES: 25
        };
        this.state = {
            user: null,
            isVip: false,
            coins: 0,
            ip: null,
            blockedIPs: new Set(),
            currentTab: 'trending',
            currentPage: 1,
            lastUpdate: Date.now(),
            permissions: {
                geolocation: false,
                notifications: false,
                storage: true
            }
        };
        this.cache = new Map();
        this.favorites = new Set();
        this.currentAnime = null;
        this.db = new Dexie('OtterPlayDB');
        this.initDB();
        this.initElements();
        this.initEventListeners();
        this.checkPermissions();
    }
    initDB() {
        this.db.version(1).stores({
            anime: 'id, title, score, cached_at',
            cache: 'key, data, expires',
            user: 'id',
            settings: 'key'
        });
    }
    initElements() {
        this.elements = {
            permissionModal: document.getElementById('permissionModal'),
            welcomeScreen: document.getElementById('welcomeScreen'),
            appContainer: document.getElementById('appContainer'),
            freeAccess: document.getElementById('freeAccess'),
            vipAccess: document.getElementById('vipAccess'),
            freeBtn: document.getElementById('freeBtn'),
            vipBtn: document.getElementById('vipBtn'),
            vipPreview: document.getElementById('vipPreview'),
            grantPermissions: document.getElementById('grantPermissions'),
            skipPermissions: document.getElementById('skipPermissions'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            userStatus: document.getElementById('userStatus'),
            statusText: document.getElementById('statusText'),
            coinsAmount: document.getElementById('coinsAmount'),
            logoutBtn: document.getElementById('logoutBtn'),
            navTabs: document.querySelectorAll('.nav-tab'),
            sectionTitle: document.getElementById('sectionTitle'),
            daysLeft: document.getElementById('daysLeft'),
            lastUpdate: document.getElementById('lastUpdate'),
            contentContainer: document.getElementById('contentContainer'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            loadMore: document.getElementById('loadMore'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            genreFilter: document.getElementById('genreFilter'),
            viewBtns: document.querySelectorAll('.view-btn'),
            refreshContent: document.getElementById('refreshContent'),
            heroTitle: document.getElementById('heroTitle'),
            heroSubtitle: document.getElementById('heroSubtitle'),
            upgradeBtn: document.getElementById('upgradeBtn'),
            playerModal: document.getElementById('playerModal'),
            modalOverlay: document.getElementById('modalOverlay'),
            animeTitle: document.getElementById('animeTitle'),
            infoEpisodes: document.getElementById('infoEpisodes'),
            infoGenre: document.getElementById('infoGenre'),
            infoStudio: document.getElementById('infoStudio'),
            infoRating: document.getElementById('infoRating'),
            infoSynopsis: document.getElementById('infoSynopsis'),
            episodeGrid: document.getElementById('episodeGrid'),
            closeModal: document.getElementById('closeModal'),
            playEpisodeBtn: document.getElementById('playEpisodeBtn'),
            platforms: document.querySelectorAll('.platform'),
            upgradeModal: document.getElementById('upgradeModal'),
            closeUpgrade: document.getElementById('closeUpgrade'),
            methodBtns: document.querySelectorAll('.method-btn'),
            confirmPayment: document.getElementById('confirmPayment'),
            blockModal: document.getElementById('blockModal'),
            blockedIP: document.getElementById('blockedIP'),
            blockVipBtn: document.getElementById('blockVipBtn')
        };
    }
    async init() {
        await this.getUserIP();
        await this.loadState();
        this.updateVIPPreview();
        this.setupPeriodicUpdates();
    }
    async getUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            this.state.ip = data.ip;
        } catch (error) {
            this.state.ip = '127.0.0.1';
            this.showNotification('Usando IP local', 'warning');
        }
    }
    async loadState() {
        try {
            const blocked = await this.db.settings.get('blocked_ips');
            if (blocked) {
                this.state.blockedIPs = new Set(blocked.value);
            }
            const user = await this.db.user.get(1);
            if (user) {
                this.state.user = user;
                this.state.isVip = user.isVip || false;
                this.state.coins = user.coins || this.config.INITIAL_COINS;
                if (this.state.blockedIPs.has(this.state.ip) && !this.state.isVip) {
                    this.showBlockModal();
                    return;
                }
                this.showApp();
                this.consumeDailyCoins();
                this.loadAnime(this.state.currentTab);
            }
        } catch (error) {
            console.error('Error loading state:', error);
        }
    }
    async checkPermissions() {
        if (!this.state.permissions.geolocation) {
            this.elements.permissionModal.classList.remove('hidden');
        }
    }
    async requestPermissions() {
        try {
            if ('geolocation' in navigator) {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                this.state.permissions.geolocation = true;
            }
            if ('Notification' in window && Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                this.state.permissions.notifications = permission === 'granted';
            }
            this.elements.permissionModal.classList.add('hidden');
            this.showNotification('Permisos concedidos', 'success');
        } catch (error) {
            this.showNotification('Algunos permisos fueron denegados', 'warning');
        }
    }
    initEventListeners() {
        document.querySelectorAll('.option-select').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const option = e.currentTarget.dataset.option;
                if (option === 'free') {
                    this.createFreeAccount();
                } else if (option === 'vip') {
                    this.showUpgradeModal();
                }
            });
        });
        this.elements.grantPermissions?.addEventListener('click', () => this.requestPermissions());
        this.elements.skipPermissions?.addEventListener('click', () => {
            this.elements.permissionModal.classList.add('hidden');
        });
        this.elements.navTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
        this.elements.refreshContent?.addEventListener('click', () => this.refreshAnime());
        this.elements.upgradeBtn?.addEventListener('click', () => this.showUpgradeModal());
        this.elements.loadMoreBtn?.addEventListener('click', () => this.loadMoreAnime());
        this.elements.viewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.elements.viewBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.toggleView(e.target.dataset.view);
            });
        });
        this.elements.genreFilter?.addEventListener('change', (e) => {
            this.filterAnimeByGenre(e.target.value);
        });
        this.elements.logoutBtn?.addEventListener('click', () => this.logout());
        this.elements.closeModal?.addEventListener('click', () => this.hideModal());
        this.elements.modalOverlay?.addEventListener('click', () => this.hideModal());
        this.elements.playEpisodeBtn?.addEventListener('click', () => this.playEpisode());
        this.elements.closeUpgrade?.addEventListener('click', () => this.hideUpgradeModal());
        this.elements.confirmPayment?.addEventListener('click', () => this.upgradeToVIP());
        this.elements.blockVipBtn?.addEventListener('click', () => this.showUpgradeModal());
        this.elements.methodBtns?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.elements.methodBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        this.elements.platforms?.forEach(platform => {
            platform.addEventListener('click', (e) => {
                e.preventDefault();
                const url = platform.href;
                window.open(url, '_blank');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideModal();
                this.hideUpgradeModal();
            }
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.refreshAnime();
            }
        });
        window.addEventListener('online', () => {
            this.showNotification('Conexión restablecida', 'success');
            this.refreshAnime();
        });
        window.addEventListener('offline', () => {
            this.showNotification('Sin conexión a internet', 'error');
        });
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    }
    async createFreeAccount() {
        const randomId = Math.random().toString(36).substring(2, 10);
        this.state.user = {
            id: 1,
            name: `Otter_${randomId}`,
            email: `otter_${randomId}@play.free`,
            created: Date.now()
        };
        this.state.isVip = false;
        this.state.coins = this.config.INITIAL_COINS;
        await this.saveUser();
        this.showApp();
        this.loadAnime('trending');
        this.showNotification(`¡Bienvenido ${this.state.user.name}! 300 gotas iniciales`, 'success');
    }
    showApp() {
        this.elements.welcomeScreen.classList.add('hidden');
        this.elements.appContainer.classList.remove('hidden');
        this.updateUserUI();
        this.updateHeroContent();
    }
    updateUserUI() {
        if (!this.state.user) return;
        this.elements.userAvatar.textContent = this.state.user.name.charAt(0).toUpperCase();
        this.elements.userName.textContent = this.state.user.name;
        const days = Math.floor(this.state.coins / this.config.DAILY_COST);
        this.elements.daysLeft.textContent = `${days} días`;
        this.elements.coinsAmount.textContent = this.state.coins;
        this.elements.statusText.textContent = this.state.coins > 50 ? 'Nadando' : 'Bajo nivel';
    }
    updateHeroContent() {
        const now = new Date();
        const hours = now.getHours();
        if (hours < 12) {
            this.elements.heroTitle.textContent = 'Buenos días, otaku';
            this.elements.heroSubtitle.textContent = 'Empieza tu día con el mejor anime';
        } else if (hours < 18) {
            this.elements.heroTitle.textContent = 'Buenas tardes, navegante';
            this.elements.heroSubtitle.textContent = 'Continúa tu aventura anime';
        } else {
            this.elements.heroTitle.textContent = 'Buenas noches, soñador';
            this.elements.heroSubtitle.textContent = 'Relájate con anime estelar';
        }
        this.elements.lastUpdate.textContent = 'Actualizado hace unos momentos';
    }
    async switchTab(tab) {
        this.state.currentTab = tab;
        this.state.currentPage = 1;
        this.elements.navTabs.forEach(t => t.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        const titles = {
            trending: 'Anime Trending',
            airing: 'En Emisión',
            upcoming: 'Próximos Estrenos',
            favorites: 'Tus Favoritos'
        };
        this.elements.sectionTitle.textContent = titles[tab] || 'Anime';
        await this.loadAnime(tab);
    }
    async loadAnime(type) {
        try {
            this.showLoading();
            let endpoint;
            switch(type) {
                case 'trending':
                    endpoint = '/top/anime';
                    break;
                case 'airing':
                    endpoint = '/seasons/now';
                    break;
                case 'upcoming':
                    endpoint = '/seasons/upcoming';
                    break;
                case 'favorites':
                    await this.loadFavorites();
                    return;
                default:
                    endpoint = '/top/anime';
            }
            const data = await this.fetchWithCache(
                `${this.config.JIKAN_API}${endpoint}?page=${this.state.currentPage}`
            );
            this.displayAnime(data.data);
            this.updateGenresFilter(data.data);
            if (data.pagination && data.pagination.has_next_page) {
                this.elements.loadMore.classList.remove('hidden');
            } else {
                this.elements.loadMore.classList.add('hidden');
            }
        } catch (error) {
            this.showNotification('Error cargando anime', 'error');
            console.error('Error loading anime:', error);
        } finally {
            this.hideLoading();
        }
    }
    async fetchWithCache(url) {
        const cacheKey = `cache_${btoa(url)}`;
        const now = Date.now();
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.config.CACHE_TTL) {
                return cached.data;
            }
        }
        try {
            const cached = await this.db.cache.get(cacheKey);
            if (cached && now < cached.expires) {
                this.cache.set(cacheKey, {
                    data: cached.data,
                    timestamp: cached.expires - this.config.CACHE_TTL
                });
                return cached.data;
            }
        } catch (error) {
            console.log('Cache miss in IndexedDB');
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        const cacheItem = {
            data,
            timestamp: now
        };
        this.cache.set(cacheKey, cacheItem);
        await this.db.cache.put({
            key: cacheKey,
            data,
            expires: now + this.config.CACHE_TTL
        });
        return data;
    }
    displayAnime(animeList) {
        if (this.state.currentPage === 1) {
            this.elements.contentContainer.innerHTML = '';
        }
        animeList.forEach(anime => {
            const card = this.createAnimeCard(anime);
            this.elements.contentContainer.appendChild(card);
        });
        this.state.lastUpdate = Date.now();
    }
    createAnimeCard(anime) {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.dataset.id = anime.mal_id;
        const genres = anime.genres?.map(g => g.name).slice(0, 2).join(', ') || 'General';
        const score = anime.score || 'N/A';
        const imageUrl = anime.images?.jpg?.large_image_url || 
                        anime.images?.jpg?.image_url || 
                        'https://via.placeholder.com/280x160/1a2b4a/00b4d8?text=No+Image';
        card.innerHTML = `
            <div class="card-image">
                <img src="${imageUrl}" alt="${anime.title}" loading="lazy">
            </div>
            <div class="card-content">
                <h4 class="card-title">${anime.title}</h4>
                <div class="card-meta">
                    <span class="card-genre" title="${genres}">${genres}</span>
                    <span class="card-rating">
                        <i class="fas fa-star"></i>
                        ${score}
                    </span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => this.showAnimeDetails(anime));
        return card;
    }
    async showAnimeDetails(anime) {
        this.currentAnime = anime;
        this.elements.animeTitle.textContent = anime.title;
        this.elements.infoEpisodes.textContent = anime.episodes || '?';
        this.elements.infoGenre.textContent = anime.genres?.map(g => g.name).join(', ') || 'Desconocido';
        this.elements.infoStudio.textContent = anime.studios?.[0]?.name || 'Desconocido';
        this.elements.infoRating.textContent = anime.score || 'N/A';
        this.elements.infoSynopsis.textContent = anime.synopsis?.replace(/\\n/g, '\n') || 'Sin sinopsis disponible.';
        await this.loadEpisodes(anime.mal_id);
        this.elements.playerModal.classList.remove('hidden');
    }
    async loadEpisodes(animeId) {
        try {
            const data = await this.fetchWithCache(
                `${this.config.JIKAN_API}/anime/${animeId}/episodes`
            );
            this.elements.episodeGrid.innerHTML = '';
            if (data.data && data.data.length > 0) {
                data.data.slice(0, 12).forEach(episode => {
                    const btn = document.createElement('button');
                    btn.className = 'episode-btn';
                    btn.textContent = episode.mal_id;
                    btn.dataset.episode = episode.mal_id;
                    btn.addEventListener('click', (e) => this.selectEpisode(e, episode));
                    if (episode.mal_id === 1) btn.classList.add('active');
                    this.elements.episodeGrid.appendChild(btn);
                });
                this.elements.playEpisodeBtn.innerHTML = `
                    <i class="fas fa-play"></i>
                    <span>Reproducir Episodio 1</span>
                `;
            } else {
                this.elements.episodeGrid.innerHTML = '<p>No hay episodios disponibles</p>';
            }
        } catch (error) {
            console.error('Error loading episodes:', error);
        }
    }
    selectEpisode(e, episode) {
        this.elements.episodeGrid.querySelectorAll('.episode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');
        this.elements.playEpisodeBtn.innerHTML = `
            <i class="fas fa-play"></i>
            <span>Reproducir ${episode.title || `Episodio ${episode.mal_id}`}</span>
        `;
    }
    async playEpisode() {
        if (!this.currentAnime) return;
        if (this.state.isVip || this.state.coins >= this.config.DAILY_COST) {
            if (!this.state.isVip) {
                this.state.coins -= this.config.DAILY_COST;
                await this.saveUser();
                this.updateUserUI();
                if (this.state.coins <= 0) {
                    await this.blockUser();
                    return;
                }
            }
            this.hideModal();
            this.showNotification('Reproduciendo episodio...', 'success');
            setTimeout(() => {
                this.showNotification('Episodio completado', 'info');
            }, 3000);
        } else {
            await this.blockUser();
        }
    }
    async blockUser() {
        this.state.blockedIPs.add(this.state.ip);
        await this.db.settings.put({
            key: 'blocked_ips',
            value: Array.from(this.state.blockedIPs)
        });
        this.elements.blockedIP.textContent = this.state.ip;
        this.elements.blockModal.classList.remove('hidden');
        this.showNotification('¡Te quedaste sin gotas! IP bloqueada', 'error');
    }
    async upgradeToVIP() {
        this.showNotification('Procesando pago...', 'info');
        setTimeout(async () => {
            this.state.isVip = true;
            this.state.coins = this.config.VIP_COINS;
            await this.saveUser();
            this.updateUserUI();
            this.hideUpgradeModal();
            this.elements.blockModal.classList.add('hidden');
            this.showNotification('¡Bienvenido a la Manada Otter VIP!', 'success');
        }, 2000);
    }
    async saveUser() {
        await this.db.user.put({
            id: 1,
            ...this.state.user,
            isVip: this.state.isVip,
            coins: this.state.coins,
            lastLogin: Date.now()
        });
    }
    async consumeDailyCoins() {
        if (this.state.isVip) return;
        const lastConsumption = await this.db.settings.get('last_consumption');
        const today = new Date().toDateString();
        if (!lastConsumption || lastConsumption.value !== today) {
            if (this.state.coins >= this.config.DAILY_COST) {
                this.state.coins -= this.config.DAILY_COST;
                await this.saveUser();
                await this.db.settings.put({ key: 'last_consumption', value: today });
                this.updateUserUI();
                this.showNotification(`Consumo diario: -${this.config.DAILY_COST} gotas`, 'warning');
                if (this.state.coins <= 0) {
                    await this.blockUser();
                }
            } else {
                await this.blockUser();
            }
        }
    }
    async refreshAnime() {
        const cacheKeys = Array.from(this.cache.keys()).filter(key => 
            key.includes(this.state.currentTab)
        );
        cacheKeys.forEach(key => this.cache.delete(key));
        this.state.currentPage = 1;
        await this.loadAnime(this.state.currentTab);
        this.showNotification('Anime actualizado', 'success');
    }
    async loadMoreAnime() {
        this.state.currentPage++;
        await this.loadAnime(this.state.currentTab);
    }
    updateGenresFilter(animeList) {
        const genres = new Set();
        animeList.forEach(anime => {
            anime.genres?.forEach(genre => genres.add(genre.name));
        });
        const filter = this.elements.genreFilter;
        const currentValue = filter.value;
        filter.innerHTML = '<option value="">Todos los géneros</option>';
        Array.from(genres).sort().forEach(genre => {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre;
            filter.appendChild(option);
        });
        filter.value = currentValue;
    }
    filterAnimeByGenre(genre) {
        const cards = this.elements.contentContainer.querySelectorAll('.anime-card');
        cards.forEach(card => {
            const cardGenre = card.querySelector('.card-genre').textContent;
            if (!genre || cardGenre.includes(genre)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }
    toggleView(view) {
        this.elements.contentContainer.className = `content-container ${view}-view`;
    }
    async loadFavorites() {
        const favorites = await this.db.anime.where('favorite').equals(1).toArray();
        this.displayAnime(favorites);
    }
    showUpgradeModal() {
        this.elements.upgradeModal.classList.remove('hidden');
    }
    hideUpgradeModal() {
        this.elements.upgradeModal.classList.add('hidden');
    }
    hideModal() {
        this.elements.playerModal.classList.add('hidden');
    }
    showBlockModal() {
        this.elements.blockModal.classList.remove('hidden');
    }
    showLoading() {
        this.elements.loadingIndicator.classList.remove('hidden');
    }
    hideLoading() {
        this.elements.loadingIndicator.classList.add('hidden');
    }
    updateVIPPreview() {
        const vipUsers = [
            { name: 'Sakura Otter', coins: 2850 },
            { name: 'Naruto Stream', coins: 3000 },
            { name: 'Goku Flow', coins: 2450 },
            { name: 'Luffy Wave', coins: 1950 },
            { name: 'Zenitsu Bolt', coins: 3000 }
        ];
        this.elements.vipPreview.innerHTML = vipUsers.map(user => `
            <div class="vip-user">
                <i class="fas fa-crown"></i>
                <span>${user.name}</span>
            </div>
        `).join('');
    }
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        const container = document.querySelector('.notifications');
        container.appendChild(notification);
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    setupPeriodicUpdates() {
        setInterval(() => {
            this.refreshAnime();
        }, 5 * 60 * 1000);
        setInterval(() => {
            this.consumeDailyCoins();
        }, 60 * 1000);
    }
    async logout() {
        if (confirm('¿Estás seguro de querer cerrar sesión?')) {
            await this.db.user.delete(1);
            this.state.user = null;
            this.state.isVip = false;
            this.state.coins = 0;
            this.elements.appContainer.classList.add('hidden');
            this.elements.welcomeScreen.classList.remove('hidden');
            this.showNotification('Sesión cerrada', 'info');
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    window.otterPlay = new OtterPlay();
    window.otterPlay.init();
});