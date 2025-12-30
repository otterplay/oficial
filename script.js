/**
 * OtterPlay - Streaming de Anime Optimizado
 * Versión: 2.0.0
 */

class OtterPlay {
    constructor() {
        this.config = {
            JIKAN_API: 'https://api.jikan.moe/v4',
            INITIAL_COINS: 300,
            DAILY_COST: 50,
            VIP_COINS: 3000,
            CACHE_TTL: 60 * 60 * 1000, // 1 hora de cache
            MAX_PAGES: 25
        };

        this.state = {
            user: null,
            isVip: false,
            coins: 0,
            ip: '127.0.0.1',
            blockedIPs: new Set(),
            currentTab: 'trending',
            currentPage: 1,
            isLoading: false,
            currentAnime: null
        };

        this.db = new Dexie('OtterPlayDB');
        this.initDB();
        this.initElements();
        this.initEventListeners();
        this.init();
    }

    initDB() {
        this.db.version(2).stores({
            user: 'id',
            cache: 'key, expires',
            settings: 'key'
        });
    }

    initElements() {
        const get = (id) => document.getElementById(id);
        this.elements = {
            permissionModal: get('permissionModal'),
            welcomeScreen: get('welcomeScreen'),
            appContainer: get('appContainer'),
            grantPermissions: get('grantPermissions'),
            skipPermissions: get('skipPermissions'),
            userAvatar: get('userAvatar'),
            userName: get('userName'),
            coinsAmount: get('coinsAmount'),
            logoutBtn: get('logoutBtn'),
            navTabs: document.querySelectorAll('.nav-tab'),
            sectionTitle: get('sectionTitle'),
            daysLeft: get('daysLeft'),
            lastUpdate: get('lastUpdate'),
            contentContainer: get('contentContainer'),
            loadingIndicator: get('loadingIndicator'),
            loadMoreBtn: get('loadMoreBtn'),
            genreFilter: get('genreFilter'),
            viewBtns: document.querySelectorAll('.view-btn'),
            refreshContent: get('refreshContent'),
            heroTitle: get('heroTitle'),
            heroSubtitle: get('heroSubtitle'),
            upgradeBtn: get('upgradeBtn'),
            playerModal: get('playerModal'),
            modalOverlay: get('modalOverlay'),
            animeTitle: get('animeTitle'),
            infoSynopsis: get('infoSynopsis'),
            episodeGrid: get('episodeGrid'),
            closeModal: get('closeModal'),
            playEpisodeBtn: get('playEpisodeBtn'),
            upgradeModal: get('upgradeModal'),
            closeUpgrade: get('closeUpgrade'),
            confirmPayment: get('confirmPayment'),
            blockModal: get('blockModal'),
            blockedIP: get('blockedIP'),
            blockVipBtn: get('blockVipBtn'),
            notifications: get('notifications')
        };
    }

    async init() {
        await this.getUserIP();
        await this.loadState();
        this.setupPeriodicUpdates();
    }

