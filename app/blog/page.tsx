import { BlogPage } from "@/components/landing/blog-page";
import Blog from "@/components/landing/Blog";
import {
  getAllPosts,
  getPublicPosts,
  getPublicCategories,
} from "@/lib/blog";

export const metadata = {
  title: "Blog",
  description: "News, tutorials, and updates from the Eliza team",
};

export default function BlogListingPage() {
  const allPosts = getAllPosts();
  const publicPosts = getPublicPosts();
  const categories = getPublicCategories();

  return (
    <BlogPage>
      <Blog allPosts={allPosts} publicPosts={publicPosts} categories={categories} />
    </BlogPage>
  );
}
