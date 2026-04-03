import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorldDetailClient } from "@/app/worlds/[slug]/world-detail-client";
import { getCurrentUser } from "@/lib/auth/session";
import { getSiteBaseUrl } from "@/lib/site-url";
import {
  getPublishedWorldBySlug,
  getWorldLikeCount,
  userLikesWorld,
  worldRowToDetailDto,
  WorldSlugParamSchema,
} from "@/server/services/world-service";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const parsed = WorldSlugParamSchema.safeParse(slug);
  if (!parsed.success) {
    return { title: "World" };
  }
  const row = await getPublishedWorldBySlug(parsed.data);
  if (!row) {
    return { title: "World" };
  }
  const base = getSiteBaseUrl();
  const path = `/worlds/${row.slug}`;
  return {
    title: `${row.title} · Worlds`,
    description: row.subtitle ?? row.description ?? undefined,
    alternates: { canonical: `${base}${path}` },
    openGraph: {
      title: row.title,
      description: row.subtitle ?? row.description ?? undefined,
      url: `${base}${path}`,
    },
  };
}

export default async function WorldDetailPage(props: PageProps) {
  const { slug } = await props.params;
  const parsed = WorldSlugParamSchema.safeParse(slug);
  if (!parsed.success) notFound();
  const row = await getPublishedWorldBySlug(parsed.data);
  if (!row) notFound();
  const likeCount = await getWorldLikeCount(row.id);
  const user = await getCurrentUser();
  const liked =
    user != null ? await userLikesWorld(user.id, row.id) : undefined;
  const dto = worldRowToDetailDto(row, {
    likeCount,
    ...(user != null ? { liked } : {}),
  });
  return (
    <WorldDetailClient
      slug={dto.slug}
      title={dto.title}
      subtitle={dto.subtitle}
      cardTeaser={dto.cardTeaser}
      description={dto.description}
      tags={dto.tags}
      isFeatured={dto.isFeatured}
      forkCount={dto.forkCount}
      likeCount={dto.likeCount}
      coverImageUrl={dto.coverImageUrl}
      coverImageAlt={dto.coverImageAlt}
      likedInitial={dto.liked}
    />
  );
}
