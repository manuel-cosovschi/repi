"use client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), magicLinkClient(), twoFactorClient()],
});
