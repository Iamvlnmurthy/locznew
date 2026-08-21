export interface PublicBrand {
  readonly key: string;
  readonly displayName: string;
  readonly logoAsset: string;
  readonly sourceUrl: string;
  readonly aliases: readonly string[];
  readonly blockedSuffixes?: readonly string[];
}

export declare const PUBLIC_BRANDS: readonly PublicBrand[];
export declare function normalizeBusinessName(value: string): string;
export declare function findPublicBrand(name: string): PublicBrand | null;
export declare function publicBrandLogo(name: string, brandKey?: string | null): string | null;
