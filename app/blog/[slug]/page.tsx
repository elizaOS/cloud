import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getPostBySlug, getAllSlugs, getPostsBySlugs } from "@/lib/blog";
import { BlogPage } from "@/components/landing/blog-page";
import BlogPost from "@/components/landing/BlogPost";
import RelatedPosts from "@/components/landing/RelatedPosts";
import Tweet from "@/components/landing/Tweet";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  const ogImage = post.image || "/cloudlogo.png";

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = post.relatedPosts
    ? getPostsBySlugs(post.relatedPosts)
    : [];

  return (
    <BlogPage>
      <BlogPost
        title={post.title}
        date={post.date}
        author={post.author}
        category={post.category}
        image={post.image}
      >
        <MDXRemote
          source={post.content}
          components={{ Tweet }}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
            },
          }}
        />
      </BlogPost>
      {relatedPosts.length > 0 && (
        <div className="w-full bg-black px-6">
          <RelatedPosts posts={relatedPosts} />
        </div>
      )}
    </BlogPage>
  );
}
