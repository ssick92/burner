import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "../../../../../lib/server/auth";
import { sql } from "../../../../../lib/server/db";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getGoogleConfig,
} from "../../../../../lib/server/google-oauth";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "burner_google_oauth_state";

function usernameFromEmail(email: string) {
  return (
    email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
    "burner-sender"
  );
}

function errorRedirect(origin: string, code: string) {
  const url = new URL("/studio", origin);
  url.searchParams.set("auth_error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value ?? "";
  cookieStore.delete(STATE_COOKIE);

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return errorRedirect(origin, oauthError);
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorRedirect(origin, "invalid_state");
  }

  try {
    const config = getGoogleConfig(origin);
    const tokens = await exchangeGoogleCode(config, code);
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    if (!profile.email) {
      return errorRedirect(origin, "no_email");
    }
    const email = profile.email.trim().toLowerCase();
    const displayName =
      profile.name?.trim() ||
      profile.given_name?.trim() ||
      usernameFromEmail(email);

    const existingBySubject = (await sql`
      select id, email, display_name
      from users
      where google_subject = ${profile.sub}
      limit 1
    `) as { id: string; email: string; display_name: string | null }[];

    let user = existingBySubject[0];

    if (!user) {
      const existingByEmail = (await sql`
        select id, email, display_name, google_subject
        from users
        where email = ${email}
        limit 1
      `) as {
        id: string;
        email: string;
        display_name: string | null;
        google_subject: string | null;
      }[];
      const existing = existingByEmail[0];
      if (existing) {
        if (!existing.google_subject) {
          await sql`
            update users
            set google_subject = ${profile.sub}
            where id = ${existing.id}
          `;
        }
        user = {
          id: existing.id,
          email: existing.email,
          display_name: existing.display_name,
        };
      } else {
        const inserted = (await sql`
          insert into users (email, display_name, google_subject)
          values (${email}, ${displayName}, ${profile.sub})
          returning id, email, display_name
        `) as { id: string; email: string; display_name: string | null }[];
        user = inserted[0];
      }
    }

    await sql`
      insert into profiles (id, display_name, username)
      values (${user.id}, ${displayName}, ${usernameFromEmail(email)})
      on conflict (id) do nothing
    `;

    await createSession(user);
    return NextResponse.redirect(new URL("/studio", origin));
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return errorRedirect(origin, "exchange_failed");
  }
}
