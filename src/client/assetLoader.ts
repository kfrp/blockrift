/**
 * AssetLoader - Preloads critical game assets (images and fonts)
 * Implements retry logic for failed asset loads
 */

interface AssetConfig {
  url: string;
  type: "image" | "font";
}

export class AssetLoader {
  private readonly REQUIRED_ASSETS: AssetConfig[] = [
    { url: "/assets/menu2.png", type: "image" },
    { url: "/assets/title6.png", type: "image" },
    { url: "/assets/ari-w9500.ttf", type: "font" },
  ];

  private readonly MAX_RETRIES = 3;

  /**
   * Load all required assets in parallel
   * @throws Error if any asset fails to load after max retries
   */
  async loadAssets(): Promise<void> {
    const promises = this.REQUIRED_ASSETS.map((asset) =>
      this.loadAssetWithRetry(asset)
    );
    await Promise.all(promises);
  }

  /**
   * Load a single asset with retry logic
   */
  private async loadAssetWithRetry(asset: AssetConfig): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await this.loadAsset(asset);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Failed to load ${asset.url} (attempt ${attempt}/${this.MAX_RETRIES})`,
          error
        );

        // Wait before retrying (exponential backoff)
        if (attempt < this.MAX_RETRIES) {
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to load ${asset.url} after ${this.MAX_RETRIES} attempts: ${lastError?.message}`
    );
  }

  /**
   * Load a single asset based on its type
   */
  private loadAsset(asset: AssetConfig): Promise<void> {
    if (asset.type === "font") {
      return this.loadFont(asset.url);
    } else {
      return this.loadImage(asset.url);
    }
  }

  /**
   * Preload an image
   */
  private loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /**
   * Preload a font using the FontFace API
   */
  private loadFont(url: string): Promise<void> {
    const fontFace = new FontFace("Minecraft", `url(${url})`);
    return fontFace
      .load()
      .then((loaded) => {
        (document.fonts as any).add(loaded);
      })
      .catch((error) => {
        throw new Error(`Failed to load font: ${url} - ${error.message}`);
      });
  }

  /**
   * Utility function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
