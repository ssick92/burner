import { sql } from "./db";

export type PublicShareMeta = {
  coverImageUrl: string | null;
  note: string | null;
  senderName: string;
  slug: string;
  title: string;
  totalTracks: number;
};

export async function getPublicShareMeta(
  slug: string,
): Promise<PublicShareMeta | null> {
  const normalized = slug.trim();
  if (!normalized) {
    return null;
  }

  try {
    const rows = await sql`
      select
        sl.slug,
        b.title,
        b.sender_name,
        b.note,
        b.cover_image_url,
        b.total_tracks
      from burner_share_links sl
      join burners b on b.id = sl.burner_id
      where sl.slug = ${normalized}
        and sl.revoked_at is null
        and b.is_revoked = false
      limit 1
    `;
    const row = rows[0] as
      | {
          cover_image_url: string | null;
          note: string | null;
          sender_name: string;
          slug: string;
          title: string;
          total_tracks: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      coverImageUrl: row.cover_image_url,
      note: row.note,
      senderName: row.sender_name,
      slug: row.slug,
      title: row.title,
      totalTracks: row.total_tracks,
    };
  } catch {
    return null;
  }
}
