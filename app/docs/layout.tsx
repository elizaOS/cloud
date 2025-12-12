import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './docs.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: {
    default: 'elizaOS Cloud Documentation',
    template: '%s | elizaOS Cloud',
  },
  description: 'Documentation for elizaOS Cloud - The AI Agent Development Platform.',
  keywords: ['elizaOS', 'AI agents', 'cloud platform', 'documentation', 'API'],
}

const navbar = (
  <Navbar
    logo={
      <div className="flex items-center gap-3">
        <div className="relative">
          <Image
            src="/eliza-white.svg"
            alt="elizaOS"
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#ff5800] rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold tracking-tight">elizaOS</span>
          <span className="text-[#ff5800] font-semibold tracking-tight">Cloud</span>
          <span className="text-white/30 text-xs font-medium px-1.5 py-0.5 border border-white/10 bg-white/5">
            DOCS
          </span>
        </div>
      </div>
    }
    projectLink="https://github.com/elizaOS/eliza"
  >
    <Link 
      href="/dashboard" 
      className="flex items-center gap-1.5 text-xs text-white/90 hover:text-white transition-colors px-3 py-1.5 bg-[#ff5800] hover:bg-[#ff6a1a]"
    >
      Dashboard →
    </Link>
  </Navbar>
)

const footer = (
  <Footer>
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
      <div className="flex items-center gap-2">
        <Image
          src="/eliza-white.svg"
          alt="elizaOS"
          width={20}
          height={20}
          className="h-5 w-5 opacity-40"
        />
        <span className="text-white/40 text-xs">
          MIT {new Date().getFullYear()} © elizaOS
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-white/40">
        <Link href="/terms-of-service" className="hover:text-white/80 transition-colors">Terms</Link>
        <Link href="/privacy-policy" className="hover:text-white/80 transition-colors">Privacy</Link>
        <a href="https://github.com/elizaOS/eliza" target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors">GitHub</a>
        <a href="https://discord.gg/elizaos" target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors">Discord</a>
      </div>
    </div>
  </Footer>
)

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pageMap = await getPageMap('/docs')
  
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className="dark">
      <Head>
        <meta name="theme-color" content="#0a0a0a" />
        <link rel="icon" href="/favicon.ico" />
        {/* Critical CSS variable needed before JS loads to prevent IntersectionObserver error */}
        <style dangerouslySetInnerHTML={{ __html: ':root, body { --nextra-navbar-height: 64px; }' }} />
      </Head>
      <body className="bg-[#0a0a0a] antialiased" style={{ ['--nextra-navbar-height' as any]: '64px' }}>
        <Layout
          navbar={navbar}
          pageMap={pageMap}
          docsRepositoryBase="https://github.com/elizaOS/eliza/tree/main/docs"
          footer={footer}
          sidebar={{ 
            defaultMenuCollapseLevel: 1,
            toggleButton: true,
          }}
          editLink="Edit this page"
          feedback={{ content: 'Question? Give us feedback →' }}
          navigation={true}
          darkMode={true}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
