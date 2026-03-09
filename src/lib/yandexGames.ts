export type YGLeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
};

type InitResult = {
  ready: boolean;
  playerName?: string;
};

class YandexGamesService {
  ysdk: any = null;
  player: any = null;
  ready = false;

  async init(): Promise<InitResult> {
    if (this.ready && this.ysdk) {
      return { ready: true, playerName: this.getPlayerName() };
    }
    try {
      if (typeof window === 'undefined' || !(window as any).YaGames) {
        return { ready: false };
      }
      this.ysdk = await (window as any).YaGames.init();
      this.ready = true;
      try {
        this.player = await this.ysdk.getPlayer({ scopes: false });
      } catch {
        this.player = null;
      }
      return { ready: true, playerName: this.getPlayerName() };
    } catch {
      this.ready = false;
      return { ready: false };
    }
  }

  getPlayerName(): string {
    try {
      return this.player?.getName?.() || 'Игрок';
    } catch {
      return 'Игрок';
    }
  }

  async refreshPlayerName(): Promise<string | undefined> {
    if (!this.ysdk) return undefined;
    try {
      this.player = await this.ysdk.getPlayer({ scopes: false });
      return this.getPlayerName();
    } catch {
      return undefined;
    }
  }

  async markReady() {
    try { await this.ysdk?.features?.LoadingAPI?.ready?.(); } catch {}
  }

  async startGameplay() {
    try { await this.ysdk?.features?.GameplayAPI?.start?.(); } catch {}
  }

  async stopGameplay() {
    try { await this.ysdk?.features?.GameplayAPI?.stop?.(); } catch {}
  }

  async openAuthDialog(): Promise<boolean> {
    try {
      if (!this.ysdk?.auth?.openAuthDialog) return false;
      await this.ysdk.auth.openAuthDialog();
      this.player = await this.ysdk.getPlayer({ scopes: true });
      return true;
    } catch {
      return false;
    }
  }

  async loadGameData<T extends object>(keys?: string[]): Promise<T | null> {
    try {
      if (!this.player) return null;
      const data = await this.player.getData(keys);
      return (data ?? null) as T | null;
    } catch {
      return null;
    }
  }

  async saveGameData(data: object) {
    try {
      if (!this.player) return;
      await this.player.setData(data, true);
    } catch {}
  }

  async saveStats(stats: Record<string, number>) {
    try {
      if (!this.player) return;
      await this.player.setStats(stats);
    } catch {}
  }

  async getLeaderboardEntries(name: string, quantityTop = 5): Promise<YGLeaderboardEntry[]> {
    try {
      if (!this.ysdk) return [];
      const lb = await this.ysdk.getLeaderboards();
      if (!lb) return [];
      const res = await lb.getLeaderboardEntries(name, { quantityTop, includeUser: false, quantityAround: 0 });
      const entries: any[] = res?.entries || [];
      return entries.map((entry: any, index: number) => ({
        rank: typeof entry.rank === 'number' ? entry.rank : index + 1,
        name: entry.player?.publicName || entry.player?.uniqueID?.slice(0, 8) || 'Игрок',
        score: Number(entry.score || 0),
      }));
    } catch {
      return [];
    }
  }

  async setLeaderboardScore(name: string, score: number) {
    try {
      if (!this.ysdk) return;
      const lb = await this.ysdk.getLeaderboards();
      if (!lb) return;
      await lb.setLeaderboardScore(name, score);
    } catch {}
  }

  async showFullscreenAd(): Promise<boolean> {
    try {
      if (!this.ysdk?.adv?.showFullscreenAdv) return false;
      return await new Promise<boolean>((resolve) => {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => resolve(true),
            onClose: () => resolve(true),
            onError: () => resolve(false),
            onOffline: () => resolve(false),
          },
        });
      });
    } catch {
      return false;
    }
  }

  async showRewardedAd(): Promise<boolean> {
    try {
      if (!this.ysdk?.adv?.showRewardedVideo) return false;
      return await new Promise<boolean>((resolve) => {
        let rewarded = false;
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => { rewarded = true; },
            onClose: () => resolve(rewarded),
            onError: () => resolve(false),
            onOpen: () => undefined,
          },
        });
      });
    } catch {
      return false;
    }
  }
}

export const yandexGames = new YandexGamesService();