    async getUserIP() {
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            this.state.ip = data.ip;
        } catch (e) {
            console.warn('Usando IP por defecto');
        }
    }

    async loadState() {
        const user = await this.db.user.get(1);
        const blocked = await this.db.settings.get('blocked_ips');
        
        if (blocked) this.state.blockedIPs = new Set(blocked.value);

        if (user) {
            this.state.user = user;
            this.state.isVip = user.isVip;
            this.state.coins = user.coins;

            if (this.state.blockedIPs.has(this.state.ip) && !this.state.isVip) {
                this.showBlockModal();
                return;
            }

            this.showApp();
            this.loadAnime(this.state.currentTab);
        } else {
            this.elements.welcomeScreen.classList.remove('hidden');
        }
    }

    initEventListeners() {
        // Acceso
        document.querySelectorAll('.option-select').forEach(btn => {
            btn.onclick = () => btn.dataset.option === 'free' ? this.createAccount() : this.showUpgradeModal();
        });

        // Navegación
        this.elements.navTabs.forEach(tab => {
            tab.onclick = () => this.switchTab(tab.dataset.tab);
        });

        // Controles
        this.elements.refreshContent.onclick = () => this.refreshAnime();
        this.elements.loadMoreBtn.onclick = () => this.loadMore();
        this.elements.logoutBtn.onclick = () => this.logout();
        
        // Modales
        const closeModals = () => {
            this.elements.playerModal.classList.add('hidden');
            this.elements.upgradeModal.classList.add('hidden');
        };
        this.elements.closeModal.onclick = closeModals;
        this.elements.modalOverlay.onclick = closeModals;
        this.elements.closeUpgrade.onclick = closeModals;

        // Acciones
        this.elements.playEpisodeBtn.onclick = () => this.playEpisode();
        this.elements.confirmPayment.onclick = () => this.upgradeToVIP();
        this.elements.blockVipBtn.onclick = () => this.showUpgradeModal();
        this.elements.upgradeBtn.onclick = () => this.showUpgradeModal();

        // Filtros
        this.elements.genreFilter.onchange = (e) => this.filterByGenre(e.target.value);
        
        this.elements.viewBtns.forEach(btn => {
            btn.onclick = () => {
                this.elements.viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.toggleView(btn.dataset.view);
            };
        });
    }

    async createAccount() {
        const id = Math.random().toString(36).slice(2, 10);
        this.state.user = { id: 1, name: `Otter_${id}`, created: Date.now() };
        this.state.coins = this.config.INITIAL_COINS;
        await this.saveUser();
        this.showApp();
        this.loadAnime('trending');
        this.showNotification(`¡Bienvenido ${this.state.user.name}!`, 'success');
    }

    showApp() {
        this.elements.welcomeScreen.classList.add('hidden');
        this.elements.appContainer.classList.remove('hidden');
        this.updateUI();
    }

    updateUI() {
        if (!this.state.user) return;
        this.elements.userAvatar.textContent = this.state.user.name[0].toUpperCase();
        this.elements.userName.textContent = this.state.user.name;
        this.elements.coinsAmount.textContent = this.state.coins;
        this.elements.daysLeft.textContent = `${Math.floor(this.state.coins / this.config.DAILY_COST)} días`;
        
        const h = new Date().getHours();
        this.elements.heroTitle.textContent = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
    }

    async switchTab(tab) {
        if (this.state.currentTab === tab) return;
        this.state.currentTab = tab;
        this.state.currentPage = 1;
        this.elements.navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        this.elements.sectionTitle.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
        await this.loadAnime(tab);
    }

    async loadAnime(type) {
        if (this.state.isLoading) return;
        this.state.isLoading = true;
        this.elements.loadingIndicator.classList.remove('hidden');

        try {
            const endpoints = {
                trending: '/top/anime',
                airing: '/seasons/now',
                upcoming: '/seasons/upcoming'
            };
            
            const url = `${this.config.JIKAN_API}${endpoints[type] || endpoints.trending}?page=${this.state.currentPage}`;
            const data = await this.fetchWithCache(url);
            
            this.renderAnime(data.data);
            this.updateFilters(data.data);
            this.elements.loadMoreBtn.parentElement.classList.toggle('hidden', !data.pagination.has_next_page);
        } catch (e) {
            this.showNotification('Error al cargar contenido', 'error');
        } finally {
            this.state.isLoading = false;
            this.elements.loadingIndicator.classList.add('hidden');
        }
    }

    async fetchWithCache(url) {
        const key = btoa(url);
        const cached = await this.db.cache.get(key);
        if (cached && cached.expires > Date.now()) return cached.data;

        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        await this.db.cache.put({ key, data, expires: Date.now() + this.config.CACHE_TTL });
        return data;
    }

    renderAnime(list) {
        if (this.state.currentPage === 1) this.elements.contentContainer.innerHTML = '';
        
        list.forEach(anime => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            card.innerHTML = `
                <img src="${anime.images.jpg.image_url}" class="card-image" loading="lazy">
                <div class="card-content">
                    <h4 class="card-title">${anime.title}</h4>
                    <div class="card-meta">
                        <span class="card-genre">${anime.genres[0]?.name || 'Anime'}</span>
                        <span class="card-rating"><i class="fas fa-star"></i> ${anime.score || 'N/A'}</span>
                    </div>
                </div>
            `;
            card.onclick = () => this.showDetails(anime);
            this.elements.contentContainer.appendChild(card);
        });
    }

    showDetails(anime) {
        this.state.currentAnime = anime;
        this.elements.animeTitle.textContent = anime.title;
        this.elements.infoSynopsis.textContent = anime.synopsis || 'Sin descripción.';
        this.renderEpisodes(anime.mal_id);
        this.elements.playerModal.classList.remove('hidden');
    }

    async renderEpisodes(id) {
        this.elements.episodeGrid.innerHTML = '<div class="spinner"></div>';
        try {
            const data = await this.fetchWithCache(`${this.config.JIKAN_API}/anime/${id}/episodes`);
            this.elements.episodeGrid.innerHTML = '';
            (data.data || []).slice(0, 12).forEach(ep => {
                const btn = document.createElement('button');
                btn.className = 'episode-btn';
                btn.textContent = ep.mal_id;
                btn.onclick = () => {
                    this.elements.episodeGrid.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };
                this.elements.episodeGrid.appendChild(btn);
            });
        } catch (e) {
            this.elements.episodeGrid.innerHTML = 'No disponible';
        }
    }

    async playEpisode() {
        if (!this.state.isVip) {
            if (this.state.coins < this.config.DAILY_COST) return this.showBlockModal();
            this.state.coins -= this.config.DAILY_COST;
            await this.saveUser();
            this.updateUI();
        }
        this.showNotification('Iniciando reproducción...', 'success');
        setTimeout(() => this.elements.playerModal.classList.add('hidden'), 1000);
    }

    async upgradeToVIP() {
        // En una implementación real, aquí se verificaría el pago con una API
        // Para esta versión, simulamos la confirmación tras el escaneo del QR
        this.showNotification('Verificando transacción...', 'info');
        
        // Simulamos un pequeño retraso de verificación
        setTimeout(async () => {
            this.state.isVip = true;
            this.state.coins = this.config.VIP_COINS;
            await this.saveUser();
            this.updateUI();
            
            // Cerrar modales
            this.elements.upgradeModal.classList.add('hidden');
            this.elements.blockModal.classList.add('hidden');
            
            this.showNotification('¡Pago confirmado! Ya eres VIP.', 'success');
            
            // Efecto visual de éxito
            this.elements.userStatus.querySelector('#statusText').textContent = 'VIP Otter';
            this.elements.userStatus.querySelector('#statusText').style.color = 'var(--gold)';
        }, 2000);
    }

    showUpgradeModal() {
        // Aquí podrías actualizar dinámicamente el QR si fuera necesario
        // Por ejemplo, codificando el ID de usuario en el QR
        const qrData = `TRANSFERMOVIL_PAGO_OTTERPLAY_USER_${this.state.user.id}_AMOUNT_250`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
        
        const qrImg = document.getElementById('paymentQR');
        if (qrImg) qrImg.src = qrUrl;
        
        this.elements.upgradeModal.classList.remove('hidden');
    }

    showNotification(msg, type) {
        const n = document.createElement('div');
        n.className = `notification ${type}`;
        n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'info'}-circle"></i> ${msg}`;
        this.elements.notifications.appendChild(n);
        setTimeout(() => n.remove(), 3000);
    }

    async saveUser() {
        await this.db.user.put({ id: 1, ...this.state.user, isVip: this.state.isVip, coins: this.state.coins });
    }

    showBlockModal() {
        this.elements.blockedIP.textContent = this.state.ip;
        this.elements.blockModal.classList.remove('hidden');
    }

    logout() {
        this.db.delete().then(() => location.reload());
    }

    updateFilters(list) {
        const genres = [...new Set(list.flatMap(a => a.genres.map(g => g.name)))];
        this.elements.genreFilter.innerHTML = '<option value="">Géneros</option>' + 
            genres.map(g => `<option value="${g}">${g}</option>`).join('');
    }

    toggleView(view) {
        this.elements.contentContainer.className = `content-container ${view}-view`;
    }

    loadMore() {
        this.state.currentPage++;
        this.loadAnime(this.state.currentTab);
    }

    refreshAnime() {
        this.state.currentPage = 1;
        this.loadAnime(this.state.currentTab);
    }

    setupPeriodicUpdates() {
        this.intervals = [
            setInterval(() => this.updateUI(), 60000)
        ];
    }

    // Limpieza de recursos si fuera necesario
    destroy() {
        this.intervals.forEach(clearInterval);
    }
}

// Manejo de errores global para promesas no capturadas
window.onunhandledrejection = event => {
    console.error('Error no capturado:', event.reason);
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => new OtterPlay());
