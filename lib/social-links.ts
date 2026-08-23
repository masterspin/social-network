export type SocialLinkEntryMode = "manual" | "verified-sign-in";
export type DashboardTab = "network" | "inbox" | "profile";

type SocialLinkRowInput = {
  platform: string;
  url: string;
};

type SocialVerificationRowInput = {
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  profile_url: string | null;
};

export type SocialDisplayRow = {
  platform: string;
  label: string;
  url: string | null;
  verified: boolean;
};

export const VERIFIABLE_SOCIAL_PROVIDERS: Record<
  string,
  "linkedin" | "discord"
> = {
  LinkedIn: "linkedin",
  Discord: "discord",
};

export function getSocialLinkEntryMode(platform: string): SocialLinkEntryMode {
  return VERIFIABLE_SOCIAL_PROVIDERS[platform]
    ? "verified-sign-in"
    : "manual";
}

export function getInitialDashboardTab(search: string): DashboardTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "profile" || tab === "inbox" ? tab : "network";
}

export function getVerifiedSocialRows({
  links,
  verifications,
}: {
  links: SocialLinkRowInput[];
  verifications: SocialVerificationRowInput[];
}): SocialDisplayRow[] {
  const linkedPlatforms = new Set(links.map((link) => link.platform));

  return verifications.flatMap((verification) => {
    const platform = Object.entries(VERIFIABLE_SOCIAL_PROVIDERS).find(
      ([, provider]) => provider === verification.provider,
    )?.[0];

    if (!platform || linkedPlatforms.has(platform)) return [];

    return [
      {
        platform,
        label:
          verification.display_name ||
          verification.provider_account_id,
        url: verification.profile_url,
        verified: true,
      },
    ];
  });
}
